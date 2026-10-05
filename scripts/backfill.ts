// Cloud backfill of every Senate race and House district for 2026 → 2016 (2026 first, the demo cycle), then keeps 2026 fresh.
// Runs the app's own computation (src/lib, calc_version 2) in Node and saves into the same Supabase tables.
//   mode: backfill — fills whatever is missing, state by state.
//   mode: refresh  — once everything is complete: recomputes 2026 results older than 7 days, oldest first (2016–2024 never change).
// 2026 data respects the app's fec_cache lifetime (24 h, ttlFor in src/config.ts), so refreshed candidates get fresh FEC data.
//
//   npx tsx scripts/backfill.ts [--max-calls 850] [--max-minutes 55] [--with-orgs] [--refresh-only] [--refresh-after-days 7]
//
// Environment (all optional; fall back to the values in src/config.ts and src/lib/supabase.ts):
//   FEC_API_KEY, SUPABASE_URL, SUPABASE_KEY
//
// Each run stops cleanly after --max-calls live FEC requests or --max-minutes, or when X-RateLimit-Remaining < 30 or the
// FEC answers HTTP 429. Finished work is skipped on the next run, so it can simply be re-run (the workflow does, hourly).
import { STATES, STATE_NAME, type Chamber, chamberName } from "@/config";
import { FecStop, fecControl, fecStats, fetchCandidateDetail, fetchCandidates, flushCache, type CandidateSummary } from "@/lib/fec";
import { loadOrComputeTopOrgs } from "@/lib/orgs";
import { loadOrComputeDetail, readCompleteStates, readComputed, readResult, readStale, updateComputeStatus, updateCycleStatus, writeResult, type StaleRow } from "@/lib/results";
import { SUPABASE_URL, getDiagnostics } from "@/lib/supabase";
import { PLAN, REFRESH_CYCLE, classifyFailure, oldestFirst, parseArgs, staleCutoff, stopReason, type Options } from "./backfill-lib";

class Fatal extends Error {}
const MAX_TRANSIENT_STREAK = 5;
const MAX_WRITE_FAIL_STREAK = 3;

type Entry = { label: string; visited: boolean; statesTotal: number | null; statesDone: number; complete: boolean; note: string };
const ALL_STATES = Object.values(STATES).map(([p]) => p).sort();

