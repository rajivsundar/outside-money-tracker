// Computed per-candidate results stored in the user's external Supabase project.
// Pages read these first; only uncomputed candidates call the FEC.
import { SPECIAL_ELECTIONS, type Chamber } from "@/config";
import { fetchCandidateDetail, median, type CandidateDetail, type CandidateSummary } from "@/lib/fec";
import { recordDiag, setSharedCacheOnline, supabase, withTimeout } from "@/lib/supabase";

const n = (v: unknown) => (v === null || v === undefined || v === "" || isNaN(Number(v)) ? null : Number(v));

async function safe<T>(label: string, p: PromiseLike<{ data: T | null; error: { message: string } | null }>): Promise<T | null> {
  try {
    const { data, error } = await withTimeout(p);
    if (error) { recordDiag({ error: `${label}: ${error.message}` }); setSharedCacheOnline(false); return null; }
    setSharedCacheOnline(true);
    return data;
  } catch (e) { recordDiag({ error: `${label}: ${(e as Error).message}` }); setSharedCacheOnline(false); return null; }
}

const T = (ch: Chamber) => ch === "house" ? { res: "house_results", orig: "house_origin_state" } : { res: "senate_results", orig: "senate_origin_state" };

export async function readResult(id: string, cycle: number, chamber: Chamber = "senate"): Promise<CandidateDetail | null> {
  const t = T(chamber);
  const row = await safe<any>(`${t.res} read`, supabase.from(t.res).select("*").eq("cand_id", id).eq("cycle", cycle).maybeSingle());
  if (!row) return null;
  const origins = await safe<any[]>(`${t.orig} read`, supabase.from(t.orig).select("donor_state, amount, contributions").eq("cand_id", id).eq("cycle", cycle));
  if (!origins) return null;
  const R = n(row.receipts), itemized = n(row.itemized_indiv), unit = n(row.unitemized_indiv), pac = n(row.pac), party = n(row.party_total), other = n(row.self_and_other), inS = n(row.in_state), outS = n(row.out_of_state);
  if ([R, itemized, unit, pac, party, other, inS, outS].some((v) => v === null) || !R) { console.warn("senate_results: unexpected row", row); return null; }
  recordDiag({ read: 1 + origins.length });
  const pct = (v: number) => Math.max(0, (v / R) * 100);
  return {
    receipts: R, itemized: itemized!, inStateItemized: inS!, outStateItemized: outS!,
    outShare: n(row.out_of_state_share),
    categories: { inState: pct(inS!), outOfState: pct(outS!), unknown: pct(unit!), pacs: pct(pac!), party: pct(party!), other: pct(other!) },
    donorStates: origins.map((o) => ({ state: o.donor_state, name: o.donor_state, total: Number(o.amount), count: Number(o.contributions ?? 0) })).sort((a, b) => b.total - a.total),
  };
}

export async function writeResult(c: CandidateSummary, cycle: number, d: CandidateDetail, chamber: Chamber = "senate") {
  const t = T(chamber);
  const R = d.receipts, c2 = d.categories;
  const dollars = (p: number) => (p / 100) * R;
  const extra = chamber === "house" ? { district: c.district ?? null } : { special_election: (SPECIAL_ELECTIONS[cycle] ?? []).includes(c.state) };
  const res = await safe(`${t.res} write`, supabase.from(t.res).upsert({
    ...extra, cand_id: c.id, cycle, state: c.state, name: c.name, party: c.party, receipts: R,
    itemized_indiv: d.itemized, unitemized_indiv: dollars(c2.unknown), pac: dollars(c2.pacs), party_total: dollars(c2.party),
    self_and_other: dollars(c2.other), in_state: d.inStateItemized, out_of_state: d.outStateItemized,
    out_of_state_share: d.outShare,
    computed_at: new Date().toISOString(),
  }, { onConflict: "cand_id,cycle" }).select("cand_id"));
  if (res === null) return;
  recordDiag({ written: 1 });
  if (d.donorStates.length) {
    const o = await safe(`${t.orig} write`, supabase.from(t.orig).upsert(
      d.donorStates.map((s) => ({ cand_id: c.id, cycle, donor_state: s.state, amount: s.total, contributions: Math.round(s.count) })),
      { onConflict: "cand_id,cycle,donor_state" },
    ).select("donor_state"));
    if (o) recordDiag({ written: d.donorStates.length });
  }
}

