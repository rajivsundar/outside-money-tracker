// Computed per-candidate results stored in the user's external Supabase project.
// Pages read these first; only uncomputed candidates call the FEC.
import { SPECIAL_ELECTIONS, type Chamber } from "@/config";
import { CALC_VERSION, fetchCandidateDetail, reconciles, type CandidateDetail, type CandidateSummary } from "@/lib/fec";
import { recordDiag, setSharedCacheOnline, supabase, withTimeout } from "@/lib/supabase";
import { dedupeByCommittee, usableShare } from "@/lib/share";

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
  const row = await safe<any>(`${t.res} read`, supabase.from(t.res).select("*").eq("cand_id", id).eq("cycle", cycle).gte("calc_version", CALC_VERSION).maybeSingle());
  if (!row) return null;
  const origins = await safe<any[]>(`${t.orig} read`, supabase.from(t.orig).select("donor_state, amount, contributions").eq("cand_id", id).eq("cycle", cycle));
  if (!origins) return null;
  const R = n(row.receipts), itemized = n(row.itemized_indiv), unit = n(row.unitemized_indiv), pac = n(row.pac), party = n(row.party_total), self = n(row.self_funding), tr = n(row.transfers_other), inS = n(row.in_state), outS = n(row.out_of_state), sum = n(row.donor_state_sum);
  if ([R, itemized, unit, pac, party, self, tr, inS, outS, sum].some((v) => v === null) || !R) { console.warn(`${t.res}: unexpected row`, row); return null; }
  recordDiag({ read: 1 + origins.length });
  const pct = (v: number) => Math.max(0, (v / R) * 100);
  return {
    receipts: R, itemized: itemized!, inStateItemized: inS!, outStateItemized: outS!,
    outShare: n(row.out_of_state_share),
    categories: { inState: pct(inS!), outOfState: pct(outS!), unknown: pct(unit!), pacs: pct(pac!), party: pct(party!), self: pct(self!), transfers: pct(tr!) },
    donorStates: origins.filter((o) => Number(o.amount) > 0).map((o) => ({ state: o.donor_state, name: o.donor_state, total: Number(o.amount), count: Number(o.contributions ?? 0) })).sort((a, b) => b.total - a.total),
    donorStateSum: sum!, reconciles: reconciles(sum!, itemized!), committeeId: row.principal_committee ?? null,
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
    self_funding: dollars(c2.self), transfers_other: dollars(c2.transfers), self_and_other: dollars(c2.self) + dollars(c2.transfers),
    in_state: d.inStateItemized, out_of_state: d.outStateItemized, donor_state_sum: d.donorStateSum,
    out_of_state_share: d.outShare, principal_committee: d.committeeId, calc_version: CALC_VERSION,
    computed_at: new Date().toISOString(),
  }, { onConflict: "cand_id,cycle" }).select("cand_id"));
  if (res === null) return;
  recordDiag({ written: 1 });
  // Replace old donor-state rows is not possible without DELETE; zero out states no longer present.
  const prev = await safe<any[]>(`${t.orig} read`, supabase.from(t.orig).select("donor_state").eq("cand_id", c.id).eq("cycle", cycle));
  const now = new Set(d.donorStates.map((s) => s.state));
  const stale = (prev ?? []).map((p) => p.donor_state as string).filter((s) => !now.has(s));
  const rows = [
    ...d.donorStates.map((s) => ({ cand_id: c.id, cycle, donor_state: s.state, amount: s.total, contributions: Math.round(s.count) })),
    ...stale.map((s) => ({ cand_id: c.id, cycle, donor_state: s, amount: 0, contributions: 0 })),
  ];
  if (rows.length) {
    const o = await safe(`${t.orig} write`, supabase.from(t.orig).upsert(rows, { onConflict: "cand_id,cycle,donor_state" }).select("donor_state"));
    if (o) recordDiag({ written: rows.length });
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
  const rows = await safe<any[]>("senate_results read", supabase.from("senate_results").select("out_of_state_share, donor_state_sum, itemized_indiv, transfers_other").eq("cycle", cycle).gte("calc_version", CALC_VERSION));
  if (!rows) return null;
  recordDiag({ read: rows.length + 1 });
  // Unreliable donor-state totals and shares outside 0–100 never enter the trend.
  const shares = rows.map((r) => usableShare({ share: n(r.out_of_state_share), donorStateSum: n(r.donor_state_sum), itemized: n(r.itemized_indiv), transfersOther: n(r.transfers_other) })).filter((x): x is number => x !== null);
  return { cycle, complete: true, shares };
}

