import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { SUPABASE_PROJECT_REF, SUPABASE_URL, pingSharedCache, testWrite, useDiagnostics, useSharedCacheStatus } from "@/lib/supabase";
import { updateCycleStatus } from "@/lib/results";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { CycleSelect, RaceLink, formatMoney } from "@/components/finance";
import { cycleLabel, parseCycle } from "@/config";
import { candidatesQuery, detailQuery, saveCycleSummary, useFecStatus, type CandidateSummary } from "@/lib/fec";

export const Route = createFileRoute("/leaderboard")({
  head: () => ({ meta: [
    { title: "Leaderboard — Outside Money" },
    { name: "description", content: "U.S. Senate candidates ranked by out-of-state share of itemized individual dollars, by cycle, from FEC data." },
    { property: "og:title", content: "Leaderboard — Outside Money" },
    { property: "og:description", content: "U.S. Senate candidates ranked by out-of-state share of itemized individual dollars, 2016–2026." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  validateSearch: (s: Record<string, unknown>) => ({ cycle: parseCycle(s["cycle"]) }),
  component: Leaderboard,
});

type Row = CandidateSummary & { outShare: number | null; itemized: number };

function formatEta(ms: number) {
  const m = Math.round(ms / 60000);
  if (m < 1) return "under a minute left";
  return m < 60 ? `about ${m} min left` : `about ${Math.floor(m / 60)} h ${m % 60} min left`;
}

function Leaderboard() {
  const { cycle } = Route.useSearch();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const shared = useSharedCacheStatus();
  const fec = useFecStatus();
  const diag = useDiagnostics();
  const [testMsg, setTestMsg] = useState<string | null>(null);
  useEffect(() => { void pingSharedCache(); }, []);
  const [rows, setRows] = useState<Row[]>([]);
  const [progress, setProgress] = useState<{ done: number; total: number; eta: number | null } | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const runId = useRef(0);

  useEffect(() => { runId.current++; setRows([]); setProgress(null); setRunning(false); setError(null); }, [cycle]);

  async function compute() {
    const id = ++runId.current;
    setRunning(true); setError(null); setRows([]);
    try {
      const cands: CandidateSummary[] = await qc.fetchQuery(candidatesQuery(cycle));
      setProgress({ done: 0, total: cands.length, eta: null });
      const durations: number[] = [];
      const results: Row[] = [];
      for (const [i, c] of cands.entries()) {
        if (runId.current !== id) return;
        const t0 = Date.now();
        let row: Row;
        try {
          const d = await qc.fetchQuery(detailQuery(c, cycle));
          row = { ...c, outShare: d.outShare, itemized: d.itemized };
        } catch {
          row = { ...c, outShare: null, itemized: 0 };
        }
        if (runId.current !== id) return;
        results.push(row);
        setRows((r) => [...r, row]);
        durations.push(Date.now() - t0);
        const recent = durations.slice(-5);
        const avg = recent.reduce((s, x) => s + x, 0) / recent.length;
        setProgress({ done: i + 1, total: cands.length, eta: avg * (cands.length - i - 1) });
        void updateCycleStatus(cycle, cands.length, i + 1);
      }
      saveCycleSummary({ cycle, computedAt: new Date().toISOString(), rows: results.map((r) => ({ id: r.id, outShare: r.outShare })) });
    } catch { setError("Data unavailable. The FEC service could not be reached."); }
    if (runId.current === id) setRunning(false);
  }

  const sorted = [...rows].sort((a, b) => (b.outShare ?? -1) - (a.outShare ?? -1));

  return (
    <main className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-16">
      <p className="section-kicker">Ranking</p>
      <h1 className="font-serif text-4xl font-bold sm:text-5xl">Leaderboard</h1>
      <p className="mt-4 max-w-2xl text-muted-foreground">Candidates ranked by out-of-state share of itemized individual dollars. Loading every candidate can take a while the first time; cached candidates load instantly.</p>
      <div className="mt-6 max-w-md"><CycleSelect value={cycle} onChange={(c) => navigate({ to: "/leaderboard", search: { cycle: c } })} /></div>
      <p className="mt-2 text-sm text-muted-foreground">{cycleLabel(cycle)}</p>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 font-mono text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-2"><span className={`size-2 rounded-full ${shared ? "bg-in-state" : "bg-unknown"}`} />Shared cache: {shared ? "on" : "off"}</span>
        <span>FEC calls remaining this hour: {fec.remaining ?? "not yet known"}</span>
      </div>
      {fec.paused && <p className="mt-4 rounded-sm border border-border bg-muted px-3 py-2 text-sm">FEC hourly limit reached — resuming automatically</p>}
      <div className="mt-7 flex flex-col gap-4 sm:flex-row sm:items-center">
        <Button onClick={compute} disabled={running} size="lg">{running ? "Computing…" : `Compute all ${cycle} races`}</Button>
        {progress && <div className="flex-1"><Progress value={(progress.done / Math.max(1, progress.total)) * 100} /><p className="mt-1 text-xs text-muted-foreground">{progress.done} / {progress.total} candidates loaded{running && progress.eta !== null && progress.done < progress.total ? ` · ${formatEta(progress.eta)}` : ""}</p></div>}
      </div>
      <details className="mt-6 rounded-sm border border-border px-3 py-2 text-xs">
        <summary className="cursor-pointer font-semibold">Diagnostics</summary>
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 font-mono text-muted-foreground">
          <dt>Supabase reachable</dt><dd>{shared === null ? "checking…" : shared ? "yes" : "no"}</dd>
          <dt>Connected project ref</dt><dd>{SUPABASE_PROJECT_REF} <span className="text-subtle">({SUPABASE_URL})</span></dd>
          <dt>Rows read</dt><dd>{diag.read}</dd>
          <dt>Rows written</dt><dd>{diag.written}</dd>
          <dt>Last error</dt><dd className="break-all">{diag.lastError ?? "none"}</dd>
        </dl>
        <div className="mt-3 flex items-center gap-3">
          <Button size="sm" variant="outline" onClick={async () => { setTestMsg("Testing…"); const e = await testWrite(); setTestMsg(e ? `Write failed: ${e}` : "Write succeeded"); }}>Test write</Button>
          {testMsg && <span className="text-muted-foreground">{testMsg}</span>}
        </div>
      </details>
      {error && <p className="mt-6 text-muted-foreground">{error}</p>}
      {sorted.length > 0 && (
        <ol className="mt-10 divide-y divide-border border-y border-border">
          {sorted.map((r, i) => (
            <li key={r.id} className="grid grid-cols-[2.5rem_1fr_auto] items-center gap-3 py-4">
              <span className="font-mono text-sm text-subtle">{String(i + 1).padStart(2, "0")}</span>
              <div>
                <p className="font-semibold">{r.name} <span className="text-xs font-normal text-muted-foreground">{r.party} · {r.stateName}</span></p>
                <p className="text-xs text-muted-foreground">{formatMoney(r.itemized, true)} itemized individual dollars · <RaceLink code={r.state} cycle={cycle}>Race</RaceLink></p>
              </div>
              <p className="text-right font-mono text-xl font-bold text-out-state">{r.outShare == null ? <span className="text-sm font-normal text-muted-foreground">data unavailable</span> : `${r.outShare.toFixed(1)}%`}<span className="block font-sans text-[10px] font-normal text-muted-foreground">of itemized individual dollars</span></p>
            </li>
          ))}
        </ol>
      )}
    </main>
  );
}
