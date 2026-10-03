import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CYCLES, IN_PROGRESS_CYCLE, cycleLabel } from "@/config";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getCycleSummary, median } from "@/lib/fec";
import { readCycleTrend } from "@/lib/results";

export const Route = createFileRoute("/trends")({
  head: () => ({ meta: [
    { title: "Trends — Outside Money" },
    { name: "description", content: "Median out-of-state share of itemized individual dollars for U.S. Senate candidates, by cycle, 2016–2026." },
    { property: "og:title", content: "Trends — Outside Money" },
    { property: "og:description", content: "Median out-of-state share of itemized individual dollars across Senate candidates, 2016–2026." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: TrendsPage,
});

type Point = { cycle: number; median: number | null; n: number; computed: boolean };

async function loadTrends(): Promise<Point[]> {
  const out: Point[] = [];
  for (const cycle of CYCLES) {
    const t = await readCycleTrend(cycle);
    if (t?.complete) { out.push({ cycle, median: median(t.shares), n: t.shares.length, computed: true }); continue; }
    const s = await getCycleSummary(cycle);
    if (!s) { out.push({ cycle, median: null, n: 0, computed: false }); continue; }
    const shares = s.rows.map((r) => r.outShare).filter((x): x is number => x !== null);
    out.push({ cycle, median: median(shares), n: shares.length, computed: true });
  }
  return out;
}

function TrendsPage() {
  const { data, isLoading } = useQuery({ queryKey: ["trends"], queryFn: loadTrends, staleTime: 0 });
  const chart = (data ?? []).map((p) => ({ cycle: String(p.cycle), median: p.median === null ? null : Number(p.median.toFixed(1)) }));
  return (
    <main className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-16">
      <p className="section-kicker">Over time</p>
      <h1 className="font-serif text-4xl font-bold sm:text-5xl">Trends</h1>
      <p className="mt-4 max-w-2xl text-muted-foreground">Median out-of-state share of itemized individual dollars across Senate candidates, for each fully computed cycle. Compute a cycle on the <Link to="/leaderboard" search={{ cycle: 2024 }} className="font-semibold text-primary hover:underline">Leaderboard</Link> to add it here.</p>
      <p className="mt-3 max-w-2xl text-sm text-muted-foreground">Note: Each cycle covers different Senate seats (one-third of the Senate is elected every two years).</p>
      {isLoading && <p className="mt-8 text-muted-foreground">Checking computed cycles…</p>}
      {data && <>
        <div className="mt-10 h-72 w-full" role="img" aria-label="Line chart of median out-of-state share by cycle">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chart} margin={{ top: 10, right: 16, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="var(--color-border)" vertical={false} />
              <XAxis dataKey="cycle" stroke="var(--color-muted-foreground)" fontSize={12} />
              <YAxis domain={[0, 100]} unit="%" stroke="var(--color-muted-foreground)" fontSize={12} width={48} />
              <Tooltip formatter={(v) => [`${v}% of itemized individual dollars`, "Median out-of-state share"]} />
              <Line type="monotone" dataKey="median" stroke="var(--color-out-state)" strokeWidth={2.5} dot={{ r: 4 }} connectNulls={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <Table className="mt-8">
          <TableHeader><TableRow><TableHead>Cycle</TableHead><TableHead className="text-right">Median out-of-state share</TableHead><TableHead className="text-right">Candidates with data</TableHead></TableRow></TableHeader>
          <TableBody>
            {data.map((p) => (
              <TableRow key={p.cycle}>
                <TableCell><span className="font-medium">{p.cycle}</span><span className="block text-xs text-muted-foreground">{cycleLabel(p.cycle)}</span></TableCell>
                <TableCell className="text-right font-mono tabular-nums">{!p.computed ? <span className="font-sans text-muted-foreground">not computed yet</span> : p.median === null ? <span className="font-sans text-muted-foreground">data unavailable</span> : <>{p.median.toFixed(1)}% <span className="block font-sans text-[10px] text-muted-foreground">of itemized individual dollars</span></>}</TableCell>
                <TableCell className="text-right font-mono tabular-nums">{p.computed ? p.n : "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <p className="mt-3 text-xs text-muted-foreground">{IN_PROGRESS_CYCLE} is in progress; its figures change as new FEC filings arrive.</p>
      </>}
    </main>
  );
}
