import { loadOrComputeDetail } from "@/lib/results";
import { FEC_API_BASE, FEC_API_KEY, MIN_RECEIPTS, SPECIAL_ELECTIONS, ttlFor, type Chamber } from "@/config";
import type { Categories } from "@/components/finance";
import { recordDiag, setSharedCacheOnline, supabase, withTimeout } from "@/lib/supabase";
import { useSyncExternalStore } from "react";

const GAP = 250; // spacing between uncached calls; HOUR_CAP protects the key
const HOUR_CAP = 950;
const PAUSE_429 = 10 * 60 * 1000;
let queue: Promise<unknown> = Promise.resolve();
let lastCall = 0;
const callTimes: number[] = [];

export class DataUnavailable extends Error {}

// ---- FEC rate status, observable from React ----
type FecStatus = { paused: boolean; remaining: number | null; usedHour: number };
let status: FecStatus = { paused: false, remaining: null, usedHour: 0 };
const listeners = new Set<() => void>();
function setStatus(p: Partial<FecStatus>) { status = { ...status, ...p }; listeners.forEach((l) => l()); }
const initialStatus: FecStatus = { paused: false, remaining: null, usedHour: 0 };
export function useFecStatus() {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => status, () => initialStatus);
}
function pruneCalls() { const cut = Date.now() - 3600_000; while (callTimes.length && callTimes[0]! < cut) callTimes.shift(); }

// ---- Two-level cache (localStorage, then shared fec_cache) ----
async function sharedGet(cacheKey: string, ttl: number): Promise<unknown | undefined> {
  try {
    const { data, error } = await withTimeout(
      supabase.from("fec_cache").select("payload, fetched_at").eq("cache_key", cacheKey).maybeSingle(),
    );
    if (error) { setSharedCacheOnline(false); recordDiag({ error: error.message }); return undefined; }
    setSharedCacheOnline(true);
    if (data) recordDiag({ read: 1 });
    if (data && Date.now() - new Date(data.fetched_at as string).getTime() < ttl) return data.payload;
  } catch { setSharedCacheOnline(false); }
  return undefined;
}

async function sharedPut(cacheKey: string, payload: unknown) {
  try {
    const { error } = await withTimeout(
      supabase.from("fec_cache").upsert({ cache_key: cacheKey, payload, fetched_at: new Date().toISOString() }, { onConflict: "cache_key" }),
    );
    setSharedCacheOnline(!error);
    recordDiag(error ? { error: error.message } : { written: 1 });
  } catch (e) { setSharedCacheOnline(false); recordDiag({ error: (e as Error).message }); }
}

export async function cacheGet<T = unknown>(cacheKey: string, cycle: number): Promise<T | undefined> {
  const ttl = ttlFor(cycle);
  const key = `fec:${cacheKey}`;
  try {
    const hit = localStorage.getItem(key);
    if (hit) {
      const { t, data } = JSON.parse(hit);
      if (Date.now() - t < ttl) return data as T;
    }
  } catch { /* ignore */ }
  const shared = await sharedGet(cacheKey, ttl);
  if (shared !== undefined) {
    try { localStorage.setItem(key, JSON.stringify({ t: Date.now(), data: shared })); } catch { /* quota */ }
    return shared as T;
  }
  return undefined;
}

export function cachePut(cacheKey: string, data: unknown) {
  try { localStorage.setItem(`fec:${cacheKey}`, JSON.stringify({ t: Date.now(), data })); } catch { /* quota */ }
  void sharedPut(cacheKey, data);
}

export async function fecGet<T = any>(path: string, params: Record<string, string | number>, cycle: number): Promise<T> {
  const query = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString();
  const cacheKey = `${path}?${query}`; // request path + query, never the api_key
  const cached = await cacheGet<T>(cacheKey, cycle);
  if (cached !== undefined) return cached;
  const url = `${FEC_API_BASE}${path}?${query}&api_key=${encodeURIComponent(FEC_API_KEY)}`;
  const run = queue.then(async () => {
    for (;;) {
      const wait = lastCall + GAP - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      pruneCalls();
      if (callTimes.length >= HOUR_CAP) { await new Promise((r) => setTimeout(r, callTimes[0]! + 3600_000 - Date.now() + 100)); continue; }
      lastCall = Date.now();
      callTimes.push(lastCall);
      setStatus({ usedHour: callTimes.length });
      const res = await fetch(url);
      const rem = res.headers.get("X-RateLimit-Remaining");
      if (rem !== null && !isNaN(Number(rem))) setStatus({ remaining: Number(rem) });
      if (res.status === 429) {
        setStatus({ paused: true, remaining: 0 });
        await new Promise((r) => setTimeout(r, PAUSE_429));
        setStatus({ paused: false });
        continue;
      }
      if (!res.ok) throw new DataUnavailable(`FEC request failed (${res.status})`);
      return res.json();
    }
  });
  queue = run.catch(() => undefined);
  const data = (await run) as T;
  cachePut(cacheKey, data);
  return data;
}