export async function updateComputeStatus(chamber: Chamber, cycle: number, state: string, total: number, done: number) {
  const r = await safe("compute_status write", supabase.from("compute_status").upsert(
    { chamber, cycle, state, candidates_total: total, candidates_done: done, completed_at: done >= total ? new Date().toISOString() : null },
    { onConflict: "chamber,cycle,state" },
  ).select("state"));
  if (r) recordDiag({ written: 1 });
}

export type StaleRow = { cand_id: string; name: string; party: string; state: string; district: string | null; receipts: number | null; committee: string | null; computedAt: string | null };
/** Saved (calc_version-current) rows computed before `before`, oldest first; null when the tables can't be reached. Used by the backfill's refresh mode. */
export async function readStale(chamber: Chamber, cycle: number, before: Date, limit = 1000): Promise<StaleRow[] | null> {
  const t = T(chamber);
  const cols = chamber === "house" ? "cand_id,name,party,state,district,principal_committee,receipts,computed_at" : "cand_id,name,party,state,principal_committee,receipts,computed_at";
  const rows = await safe<any[]>(`${t.res} stale read`, supabase.from(t.res).select(cols).eq("cycle", cycle).gte("calc_version", CALC_VERSION).lt("computed_at", before.toISOString()).order("computed_at", { ascending: true }).limit(limit));
  if (!rows) return null;
  recordDiag({ read: rows.length });
  return dedupeByCommittee(rows.map((r) => ({ cand_id: r.cand_id, name: r.name, party: r.party ?? "", state: String(r.state).trim(), district: r.district ? String(r.district).trim() : null, receipts: n(r.receipts), committee: r.principal_committee ? String(r.principal_committee).trim() : null, computedAt: r.computed_at ?? null })));
}

export type ShareRow = {
  cand_id: string; name: string; party: string; state: string; district: string | null;
  receipts: number | null; itemized: number | null; transfersOther: number | null; committee: string | null;
  inState: number | null; outState: number | null; donorStateSum: number | null; share: number | null;
};
/** All computed candidates for a chamber + cycle; null when the tables can't be reached. */
export async function readComputed(chamber: Chamber, cycle: number, state?: string): Promise<ShareRow[] | null> {
  const t = T(chamber);
  const cols = chamber === "house" ? "cand_id,name,party,state,district,principal_committee,receipts,itemized_indiv,transfers_other,in_state,out_of_state,donor_state_sum,out_of_state_share" : "cand_id,name,party,state,principal_committee,receipts,itemized_indiv,transfers_other,in_state,out_of_state,donor_state_sum,out_of_state_share";
  let q = supabase.from(t.res).select(cols).eq("cycle", cycle).gte("calc_version", CALC_VERSION).limit(5000);
  if (state) q = q.eq("state", state);
  const rows = await safe<any[]>(`${t.res} read`, q);
  if (!rows) return null;
  recordDiag({ read: rows.length });
  // One person can hold two FEC candidate IDs with the same principal committee; count that money once.
  return dedupeByCommittee(rows.map((r) => ({ cand_id: r.cand_id, name: r.name, party: r.party ?? "", state: String(r.state).trim(), district: r.district ? String(r.district).trim() : null, committee: r.principal_committee ? String(r.principal_committee).trim() : null, receipts: n(r.receipts), itemized: n(r.itemized_indiv), transfersOther: n(r.transfers_other), inState: n(r.in_state), outState: n(r.out_of_state), donorStateSum: n(r.donor_state_sum), share: n(r.out_of_state_share) })));
}

export { groupMedians, type Group } from "@/lib/share";

/** States marked complete in compute_status for a chamber + cycle; null when unreachable. */
export async function readCompleteStates(chamber: Chamber, cycle: number): Promise<Set<string> | null> {
  const rows = await safe<any[]>("compute_status read", supabase.from("compute_status").select("state, completed_at").eq("chamber", chamber).eq("cycle", cycle));
  if (!rows) return null;
  return new Set(rows.filter((r) => r.completed_at).map((r) => String(r.state).trim()));
}