async function main(opts: Options): Promise<number> {
  const startedAt = Date.now();
  let lastRemaining: number | null = null;
  const stats = { saved: 0, existing: 0, unavailable: 0, failed: 0, statesCompleted: 0, orgs: 0 };
  const pos = { cycle: 0, chamber: "" as string, state: "", what: "" };
  const entries = new Map<string, Entry>(PLAN.map(([c, ch]) => [`${c}-${ch}`, { label: `${c} ${chamberName(ch)}`, visited: false, statesTotal: null, statesDone: 0, complete: false, note: "" }]));
  let transientStreak = 0;
  let writeFailStreak = 0;
  let mode: "backfill" | "refresh" = "backfill";
  let upToDate = false;
  const refresh = { due: 0, done: 0, unavailable: 0, failed: 0 };

  const elapsed = () => Date.now() - startedAt;
  const check = () => {
    const s = stopReason({ calls: fecStats.calls, maxCalls: opts.maxCalls, elapsedMs: elapsed(), maxMinutes: opts.maxMinutes, remaining: lastRemaining });
    if (s) throw new FecStop(s.reason, s.message);
  };
  fecControl.waitOn429 = false;
  fecControl.beforeCall = check;
  fecControl.afterResponse = ({ remaining }) => { if (remaining !== null) lastRemaining = remaining; };

  /** Shared handling for a failed unit of work. Returns normally only for failures we tolerate. */
  const tolerate = (e: unknown, what: string): "permanent" | "transient" => {
    const kind = classifyFailure(e);
    const msg = (e as Error).message;
    if (kind === "stop") throw e;
    if (kind === "fatal") throw new Fatal(`${what}: ${msg} — the FEC rejected the API key; nothing was marked complete`);
    if (kind === "permanent") { console.log(`  unavailable: ${what} (${msg})`); transientStreak = 0; return "permanent"; }
    console.log(`  error: ${what} (${msg}) — will retry next run`);
    if (++transientStreak >= MAX_TRANSIENT_STREAK) throw new Fatal(`${MAX_TRANSIENT_STREAK} transient errors in a row (last: ${msg}); the FEC may be down`);
    return "transient";
  };

  async function runState(ch: Chamber, cycle: number, st: string, list: CandidateSummary[], entry: Entry, wasComplete: boolean) {
    const have = await readComputed(ch, cycle, st);
    if (have === null) throw new Fatal("Supabase results could not be read");
    const haveIds = new Set(have.map((r) => r.cand_id));
    let done = 0;
    let failed = 0;
    for (const c of list) {
      if (haveIds.has(c.id)) { done++; stats.existing++; continue; }
      check();
      pos.what = c.name;
      const before = getDiagnostics().written;
      try {
        await loadOrComputeDetail(c, cycle, ch);
        // writeResult swallows errors, so confirm the row really exists.
        if (getDiagnostics().written === before && !(await readResult(c.id, cycle, ch))) {
          if (++writeFailStreak >= MAX_WRITE_FAIL_STREAK) throw new Fatal(`Supabase writes are failing (${getDiagnostics().lastError ?? "no error reported"}); check SUPABASE_KEY and the table policies`);
          failed++; stats.failed++; console.log(`  not saved: ${c.name} (${st}) — write did not land`);
          continue;
        }
        writeFailStreak = 0; transientStreak = 0;
        stats.saved++; done++;
        console.log(`Saved ${c.name} (${st}, ${cycle} ${ch}) · FEC calls ${fecStats.calls}/${opts.maxCalls}`);
      } catch (e) {
        if (e instanceof Fatal) throw e;
        if (tolerate(e, `${c.name} (${st}, ${cycle} ${ch})`) === "permanent") { stats.unavailable++; done++; } else { failed++; stats.failed++; }
      }
    }
    if (opts.withOrgs) {
      const races = new Map<string, CandidateSummary[]>();
      for (const c of list) { const d = ch === "senate" ? "00" : c.district ?? "00"; races.set(d, [...(races.get(d) ?? []), c]); }
      for (const [d, cs] of races) {
        check();
        pos.what = `top organizations ${st}${ch === "house" ? `-${d}` : ""}`;
        try { const r = await loadOrComputeTopOrgs(ch, cycle, st, d, cs); stats.orgs += r.length; }
        catch (e) { if (tolerate(e, `${pos.what} (${cycle})`) === "transient") failed++; }
      }
    }
    await updateComputeStatus(ch, cycle, st, list.length, done);
    if (failed === 0 && done >= list.length && !wasComplete) { entry.statesDone++; stats.statesCompleted++; console.log(`State complete: ${st} (${cycle} ${ch}) · ${entry.statesDone}/${entry.statesTotal}`); }
    else if (failed > 0) entry.note = `${st} has ${failed} candidate(s) to retry`;
  }

  async function runEntry(cycle: number, ch: Chamber) {
    const entry = entries.get(`${cycle}-${ch}`)!;
    entry.visited = true;
    pos.cycle = cycle; pos.chamber = ch; pos.state = ""; pos.what = "reading progress";
    const complete = await readCompleteStates(ch, cycle);
    if (complete === null) throw new Fatal("Supabase compute_status could not be read");
    let bySt: Map<string, CandidateSummary[]> | null = null;
    let order = ALL_STATES;
    let totalCands = 0;
    if (ch === "senate") {
      pos.what = "candidate list";
      try {
        const all = await fetchCandidates(cycle, "S");
        bySt = new Map();
        for (const c of all) bySt.set(c.state, [...(bySt.get(c.state) ?? []), c]);
        order = [...bySt.keys()].sort();
        totalCands = all.length;
      } catch (e) { tolerate(e, `${cycle} senate candidate list`); entry.note = "candidate list unavailable; retry next run"; return; }
    }
    entry.statesTotal = order.length;
    entry.statesDone = order.filter((s) => complete.has(s)).length;
    console.log(`\n== ${entry.label}: ${entry.statesDone}/${order.length} states already complete ==`);
    for (const st of order) {
      const wasComplete = complete.has(st);
      if (wasComplete && !opts.withOrgs) continue;
      check();
      pos.state = st; pos.what = "candidate list";
      let list: CandidateSummary[];
      try { list = bySt ? bySt.get(st) ?? [] : await fetchCandidates(cycle, "H", st); }
      catch (e) { tolerate(e, `${cycle} ${ch} ${st} candidate list`); entry.note = `${st} candidate list unavailable`; continue; }
      await runState(ch, cycle, st, list, entry, wasComplete);
    }
    entry.complete = entry.statesDone === entry.statesTotal;
    if (entry.complete && ch === "senate") await updateCycleStatus(cycle, totalCands, totalCands); // lets Trends use the cycle
  }

  /** Refresh mode: recompute 2026 results older than REFRESH_AFTER_DAYS, oldest first. Never touches 2016–2024. */
  async function runRefresh() {
    pos.cycle = REFRESH_CYCLE; pos.chamber = "senate + house"; pos.state = ""; pos.what = `finding results older than ${opts.refreshAfterDays} days`;
    const cutoff = staleCutoff(Date.now(), opts.refreshAfterDays);
    const due: (StaleRow & { ch: Chamber })[] = [];
    for (const ch of ["senate", "house"] as const) {
      const rows = await readStale(ch, REFRESH_CYCLE, cutoff);
      if (rows === null) throw new Fatal(`Supabase ${ch} results could not be read`);
      due.push(...rows.map((r) => ({ ...r, ch })));
    }
    const queue = oldestFirst(due);
    refresh.due = queue.length;
    console.log(`\n== Refresh: ${queue.length} ${REFRESH_CYCLE} result(s) older than ${opts.refreshAfterDays} days ==`);
    if (!queue.length) { upToDate = true; return; }
    for (const r of queue) {
      check();
      pos.chamber = r.ch; pos.state = r.state; pos.what = r.name;
      const c: CandidateSummary = { id: r.cand_id, name: r.name, party: r.party, state: r.state, stateName: STATE_NAME[r.state] ?? r.state, receipts: r.receipts ?? 0, ...(r.district ? { district: r.district } : {}) };
      const before = getDiagnostics().written;
      try {
        const d = await fetchCandidateDetail(c.id, c.state, REFRESH_CYCLE); // fec_cache entries under 24 h old are reused, older ones refetched
        await writeResult(c, REFRESH_CYCLE, d, r.ch);
        if (getDiagnostics().written === before) {
          if (++writeFailStreak >= MAX_WRITE_FAIL_STREAK) throw new Fatal(`Supabase writes are failing (${getDiagnostics().lastError ?? "no error reported"}); check SUPABASE_KEY and the table policies`);
          refresh.failed++; console.log(`  not saved: ${c.name} (${r.state}) — write did not land`);
          continue;
        }
        writeFailStreak = 0; transientStreak = 0; refresh.done++;
        console.log(`Refreshed ${c.name} (${r.state}, ${REFRESH_CYCLE} ${r.ch}, was ${r.computedAt?.slice(0, 10) ?? "undated"}) · FEC calls ${fecStats.calls}/${opts.maxCalls}`);
      } catch (e) {
        if (e instanceof Fatal) throw e;
        if (tolerate(e, `${c.name} (${r.state}, ${REFRESH_CYCLE} ${r.ch})`) === "permanent") refresh.unavailable++; else refresh.failed++;
      }
    }
  }
  const worked = () => stats.saved > 0 || stats.statesCompleted > 0 || stats.unavailable > 0 || stats.failed > 0 || stats.orgs > 0;

  let stopped: string | null = null;
  let fatal: string | null = null;
  console.log(`Backfill start · Supabase ${SUPABASE_URL} · budget ${opts.maxCalls} FEC calls / ${opts.maxMinutes} min${opts.withOrgs ? " · with top organizations" : ""}`);
  try {
    if (opts.refreshOnly) { mode = "refresh"; await runRefresh(); }
    else {
      for (const [cycle, ch] of PLAN) await runEntry(cycle, ch);
      // Everything was already complete when this run started: switch to keeping 2026 fresh.
      if ([...entries.values()].every((e) => e.complete) && !worked()) { mode = "refresh"; await runRefresh(); }
    }
  } catch (e) {
    if (e instanceof FecStop) stopped = `${e.reason}: ${e.message}`;
    else if (e instanceof Fatal) fatal = e.message;
    else if (classifyFailure(e) === "stop") stopped = (e as Error).message;
    else fatal = `unexpected error: ${(e as Error).stack ?? e}`;
  } finally {
    await flushCache(); // shared-cache writes are fire-and-forget in the app
  }

  const left = [...entries.values()].filter((e) => !e.complete);
  console.log("\n=== Backfill summary ===");
  console.log(`FEC calls used: ${fecStats.calls} of ${opts.maxCalls} · elapsed ${(elapsed() / 60_000).toFixed(1)} min · X-RateLimit-Remaining ${lastRemaining ?? "unknown"}`);
  console.log(`mode: ${mode}`);
  if (mode === "refresh") console.log(`Refreshed this run: ${refresh.done} of ${refresh.due} due (no FEC data ${refresh.unavailable}, to retry ${refresh.failed}) · ${Math.max(0, refresh.due - refresh.done - refresh.unavailable)} left to refresh`);
  else console.log(`Candidates saved this run: ${stats.saved} (already stored ${stats.existing}, no FEC data ${stats.unavailable}, to retry ${stats.failed}) · states completed this run: ${stats.statesCompleted}${opts.withOrgs ? ` · top-organization rows ${stats.orgs}` : ""}`);
  if (fatal) { console.log(`STOPPED WITH ERROR: ${fatal}`); }
  else if (stopped) console.log(`Stopped cleanly — ${stopped}`);
  if (fatal || stopped) console.log(`Position: ${pos.cycle ? `${pos.cycle} ${pos.chamber}${pos.state ? ` · ${pos.state}` : ""}${pos.what ? ` · ${pos.what}` : ""}` : "start"}`);
  if (left.length && mode === "backfill") {
    console.log("Left:");
    for (const e of left) console.log(`  ${e.label}: ${!e.visited ? "not started" : `${e.statesDone}/${e.statesTotal ?? "?"} states complete${e.note ? ` (${e.note})` : ""}`}`);
  }
  if (fatal) return 1;
  if (mode === "refresh") {
    if (upToDate) console.log("\nUP TO DATE");
    else if (!stopped) console.log("\nRefresh pass finished.");
    return 0;
  }
  if (!stopped && left.length === 0 && stats.failed === 0) { console.log("\nBACKFILL COMPLETE"); return 0; }
  if (!stopped) console.log("\nFinished a pass with candidates left to retry; the next run will pick them up.");
  return 0;
}

main(parseArgs(process.argv.slice(2))).then((code) => { process.exitCode = code; }, (e) => { console.error(e); process.exitCode = 1; });
