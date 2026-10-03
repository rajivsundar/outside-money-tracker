import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { cycleLabel, parseCycle } from "@/config";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { CategoryLegend, CycleSelect, formatMoney } from "@/components/finance";
import { CandidateBlock } from "@/components/candidate-block";
import { candidatesQuery, groupRaces } from "@/lib/fec";

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
  validateSearch: (s: Record<string, unknown>) => ({ cycle: parseCycle(s["cycle"]) }),
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
          <Link to="/" search={{ cycle, chamber: "senate" }} className="mb-7 inline-flex items-center gap-1 text-sm text-primary-subtle hover:text-primary-foreground"><ArrowLeft className="size-4" />All races</Link>
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

