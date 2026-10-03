import { loadOrComputeDetail } from "@/lib/results";
import { FEC_API_BASE, FEC_API_KEY, MIN_RECEIPTS, SPECIAL_ELECTIONS, ttlFor } from "@/config";
import type { Categories } from "@/components/finance";
import { recordDiag, setSharedCacheOnline, supabase, withTimeout } from "@/lib/supabase";
import { useSyncExternalStore } from "react";

const GAP = 4000; // 1,000 calls/hour limit → space uncached calls 4s apart
const PAUSE_429 = 10 * 60 * 1000;
let queue: Promise<unknown> = Promise.resolve();
let lastCall = 0;

export class DataUnavailable extends Error {}

// ---- FEC rate status, observable from React ----
type FecStatus = { paused: boolean; remaining: number | null };
let status: FecStatus = { paused: false, remaining: null };
const listeners = new Set<() => void>();
function setStatus(p: Partial<FecStatus>) { status = { ...status, ...p }; listeners.forEach((l) => l()); }
const initialStatus: FecStatus = { paused: false, remaining: null };
export function useFecStatus() {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => status, () => initialStatus);
}

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

async function fecGet<T = any>(path: string, params: Record<string, string | number>, cycle: number): Promise<T> {
  const query = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString();
  const cacheKey = `${path}?${query}`; // request path + query, never the api_key
  const cached = await cacheGet<T>(cacheKey, cycle);
  if (cached !== undefined) return cached;
  const url = `${FEC_API_BASE}${path}?${query}&api_key=${encodeURIComponent(FEC_API_KEY)}`;
  const run = queue.then(async () => {
    for (;;) {
      const wait = lastCall + GAP - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      lastCall = Date.now();
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

export type CandidateSummary = { id: string; name: string; party: string; state: string; stateName: string; receipts: number };

export async function fetchCandidates(cycle: number): Promise<CandidateSummary[]> {
  const out: CandidateSummary[] = [];
  for (let page = 1; page < 20; page++) {
    const json = await fecGet<any>("/candidates/totals/", { election_year: cycle, office: "S", per_page: 100, sort: "-receipts", page }, cycle);
    const rows: any[] = json?.results ?? [];
    let stop = rows.length === 0;
    for (const r of rows) {
      const receipts = num(r.receipts);
      if (!r.candidate_id || !r.state || receipts === null) { console.warn("FEC candidate row has unexpected shape", r); continue; }
      if (receipts <= MIN_RECEIPTS) { stop = true; continue; }
      if (out.some((c) => c.id === r.candidate_id)) continue;
      out.push({ id: r.candidate_id, name: titleName(r.name ?? r.candidate_id), party: r.party_full ?? r.party ?? "", state: r.state, stateName: r.state_full ?? r.state, receipts });
    }
    if (stop || page >= (json?.pagination?.pages ?? 1)) break;
  }
  return out;
}

export const candidatesQuery = (cycle: number) => ({
  queryKey: ["fec-candidates", cycle], queryFn: () => fetchCandidates(cycle), staleTime: Infinity, retry: 1,
});
export const detailQuery = (c: CandidateSummary, cycle: number) => ({
  queryKey: ["fec-detail", cycle, c.id], queryFn: () => loadOrComputeDetail(c, cycle), staleTime: Infinity, retry: 0,
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
};

export async function fetchCandidateDetail(id: string, raceState: string, cycle: number): Promise<CandidateDetail> {
  const totals = await fecGet<any>(`/candidate/${id}/totals/`, { cycle }, cycle);
  const t = totals?.results?.[0];
  const f = {
    receipts: num(t?.receipts), itemized: num(t?.individual_itemized_contributions), unitemized: num(t?.individual_unitemized_contributions),
    pac: num(t?.other_political_committee_contributions), party: num(t?.political_party_committee_contributions), self: num(t?.candidate_contribution),
  };
  if (Object.values(f).some((v) => v === null) || !f.receipts) {
    console.warn("FEC totals: unexpected fields", totals);
    throw new DataUnavailable("data unavailable");
  }
  const byState = await fecGet<any>("/schedules/schedule_a/by_state/by_candidate/", { candidate_id: id, cycle, per_page: 100 }, cycle);
  const rows: any[] = byState?.results ?? [];
  const donorStates: DonorState[] = [];
  for (const r of rows) {
    const total = num(r.total);
    if (!r.state || total === null) { console.warn("FEC by_state: unexpected row", byState); throw new DataUnavailable("data unavailable"); }
    donorStates.push({ state: r.state, name: r.state_full ?? r.state, total, count: num(r.count) ?? 0 });
  }
  donorStates.sort((a, b) => b.total - a.total);
  const stateSum = donorStates.reduce((s, d) => s + d.total, 0);
  const inSum = donorStates.filter((d) => d.state === raceState).reduce((s, d) => s + d.total, 0);
  const inFrac = stateSum > 0 ? inSum / stateSum : null;
  const itemized = f.itemized!;
  const inStateItemized = inFrac === null ? 0 : itemized * inFrac;
  const outStateItemized = inFrac === null ? 0 : itemized - inStateItemized;
  const R = f.receipts!;
  const pct = (v: number) => Math.max(0, (v / R) * 100);
  const other = Math.max(0, R - itemized - f.unitemized! - f.pac! - f.party!);
  return {
    receipts: R, itemized, inStateItemized, outStateItemized,
    outShare: inFrac === null ? null : (1 - inFrac) * 100,
    categories: { inState: pct(inStateItemized), outOfState: pct(outStateItemized), unknown: pct(f.unitemized!), pacs: pct(f.pac!), party: pct(f.party!), other: pct(other) },
    donorStates,
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
