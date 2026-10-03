import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { RaceLink, formatMoney } from "@/components/finance";
import { fetchCandidateDetail, type CandidateSummary } from "@/lib/fec";
import { candidatesQuery } from "./index";

export const Route = createFileRoute("/leaderboard")({
  head: () => ({ meta: [
    { title: "Leaderboard — Outside Money" },
    { name: "description", content: "2024 Senate candidates ranked by out-of-state share of itemized individual dollars, from FEC data." },
    { property: "og:title", content: "Leaderboard — Outside Money" },
    { property: "og:description", content: "2024 Senate candidates ranked by out-of-state share of itemized individual dollars." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: Leaderboard,
});

type Row = CandidateSummary & { outShare: number | null; itemized: number };

function Leaderboard() {
  const qc = useQueryClient();
  const [rows, setRows] = useState<Row[]>([]);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function compute() {
    setRunning(true); setError(null); setRows([]);
    try {
      const cands = await qc.fetchQuery(candidatesQuery);
      setProgress({ done: 0, total: cands.length });
      for (let i = 0; i < cands.length; i++) {
        const c = cands[i];
        try {
          const d = await qc.fetchQuery({ queryKey: ["fec-detail", c.id], queryFn: () => fetchCandidateDetail(c.id, c.state), staleTime: Infinity, retry: 0 });
          setRows((r) => [...r, { ...c, outShare: d.outShare, itemized: d.itemized }]);
        } catch {
          setRows((r) => [...r, { ...c, outShare: null, itemized: 0 }]);
        }
        setProgress({ done: i + 1, total: cands.length });
      }
    } catch { setError("Data unavailable. The FEC service could not be reached."); }
    setRunning(false);
  }

  const sorted = [...rows].sort((a, b) => (b.outShare ?? -1) - (a.outShare ?? -1));

  return (
    <main className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-16">
      <p className="section-kicker">Ranking</p>
      <h1 className="font-serif text-4xl font-bold sm:text-5xl">Leaderboard</h1>
      <p className="mt-4 max-w-2xl text-muted-foreground">Candidates ranked by out-of-state share of itemized individual dollars. Loading every candidate takes a few minutes the first time; results are cached for 24 hours.</p>
      <div className="mt-7 flex flex-col gap-4 sm:flex-row sm:items-center">
        <Button onClick={compute} disabled={running} size="lg">{running ? "Computing…" : "Compute all races"}</Button>
        {progress && <div className="flex-1"><Progress value={(progress.done / Math.max(1, progress.total)) * 100} /><p className="mt-1 text-xs text-muted-foreground">{progress.done} of {progress.total} candidates loaded</p></div>}
      </div>
      {error && <p className="mt-6 text-muted-foreground">{error}</p>}
      {sorted.length > 0 && (
        <ol className="mt-10 divide-y divide-border border-y border-border">
          {sorted.map((r, i) => (
            <li key={r.id} className="grid grid-cols-[2.5rem_1fr_auto] items-center gap-3 py-4">
              <span className="font-mono text-sm text-subtle">{String(i + 1).padStart(2, "0")}</span>
              <div>
                <p className="font-semibold">{r.name} <span className="text-xs font-normal text-muted-foreground">{r.party} · {r.stateName}</span></p>
                <p className="text-xs text-muted-foreground">{formatMoney(r.itemized, true)} itemized individual dollars · <RaceLink code={r.state}>Race</RaceLink></p>
              </div>
              <p className="text-right font-mono text-xl font-bold text-out-state">{r.outShare == null ? <span className="text-sm font-normal text-muted-foreground">data unavailable</span> : `${r.outShare.toFixed(1)}%`}<span className="block font-sans text-[10px] font-normal text-muted-foreground">of itemized individual dollars</span></p>
            </li>
          ))}
        </ol>
      )}
    </main>
  );
}