const num = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" && v !== "" && !isNaN(Number(v)) ? Number(v) : null);

export type CandidateSummary = { id: string; name: string; party: string; state: string; stateName: string; receipts: number; district?: string | undefined };

export async function fetchCandidates(cycle: number, office: "S" | "H" = "S", state?: string): Promise<CandidateSummary[]> {
  const out: CandidateSummary[] = [];
  for (let page = 1; page < 20; page++) {
    const params: Record<string, string | number> = { election_year: cycle, office, per_page: 100, sort: "-receipts", page };
    if (state) params["state"] = state;
    const json = await fecGet<any>("/candidates/totals/", params, cycle);
    const rows: any[] = json?.results ?? [];
    let stop = rows.length === 0;
    for (const r of rows) {
      const receipts = num(r.receipts);
      if (!r.candidate_id || !r.state || receipts === null) { console.warn("FEC candidate row has unexpected shape", r); continue; }
      if (receipts <= MIN_RECEIPTS) { stop = true; continue; }
      if (out.some((c) => c.id === r.candidate_id)) continue;
      out.push({ id: r.candidate_id, name: titleName(r.name ?? r.candidate_id), party: r.party_full ?? r.party ?? "", state: r.state, stateName: r.state_full ?? r.state, receipts, district: office === "H" ? await houseDistrict(r, cycle) : undefined });
    }
    if (stop || page >= (json?.pagination?.pages ?? 1)) break;
  }
  return out;
}

async function houseDistrict(r: any, cycle: number): Promise<string | undefined> {
  const pad = (v: unknown) => (v === null || v === undefined || v === "" ? undefined : String(v).padStart(2, "0"));
  const direct = pad(r.district);
  if (direct) return direct;
  const info = await fecGet<any>(`/candidate/${r.candidate_id}/`, {}, cycle);
  const d = pad(info?.results?.[0]?.district);
  if (!d) console.warn("FEC: district missing for House candidate", r, info);
  return d;
}

export const houseCandidatesQuery = (state: string, cycle: number) => ({
  queryKey: ["fec-house-candidates", cycle, state], queryFn: () => fetchCandidates(cycle, "H", state), staleTime: Infinity, retry: 1,
});

export const candidatesQuery = (cycle: number) => ({
  queryKey: ["fec-candidates", cycle], queryFn: () => fetchCandidates(cycle), staleTime: Infinity, retry: 1,
});
export const detailQuery = (c: CandidateSummary, cycle: number, chamber: Chamber = "senate") => ({
  queryKey: ["fec-detail", chamber, cycle, c.id], queryFn: () => loadOrComputeDetail(c, cycle, chamber), staleTime: Infinity, retry: 0,
});

export type Race = { state: string; stateName: string; total: number; special: boolean; candidates: CandidateSummary[] };
export function groupRaces(cands: CandidateSummary[], cycle: number): Race[] {
  const specials = SPECIAL_ELECTIONS[cycle] ?? [];
  const map = new Map<string, Race>();
  for (const c of cands) {
    const r = map.get(c.state) ?? { state: c.state, stateName: c.stateName, total: 0, special: specials.includes(c.state), candidates: [] };
    r.total += c.receipts; r.candidates.push(c); map.set(c.state, r);
  }
  return [...map.values()].sort((a, b) => a.stateName.localeCompare(b.stateName));
}

export type DonorState = { state: string; name: string; total: number; count: number };
export type CandidateDetail = {
  receipts: number; itemized: number; inStateItemized: number; outStateItemized: number;
  outShare: number | null; categories: Categories; donorStates: DonorState[];
  /** Sum of donor-state rows (dollars) and whether it is within 5% of individual_itemized_contributions. */
  donorStateSum: number; reconciles: boolean; committeeId: string | null;
};

