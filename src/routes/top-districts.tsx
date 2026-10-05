import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CYCLES, STATE_NAME, cycleLabel, parseCycleOr } from "@/config";
import { CycleSelect, formatMoney } from "@/components/finance";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { readComputed } from "@/lib/results";
import { PCT_TICKS, pctTick, poolDistricts, type DistrictPool } from "@/lib/share";

export const Route = createFileRoute("/top-districts")({
  head: () => ({ meta: [
    { title: "Top districts — Outside Money" },
    { name: "description", content: "U.S. House districts ranked by pooled out-of-state share of located donor dollars, by cycle, from FEC data." },
    { property: "og:title", content: "Top districts — Outside Money" },
    { property: "og:description", content: "House districts ranked by out-of-state share of located donor dollars, 2016–2026." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  validateSearch: (s: Record<string, unknown>) => ({ cycle: parseCycleOr(s["cycle"], 2026), ...(s["view"] === "all" ? { view: "all" as const } : {}) }),
  component: TopDistrictsPage,
});

const MIN_DONOR_DOLLARS = 100_000;

async function loadDistricts(cycle: number): Promise<{ loaded: number; top: DistrictPool[] } | null> {
  const rows = await readComputed("house", cycle);
  if (!rows) return null;
  // Pooled share = sum(out_of_state) ÷ sum(donor_state_sum) over reliable candidates; see poolDistricts.
  const { loaded, ranked } = poolDistricts(rows.filter((r) => STATE_NAME[r.state] && r.state !== "DC"), MIN_DONOR_DOLLARS);
  return { loaded, top: ranked.slice(0, 10) };
}

const q = (cycle: number) => ({ queryKey: ["top-districts", cycle], queryFn: () => loadDistricts(cycle), staleTime: 60_000 });

function Coverage({ cycle, loaded }: { cycle: number; loaded: number }) {
  return <p className="text-sm text-muted-foreground">Based on {loaded} of 435 districts loaded for {cycle}.{loaded < 435 && " Rankings will change as more districts load."}</p>;
}

function DistTable({ cycle, top }: { cycle: number; top: DistrictPool[] }) {
  if (!top.length) return <p className="mt-3 text-sm text-muted-foreground">No districts with at least $100,000 in donor dollars located have loaded yet.</p>;
  return (
    <Table className="mt-3">
      <TableHeader><TableRow><TableHead>Rank</TableHead><TableHead>District</TableHead><TableHead className="text-right">Out-of-state share of located donor dollars</TableHead><TableHead className="text-right">Donor dollars located</TableHead><TableHead className="text-right">Candidates</TableHead><TableHead /></TableRow></TableHeader>
      <TableBody>{top.map((d, i) => (
        <TableRow key={d.label}>
          <TableCell className="font-mono">{i + 1}</TableCell>
          <TableCell className="font-semibold">{d.label}</TableCell>
          <TableCell className="text-right font-mono font-semibold tabular-nums">{d.share.toFixed(1)}%</TableCell>
          <TableCell className="text-right font-mono tabular-nums">{formatMoney(d.donorDollars, true)}</TableCell>
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
      <p className="mt-3 max-w-2xl text-sm text-muted-foreground">Districts ranked by out-of-state share of located donor dollars, pooled across each district's candidates: the sum of their out-of-state donor dollars divided by the sum of all their donor-state dollars. Candidates whose donor-state totals exceed their itemized gifts and transfers are left out, and districts under $100,000 in donor dollars located are excluded.</p>
      <div className="mt-5 flex flex-wrap items-end gap-3">
        {view !== "all" && <div className="w-full max-w-md"><CycleSelect value={cycle} onChange={(c) => navigate({ to: "/top-districts", search: { cycle: c } })} /></div>}
        <Button variant="outline" size="sm" onClick={() => navigate({ to: "/top-districts", search: view === "all" ? { cycle } : { cycle, view: "all" as const } })}>{view === "all" ? "Single cycle" : "All cycles"}</Button>
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
              <div className="mt-6 h-80" role="img" aria-label="Bar chart of top districts by out-of-state share of located donor dollars">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.top} layout="vertical" margin={{ left: 10, right: 20 }}>
                    <XAxis type="number" domain={[0, 100]} ticks={PCT_TICKS} allowDecimals={false} tickFormatter={pctTick} fontSize={12} />
                    <YAxis type="category" dataKey="label" width={60} fontSize={12} />
                    <Tooltip formatter={(v: number) => [`${v.toFixed(1)}% of located donor dollars`, "Out-of-state"]} />
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