export async function loadOrComputeDetail(c: CandidateSummary, cycle: number, chamber: Chamber = "senate"): Promise<CandidateDetail> {
  const stored = await readResult(c.id, cycle, chamber);
  if (stored) return stored;
  const d = await fetchCandidateDetail(c.id, c.state, cycle);
  await writeResult(c, cycle, d, chamber);
  return d;
}

export async function updateCycleStatus(cycle: number, total: number, done: number) {
  const r = await safe("cycle_status write", supabase.from("cycle_status").upsert(
    { cycle, candidates_total: total, candidates_done: done, completed_at: done >= total ? new Date().toISOString() : null },
    { onConflict: "cycle" },
  ).select("cycle"));
  if (r) recordDiag({ written: 1 });
}

export type CycleTrend = { cycle: number; complete: boolean; shares: number[] } | null;
/** Returns null when the tables can't be reached (caller falls back). */
export async function readCycleTrend(cycle: number): Promise<CycleTrend> {
  const st = await safe<any>("cycle_status read", supabase.from("cycle_status").select("*").eq("cycle", cycle).maybeSingle());
  if (st === null) return null;
  const complete = !!st.completed_at && n(st.candidates_done)! >= n(st.candidates_total)!;
  if (!complete) return { cycle, complete: false, shares: [] };
  const rows = await safe<any[]>("senate_results read", supabase.from("senate_results").select("out_of_state_share").eq("cycle", cycle));
  if (!rows) return null;
  recordDiag({ read: rows.length + 1 });
  return { cycle, complete: true, shares: rows.map((r) => n(r.out_of_state_share)).filter((x): x is number => x !== null) };
}

export async function updateComputeStatus(chamber: Chamber, cycle: number, state: string, total: number, done: number) {
  const r = await safe("compute_status write", supabase.from("compute_status").upsert(
    { chamber, cycle, state, candidates_total: total, candidates_done: done, completed_at: done >= total ? new Date().toISOString() : null },
    { onConflict: "chamber,cycle,state" },
  ).select("state"));
  if (r) recordDiag({ written: 1 });
}

export type ShareRow = { cand_id: string; name: string; party: string; state: string; district: string | null; itemized: number | null; share: number | null };
/** All computed candidates for a chamber + cycle; null when the tables can't be reached. */
export async function readComputed(chamber: Chamber, cycle: number, state?: string): Promise<ShareRow[] | null> {
  const t = T(chamber);
  const cols = chamber === "house" ? "cand_id,name,party,state,district,itemized_indiv,out_of_state_share" : "cand_id,name,party,state,itemized_indiv,out_of_state_share";
  let q = supabase.from(t.res).select(cols).eq("cycle", cycle).limit(5000);
  if (state) q = q.eq("state", state);
  const rows = await safe<any[]>(`${t.res} read`, q);
  if (!rows) return null;
  recordDiag({ read: rows.length });
  return rows.map((r) => ({ cand_id: r.cand_id, name: r.name, party: r.party ?? "", state: String(r.state).trim(), district: r.district ? String(r.district).trim() : null, itemized: n(r.itemized_indiv), share: n(r.out_of_state_share) }));
}

export type Group = { median: number | null; count: number };
export function groupMedians(rows: ShareRow[], key: (r: ShareRow) => string | null): Map<string, Group> {
  const by = new Map<string, number[]>();
  const counts = new Map<string, number>();
  for (const r of rows) {
    const k = key(r); if (!k) continue;
    counts.set(k, (counts.get(k) ?? 0) + 1);
    if (r.share !== null) by.set(k, [...(by.get(k) ?? []), r.share]);
  }
  return new Map([...counts.keys()].map((k) => [k, { median: median(by.get(k) ?? []), count: counts.get(k)! }]));
}
