import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CYCLES, STATE_NAME, cycleLabel, parseCycleOr } from "@/config";
import { CycleSelect, formatMoney } from "@/components/finance";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { readComputed } from "@/lib/results";

export const Route = createFileRoute("/top-districts")({
  head: () => ({ meta: [
    { title: "Top districts — Outside Money" },
    { name: "description", content: "U.S. House districts ranked by pooled out-of-state share of itemized individual dollars, by cycle, from FEC data." },
    { property: "og:title", content: "Top districts — Outside Money" },
    { property: "og:description", content: "House districts ranked by out-of-state share of itemized individual dollars, 2016–2026." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  validateSearch: (s: Record<string, unknown>) => ({ cycle: parseCycleOr(s["cycle"], 2026), view: s["view"] === "all" ? ("all" as const) : undefined }),
  component: TopDistrictsPage,
});

const MIN_ITEMIZED = 100_000;
type Dist = { state: string; district: string; label: string; share: number; itemized: number; cands: number };

async function loadDistricts(cycle: number): Promise<{ loaded: number; top: Dist[] } | null> {
  const rows = await readComputed("house", cycle);
  if (!rows) return null;
  const by = new Map<string, { state: string; district: string; out: number; item: number; cands: number }>();
  for (const r of rows) {
    if (!STATE_NAME[r.state] || r.state === "DC") continue;
    const d = r.district ?? "00";
    const k = `${r.state}-${d}`;
    const g = by.get(k) ?? { state: r.state, district: d, out: 0, item: 0, cands: 0 };
    g.cands++;
    // Candidates with no reported donor states have no geographic split; leave them out of both sums.
    if (r.share !== null && r.itemized !== null && r.outState !== null) { g.out += r.outState; g.item += r.itemized; }
    by.set(k, g);
  }
  const top = [...by.values()].filter((g) => g.item >= MIN_ITEMIZED)
    .map((g) => ({ state: g.state, district: g.district, label: `${g.state}-${g.district === "00" ? "AL" : g.district}`, share: (g.out / g.item) * 100, itemized: g.item, cands: g.cands }))
    .sort((a, b) => b.share - a.share).slice(0, 10);
  return { loaded: by.size, top };
}

const q = (cycle: number) => ({ queryKey: ["top-districts", cycle], queryFn: () => loadDistricts(cycle), staleTime: 60_000 });

function Coverage({ cycle, loaded }: { cycle: number; loaded: number }) {
  return <p className="text-sm text-muted-foreground">Based on {loaded} of 435 districts loaded for {cycle}.{loaded < 435 && " Rankings will change as more districts load."}</p>;
}

function DistTable({ cycle, top }: { cycle: number; top: Dist[] }) {
  if (!top.length) return <p className="mt-3 text-sm text-muted-foreground">No districts with at least $100,000 in itemized individual dollars loaded yet.</p>;
  return (
    <Table className="mt-3">
      <TableHeader><TableRow><TableHead>Rank</TableHead><TableHead>District</TableHead><TableHead className="text-right">Out-of-state share of itemized individual dollars</TableHead><TableHead className="text-right">Itemized individual dollars</TableHead><TableHead className="text-right">Candidates</TableHead><TableHead /></TableRow></TableHeader>
      <TableBody>{top.map((d, i) => (
        <TableRow key={d.label}>
          <TableCell className="font-mono">{i + 1}</TableCell>
          <TableCell className="font-semibold">{d.label}</TableCell>
          <TableCell className="text-right font-mono font-semibold tabular-nums">{d.share.toFixed(1)}%</TableCell>
          <TableCell className="text-right font-mono tabular-nums">{formatMoney(d.itemized, true)}</TableCell>
          <TableCell className="text-right font-mono">{d.cands}</TableCell>
          <TableCell><Link to="/house/$st/$district" params={{ st: d.state.toLowerCase(), district: d.district }} search={{ cycle }} className="text-sm font-semibold text-primary hover:underline">View</Link></TableCell>
        </TableRow>
      ))}</TableBody>
    </Table>
  );
}

function CycleBlock({ cycle }: { cycle: number }) {
  const { data, isLoading } = useQuery(q(cycle));
  return (
    <section className="border-t border-border pt-6">
      <h2 className="font-serif text-2xl font-bold">{cycle}</h2>
      <p className="text-xs text-muted-foreground">{cycleLabel(cycle)}</p>
      {isLoading ? <p className="mt-2 text-sm text-muted-foreground">Loading…</p> : !data ? <p className="mt-2 text-sm text-muted-foreground">Data unavailable.</p> : <><div className="mt-2"><Coverage cycle={cycle} loaded={data.loaded} /></div><DistTable cycle={cycle} top={data.top} /></>}
    </section>
  );
}

function TopDistrictsPage() {
  const { cycle, view } = Route.useSearch();
  const navigate = useNavigate();
  const { data, isLoading } = useQuery(q(cycle));
  return (
    <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
      <p className="section-kicker">U.S. House</p>
      <h1 className="section-title">Top districts</h1>
      <p className="mt-3 max-w-2xl text-sm text-muted-foreground">Districts ranked by out-of-state share of itemized individual dollars, pooled across all of each district's candidates. Districts under $100,000 in itemized individual dollars are excluded.</p>
      <div className="mt-5 flex flex-wrap items-end gap-3">
        {view !== "all" && <div className="w-full max-w-md"><CycleSelect value={cycle} onChange={(c) => navigate({ to: "/top-districts", search: { cycle: c } })} /></div>}
        <Button variant="outline" size="sm" onClick={() => navigate({ to: "/top-districts", search: { cycle, view: view === "all" ? undefined : "all" } })}>{view === "all" ? "Single cycle" : "All cycles"}</Button>
      </div>
      {view === "all" ? (
        <div className="mt-8 space-y-10">{[...CYCLES].reverse().map((c) => <CycleBlock key={c} cycle={c} />)}</div>
      ) : (
        <div className="mt-8">
          <p className="mb-2 text-xs text-muted-foreground">{cycleLabel(cycle)}</p>
          {isLoading && <p className="text-muted-foreground">Loading…</p>}
          {!isLoading && !data && <p className="text-muted-foreground">Data unavailable.</p>}
          {data && <>
            <Coverage cycle={cycle} loaded={data.loaded} />
            {data.top.length > 0 && (
              <div className="mt-6 h-80" role="img" aria-label="Bar chart of top districts by out-of-state share of itemized individual dollars">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.top} layout="vertical" margin={{ left: 10, right: 20 }}>
                    <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} fontSize={12} />
                    <YAxis type="category" dataKey="label" width={60} fontSize={12} />
                    <Tooltip formatter={(v: number) => [`${v.toFixed(1)}% of itemized individual dollars`, "Out-of-state"]} />
                    <Bar dataKey="share" fill="var(--color-out-state)" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
            <DistTable cycle={cycle} top={data.top} />
          </>}
        </div>
      )}
    </main>
  );
}
