// Top out-of-state organizations (committees only) giving to a race.
import type { Chamber } from "@/config";
import { fecGet, type CandidateSummary } from "@/lib/fec";
import { recordDiag, setSharedCacheOnline, supabase, withTimeout } from "@/lib/supabase";

export type TopOrg = { rank: number; contributor_id: string; contributor_name: string; contributor_state: string; total: number; candidates: string };

async function principalCommittee(id: string, cycle: number): Promise<string | null> {
  const j = await fecGet<any>(`/candidate/${id}/committees/`, { designation: "P", cycle }, cycle);
  const c = j?.results?.[0]?.committee_id;
  if (!c) console.warn("FEC committees: no principal committee", id, j);
  return c ?? null;
}

type Rec = { cid: string; name: string; state: string; amt: number };
async function orgReceipts(cmte: string, cycle: number, lineNo: string): Promise<Rec[]> {
  const out: Rec[] = [];
  let after: Record<string, string> = {};
  for (let page = 0; page < 5; page++) {
    const j = await fecGet<any>("/schedules/schedule_a/", {
      committee_id: cmte, two_year_transaction_period: cycle, is_individual: "false", line_number: lineNo, per_page: 100,
      sort: "-contribution_receipt_amount", ...after,
    }, cycle);
    const rows: any[] = j?.results ?? [];
    for (const r of rows) {
      const line = String(r.line_number ?? "").toUpperCase().replace(/^F3-?/, "");
      if (line !== "11B" && line !== "11C") continue;
      if (String(r.memo_code ?? "").toUpperCase() === "X") continue;
      const des = r.contributor?.designation;
      if (des === "J" || des === "P" || des === "A") continue; // joint fundraising / candidate's own committees
      const amt = typeof r.contribution_receipt_amount === "number" ? r.contribution_receipt_amount : null;
      const cid = r.contributor_id ?? r.contributor?.committee_id ?? r.contributor_name;
      if (amt === null || !cid) { console.warn("FEC schedule_a: unexpected row", r); continue; }
      out.push({ cid, name: r.contributor_name ?? cid, state: String(r.contributor_state ?? r.contributor?.state ?? "").toUpperCase(), amt });
    }
    const li = j?.pagination?.last_indexes;
    if (rows.length < 100 || !li?.last_index) break;
    after = { last_index: String(li.last_index), last_contribution_receipt_amount: String(li.last_contribution_receipt_amount) };
  }
  return out;
}

async function filtered(cmte: string, cycle: number) {
  // Line filter applied server-side too (keeps 5 pages focused on committee money).
  return [...await orgReceipts(cmte, cycle, "F3-11B"), ...await orgReceipts(cmte, cycle, "F3-11C")];
}

export async function computeTopOrgs(cands: CandidateSummary[], cycle: number, raceState: string): Promise<TopOrg[]> {
  const agg = new Map<string, { name: string; state: string; total: number; cands: Set<string> }>();
  for (const c of cands) {
    const cmte = await principalCommittee(c.id, cycle);
    if (!cmte) continue;
    for (const r of await filtered(cmte, cycle)) {
      const a = agg.get(r.cid) ?? { name: r.name, state: r.state, total: 0, cands: new Set<string>() };
      a.total += r.amt; a.cands.add(c.name); agg.set(r.cid, a);
    }
  }
  return [...agg.entries()]
    .filter(([, a]) => a.state && a.state !== raceState && a.total > 0)
    .sort((x, y) => y[1].total - x[1].total).slice(0, 5)
    .map(([cid, a], i) => ({ rank: i + 1, contributor_id: cid, contributor_name: a.name, contributor_state: a.state.slice(0, 2), total: a.total, candidates: [...a.cands].join(", ") }));
}

export async function readTopOrgs(chamber: Chamber, cycle: number, state: string, district: string): Promise<TopOrg[] | null> {
  try {
    const { data, error } = await withTimeout(supabase.from("race_top_orgs").select("*").eq("chamber", chamber).eq("cycle", cycle).eq("state", state).eq("district", district).order("rank"));
    if (error) { recordDiag({ error: `race_top_orgs read: ${error.message}` }); setSharedCacheOnline(false); return null; }
    if (!data?.length) return null;
    recordDiag({ read: data.length });
    return data.map((r: any) => ({ rank: r.rank, contributor_id: r.contributor_id, contributor_name: r.contributor_name, contributor_state: String(r.contributor_state ?? "").trim(), total: Number(r.total), candidates: r.candidates ?? "" }));
  } catch { return null; }
}

export async function writeTopOrgs(chamber: Chamber, cycle: number, state: string, district: string, rows: TopOrg[]) {
  if (!rows.length) return;
  try {
    const { error } = await withTimeout(supabase.from("race_top_orgs").upsert(
      rows.map((r) => ({ chamber, cycle, state, district, ...r, computed_at: new Date().toISOString() })),
      { onConflict: "chamber,cycle,state,district,rank" },
    ));
    recordDiag(error ? { error: `race_top_orgs write: ${error.message}` } : { written: rows.length });
  } catch (e) { recordDiag({ error: (e as Error).message }); }
}

export async function loadOrComputeTopOrgs(chamber: Chamber, cycle: number, state: string, district: string, cands: CandidateSummary[]) {
  const stored = await readTopOrgs(chamber, cycle, state, district);
  if (stored) return stored;
  const rows = await computeTopOrgs(cands, cycle, state);
  await writeTopOrgs(chamber, cycle, state, district, rows);
  return rows;
}

export const storedTopOrgsQuery = (chamber: Chamber, cycle: number, state: string, district: string) => ({
  queryKey: ["top-orgs", chamber, cycle, state, district], queryFn: () => readTopOrgs(chamber, cycle, state, district), staleTime: 60_000,
});
