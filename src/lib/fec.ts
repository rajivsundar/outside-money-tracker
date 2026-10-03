import { CYCLE, FEC_API_BASE, FEC_API_KEY, MIN_RECEIPTS } from "@/config";
import type { Categories } from "@/components/finance";
import { setSharedCacheOnline, supabase, withTimeout } from "@/lib/supabase";

const TTL = 24 * 60 * 60 * 1000;
const GAP = 300;
let queue: Promise<unknown> = Promise.resolve();
let lastCall = 0;

export class DataUnavailable extends Error {}

async function sharedGet(cacheKey: string): Promise<unknown | undefined> {
  try {
    const { data, error } = await withTimeout(
      supabase.from("fec_cache").select("payload, fetched_at").eq("cache_key", cacheKey).maybeSingle(),
    );
    if (error) { setSharedCacheOnline(false); return undefined; }
    setSharedCacheOnline(true);
    if (data && Date.now() - new Date(data.fetched_at as string).getTime() < TTL) return data.payload;
  } catch { setSharedCacheOnline(false); }
  return undefined;
}

async function sharedPut(cacheKey: string, payload: unknown) {
  try {
    const { error } = await withTimeout(
      supabase.from("fec_cache").upsert({ cache_key: cacheKey, payload, fetched_at: new Date().toISOString() }),
    );
    setSharedCacheOnline(!error);
  } catch { setSharedCacheOnline(false); }
}

async function fecGet<T = any>(path: string, params: Record<string, string | number>): Promise<T> {
  const query = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString();
  const cacheKey = `${path}?${query}`; // request path + query, never the api_key
  const url = `${FEC_API_BASE}${path}?${query}&api_key=${encodeURIComponent(FEC_API_KEY)}`;
  const key = `fec:${cacheKey}`;
  try {
    const hit = localStorage.getItem(key);
    if (hit) {
      const { t, data } = JSON.parse(hit);
      if (Date.now() - t < TTL) return data;
    }
  } catch { /* ignore */ }
  const shared = await sharedGet(cacheKey);
  if (shared !== undefined) {
    try { localStorage.setItem(key, JSON.stringify({ t: Date.now(), data: shared })); } catch { /* quota */ }
    return shared as T;
  }
  const run = queue.then(async () => {
    const wait = lastCall + GAP - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastCall = Date.now();
    const res = await fetch(url);
    if (!res.ok) throw new DataUnavailable(`FEC request failed (${res.status})`);
    return res.json();
  });
  queue = run.catch(() => undefined);
  const data = (await run) as T;
  try { localStorage.setItem(key, JSON.stringify({ t: Date.now(), data })); } catch { /* quota */ }
  void sharedPut(cacheKey, data);
  return data;
}

const num = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" && v !== "" && !isNaN(Number(v)) ? Number(v) : null);

export type CandidateSummary = { id: string; name: string; party: string; state: string; stateName: string; receipts: number };

export async function fetchCandidates(): Promise<CandidateSummary[]> {
  const out: CandidateSummary[] = [];
  for (let page = 1; page < 20; page++) {
    const json = await fecGet<any>("/candidates/totals/", { election_year: CYCLE, office: "S", per_page: 100, sort: "-receipts", page });
    const rows: any[] = json?.results ?? [];
    let stop = rows.length === 0;
    for (const r of rows) {
      const receipts = num(r.receipts);
      if (!r.candidate_id || !r.state || receipts === null) { console.warn("FEC candidate row has unexpected shape", r); continue; }
      if (receipts <= MIN_RECEIPTS) { stop = true; continue; }
      out.push({ id: r.candidate_id, name: titleName(r.name ?? r.candidate_id), party: r.party_full ?? r.party ?? "", state: r.state, stateName: r.state_full ?? r.state, receipts });
    }
    if (stop || page >= (json?.pagination?.pages ?? 1)) break;
  }
  return out;
}

export type Race = { state: string; stateName: string; total: number; candidates: CandidateSummary[] };
export function groupRaces(cands: CandidateSummary[]): Race[] {
  const map = new Map<string, Race>();
  for (const c of cands) {
    const r = map.get(c.state) ?? { state: c.state, stateName: c.stateName, total: 0, candidates: [] };
    r.total += c.receipts; r.candidates.push(c); map.set(c.state, r);
  }
  return [...map.values()].sort((a, b) => a.stateName.localeCompare(b.stateName));
}

export type DonorState = { state: string; name: string; total: number; count: number };
export type CandidateDetail = {
  receipts: number; itemized: number; inStateItemized: number; outStateItemized: number;
  outShare: number | null; categories: Categories; donorStates: DonorState[];
};

export async function fetchCandidateDetail(id: string, raceState: string): Promise<CandidateDetail> {
  const totals = await fecGet<any>(`/candidate/${id}/totals/`, { cycle: CYCLE });
  const t = totals?.results?.[0];
  const f = {
    receipts: num(t?.receipts), itemized: num(t?.individual_itemized_contributions), unitemized: num(t?.individual_unitemized_contributions),
    pac: num(t?.other_political_committee_contributions), party: num(t?.political_party_committee_contributions), self: num(t?.candidate_contribution),
  };
  if (Object.values(f).some((v) => v === null) || !f.receipts) {
    console.warn("FEC totals: unexpected fields", totals);
    throw new DataUnavailable("data unavailable");
  }
  const byState = await fecGet<any>("/schedules/schedule_a/by_state/by_candidate/", { candidate_id: id, cycle: CYCLE, per_page: 100 });
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

function titleName(raw: string) {
  const [last, first] = raw.split(",").map((s) => s.trim());
  const cap = (s: string) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\s+/g, " ");
  return first && last ? `${cap(first)} ${cap(last)}` : cap(raw);
}