export const CALC_VERSION = 2;
export const RECONCILE_TOLERANCE = 0.05;
export const reconciles = (stateSum: number, itemized: number) =>
  itemized > 0 ? Math.abs(stateSum - itemized) / itemized <= RECONCILE_TOLERANCE : stateSum === 0;

/** Everything comes from the candidate's principal campaign committee (calc_version 2). */
export async function fetchCandidateDetail(id: string, raceState: string, cycle: number): Promise<CandidateDetail> {
  const cm = await fecGet<any>(`/candidate/${id}/committees/`, { cycle, designation: "P" }, cycle);
  const cmte: string | undefined = cm?.results?.[0]?.committee_id;
  if (!cmte) { console.warn("FEC: no principal committee", id, cm); throw new DataUnavailable("data unavailable"); }
  const totals = await fecGet<any>(`/committee/${cmte}/totals/`, { cycle }, cycle);
  const t = totals?.results?.[0];
  const f = {
    receipts: num(t?.receipts), itemized: num(t?.individual_itemized_contributions), unitemized: num(t?.individual_unitemized_contributions),
    pac: num(t?.other_political_committee_contributions), party: num(t?.political_party_committee_contributions), self: num(t?.candidate_contribution),
  };
  if (Object.values(f).some((v) => v === null) || !f.receipts) {
    console.warn("FEC committee totals: unexpected fields", totals);
    throw new DataUnavailable("data unavailable");
  }
  const loans = num(t?.loans_made_by_candidate);
  if (loans === null) console.warn("FEC committee totals: loans_made_by_candidate missing; counted under Transfers & other", t);
  const donorStates: DonorState[] = [];
  for (let page = 1; page < 10; page++) {
    const byState = await fecGet<any>("/schedules/schedule_a/by_state/", { committee_id: cmte, cycle, per_page: 100, page }, cycle);
    const rows: any[] = byState?.results ?? [];
    for (const r of rows) {
      const total = num(r.total);
      if (!r.state || total === null) { console.warn("FEC by_state: unexpected row", byState); throw new DataUnavailable("data unavailable"); }
      donorStates.push({ state: r.state, name: r.state_full ?? r.state, total, count: num(r.count) ?? 0 });
    }
    if (page >= (byState?.pagination?.pages ?? 1)) break;
  }
  donorStates.sort((a, b) => b.total - a.total);
  const stateSum = donorStates.reduce((s, d) => s + d.total, 0);
  const inS = donorStates.filter((d) => d.state === raceState).reduce((s, d) => s + d.total, 0);
  const outS = stateSum - inS; // every other row, incl. AA/AE/AP/ZZ and territories
  const itemized = f.itemized!;
  const ok = reconciles(stateSum, itemized);
  if (!ok) console.warn(`Totals don't reconcile for ${id} (${cmte}): donor-state rows $${stateSum.toFixed(2)} vs individual_itemized_contributions $${itemized.toFixed(2)}`);
  const R = f.receipts!;
  const selfFunding = f.self! + (loans ?? 0);
  const pct = (v: number) => Math.max(0, (v / R) * 100);
  const transfers = Math.max(0, R - inS - outS - f.unitemized! - f.pac! - f.party! - selfFunding);
  return {
    receipts: R, itemized, inStateItemized: inS, outStateItemized: outS,
    outShare: stateSum > 0 ? (outS / stateSum) * 100 : null,
    categories: { inState: pct(inS), outOfState: pct(outS), unknown: pct(f.unitemized!), pacs: pct(f.pac!), party: pct(f.party!), self: pct(selfFunding), transfers: pct(transfers) },
    donorStates, donorStateSum: stateSum, reconciles: ok, committeeId: cmte,
  };
}

// ---- Fully computed leaderboard summaries (used by Trends) ----
export type CycleSummary = { cycle: number; computedAt: string; rows: { id: string; outShare: number | null }[] };
export const summaryKey = (cycle: number) => `outside-money/leaderboard?cycle=${cycle}`;
export const getCycleSummary = (cycle: number) => cacheGet<CycleSummary>(summaryKey(cycle), cycle);
export const saveCycleSummary = (s: CycleSummary) => cachePut(summaryKey(s.cycle), s);

export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

function titleName(raw: string) {
  const [last, first] = raw.split(",").map((s) => s.trim());
  const cap = (s: string) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\s+/g, " ");
  return first && last ? `${cap(first)} ${cap(last)}` : cap(raw);
}
