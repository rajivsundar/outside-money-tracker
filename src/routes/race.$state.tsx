import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { cycleLabel, parseCycle } from "@/config";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { CategoryLegend, CycleSelect, ReceiptBar, formatMoney } from "@/components/finance";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { candidatesQuery, detailQuery, groupRaces, type CandidateSummary } from "@/lib/fec";

export const Route = createFileRoute("/race/$state")({
  head: ({ params }) => {
    const code = params.state.toUpperCase();
    const description = `Where U.S. Senate candidates in ${code} raised their money, from FEC data, 2016–2026.`;
    return { meta: [
      { title: `${code} Senate race money — Outside Money` },
      { name: "description", content: description },
      { property: "og:title", content: `${code} Senate race money — Outside Money` },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ] };
  },
  validateSearch: (s: Record<string, unknown>) => ({ cycle: parseCycle(s.cycle) }),
  component: RacePage,
});

function RacePage() {
  const { state } = Route.useParams();
  const code = state.toUpperCase();
  const { cycle } = Route.useSearch();
  const navigate = useNavigate();
  const { data, isLoading, isError } = useQuery(candidatesQuery(cycle));
  const race = data ? groupRaces(data, cycle).find((r) => r.state === code) : undefined;

  return (
    <main>
      <section className="border-b border-border bg-primary text-primary-foreground">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
          <Link to="/" search={{ cycle }} className="mb-7 inline-flex items-center gap-1 text-sm text-primary-subtle hover:text-primary-foreground"><ArrowLeft className="size-4" />All races</Link>
          <p className="mb-3 font-mono text-xs font-semibold uppercase tracking-widest text-primary-muted">{cycle} U.S. Senate race</p>
          <h1 className="font-serif text-4xl font-bold sm:text-6xl">{race?.stateName ?? code}</h1>
          {race && <p className="mt-4 font-mono text-lg">{formatMoney(race.total, true)} <span className="font-sans text-sm text-primary-subtle">total receipts, all candidates</span></p>}
          {race?.special && <p className="mt-2 text-sm font-semibold text-primary-subtle">Includes special-election candidates</p>}
          <p className="mt-4 text-sm text-primary-subtle">{cycleLabel(cycle)}</p>
          <div className="mt-4 max-w-md"><CycleSelect dark value={cycle} onChange={(c) => navigate({ to: "/race/$state", params: { state }, search: { cycle: c } })} /></div>
        </div>
      </section>
      <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
        {isLoading && <p className="text-muted-foreground">Loading candidates…</p>}
        {isError && <p className="text-muted-foreground">Data unavailable.</p>}
        {data && !race && <p className="text-muted-foreground">No {cycle} Senate candidates with over $100,000 in receipts were found for {code}.</p>}
        {race && <>
          <div className="mb-8 max-w-3xl">
            <p className="section-kicker">Receipt composition</p>
            <h2 className="section-title">How each campaign was funded</h2>
            <div className="mt-5"><CategoryLegend /></div>
          </div>
          <div className="space-y-12">{race.candidates.map((c) => <CandidateBlock key={`${cycle}-${c.id}`} c={c} cycle={cycle} />)}</div>
        </>}
      </section>
    </main>
  );
}

function CandidateBlock({ c, cycle }: { c: CandidateSummary; cycle: number }) {
  const { data, isLoading, isError } = useQuery(detailQuery(c, cycle));
  return (
    <article className="border-t-2 border-foreground pt-5">
      <div className="mb-6 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="text-xs text-muted-foreground">{c.party}</p><h3 className="font-serif text-2xl font-bold">{c.name}</h3></div>
        {data?.outShare != null && <p className="font-mono text-3xl font-bold text-out-state">{data.outShare.toFixed(1)}% <span className="block font-sans text-xs font-normal text-muted-foreground sm:inline">out-of-state share of itemized individual dollars</span></p>}
      </div>
      {isLoading && <p className="text-sm text-muted-foreground">Loading FEC data…</p>}
      {isError && <p className="text-sm text-muted-foreground">Data unavailable.</p>}
      {data && <>
        <p className="mb-3 font-mono text-sm">{formatMoney(data.receipts, true)} <span className="font-sans text-xs text-muted-foreground">total receipts</span></p>
        <ReceiptBar categories={data.categories} label={`${c.name} receipt composition`} />
        <div className="mt-8">
          <h4 className="mb-1 text-sm font-bold">Top 10 donor states</h4>
          <p className="mb-3 text-xs text-muted-foreground">Shares are of this candidate's itemized individual dollars with a reported state.</p>
          {data.donorStates.length === 0 ? <p className="text-sm text-muted-foreground">Data unavailable.</p> : (
            <Table>
              <TableHeader><TableRow><TableHead>State</TableHead><TableHead className="text-right">Amount</TableHead><TableHead className="text-right">Share</TableHead></TableRow></TableHeader>
              <TableBody>
                {(() => { const sum = data.donorStates.reduce((s, d) => s + d.total, 0); return data.donorStates.slice(0, 10).map((d) => (
                  <TableRow key={d.state}><TableCell className="font-medium">{d.name}</TableCell><TableCell className="text-right font-mono tabular-nums">{formatMoney(d.total)}</TableCell><TableCell className="text-right font-mono font-semibold tabular-nums">{((d.total / sum) * 100).toFixed(1)}%</TableCell></TableRow>
                )); })()}
              </TableBody>
            </Table>
          )}
        </div>
      </>}
    </article>
  );
}
