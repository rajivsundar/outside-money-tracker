import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import { ChamberToggle, CycleSelect, ShareLegend, formatMoney } from "@/components/finance";
import { UsMap, describe, type StateStatus } from "@/components/us-map";
import { IN_PROGRESS_CYCLE, STATES, chamberName, cycleLabel, parseChamber, parseCycleOr } from "@/config";
import { candidatesQuery, groupRaces } from "@/lib/fec";
import { groupMedians, readComputed } from "@/lib/results";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Outside Money — Where does your representatives' money come from?" },
      { name: "description", content: "Map of U.S. Senate and House candidates' out-of-state share of itemized individual dollars, from live FEC data, 2016–2026." },
      { property: "og:title", content: "Outside Money — Where does your representatives' money come from?" },
      { property: "og:description", content: "Map of Senate and House candidates' out-of-state share of itemized individual dollars, from FEC data." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  validateSearch: (s: Record<string, unknown>) => ({ cycle: parseCycleOr(s["cycle"], IN_PROGRESS_CYCLE), chamber: parseChamber(s["chamber"]) }),
  component: HomePage,
});

function HomePage() {
  const navigate = useNavigate();
  const { cycle, chamber } = Route.useSearch();
  const senate = useQuery({ ...candidatesQuery(cycle), enabled: chamber === "senate" });
  const computed = useQuery({ queryKey: ["computed", chamber, cycle], queryFn: () => readComputed(chamber, cycle), staleTime: 30_000 });
  const races = senate.data ? groupRaces(senate.data, cycle) : [];
  const medians = groupMedians(computed.data ?? [], (r) => r.state);
  const noneLabel = `No Senate race in ${cycle}`;

  const statuses: Record<string, StateStatus> = {};
  for (const [postal] of Object.values(STATES)) {
    const m = medians.get(postal);
    if (chamber === "senate" && senate.data && !races.some((r) => r.state === postal)) statuses[postal] = { kind: "none" };
    else statuses[postal] = m ? { kind: "value", ...m } : { kind: "pending" };
  }
  const go = (st: string) => navigate({ to: "/state/$st", params: { st: st.toLowerCase() }, search: { cycle, chamber } });

  return (
    <main>
      <section className="border-b border-border bg-primary text-primary-foreground">
        <div className="mx-auto max-w-6xl px-4 pt-10 pb-6 sm:px-6 sm:pt-14">
          <p className="mb-4 font-mono text-xs font-semibold uppercase tracking-widest text-primary-muted">U.S. Congress · FEC data</p>
          <h1 className="max-w-3xl font-serif text-4xl font-bold leading-tight sm:text-5xl">Where does your representatives' money come from?</h1>
          <div className="mt-7 flex flex-col gap-4 sm:flex-row sm:items-end">
            <ChamberToggle dark value={chamber} onChange={(c) => navigate({ to: "/", search: { cycle, chamber: c } })} />
            <div className="sm:w-96"><CycleSelect dark value={cycle} onChange={(c) => navigate({ to: "/", search: { cycle: c, chamber } })} /></div>
          </div>
          <p className="mt-3 text-sm text-primary-subtle">{cycleLabel(cycle)}</p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-0 py-6 sm:px-6">
        <div className="rounded-none bg-card px-2 py-4 sm:rounded-md sm:border sm:border-border sm:px-6">
          <UsMap statuses={statuses} noneLabel={noneLabel} onSelect={go} />
          <div className="mt-4 px-2"><ShareLegend noRaceLabel={chamber === "senate" ? noneLabel : undefined} /></div>
          {computed.data === null && <p className="mt-3 px-2 text-xs text-muted-foreground">Saved results couldn't be reached; states show as not computed yet.</p>}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-14 sm:px-6">
        <p className="section-kicker">All races</p>
        <h2 className="section-title mb-6">{cycle} {chamberName(chamber)} races by state</h2>
        {chamber === "senate" ? <>
          {senate.isLoading && <p className="text-muted-foreground">Loading candidates from the FEC…</p>}
          {senate.isError && <p className="text-muted-foreground">Data unavailable. The FEC service could not be reached.</p>}
          <div className="divide-y divide-border border-y border-border">
            {races.map((race) => (
              <article key={race.state} className="grid gap-3 py-5 sm:grid-cols-[1fr_auto] sm:items-center">
                <div>
                  <h3 className="font-serif text-xl font-bold">{race.stateName}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{race.candidates.map((c) => c.name).join(" · ")}</p>
                  {race.special && <p className="mt-1 text-xs font-semibold text-muted-foreground">Includes special-election candidates</p>}
                </div>
                <div className="flex items-center justify-between gap-6 sm:justify-end">
                  <p className="font-mono font-bold tabular-nums">{formatMoney(race.total, true)} <span className="font-sans text-xs font-normal text-muted-foreground">total receipts</span></p>
                  <StateLink st={race.state} cycle={cycle} chamber={chamber} />
                </div>
              </article>
            ))}
          </div>
        </> : (
          <div className="divide-y divide-border border-y border-border">
            {Object.values(STATES).sort((a, b) => a[1].localeCompare(b[1])).map(([postal, name]) => (
              <article key={postal} className="grid gap-2 py-4 sm:grid-cols-[1fr_auto] sm:items-center">
                <div><h3 className="font-serif text-lg font-bold">{name}</h3><p className="text-sm text-muted-foreground">{describe(statuses[postal], noneLabel)}</p></div>
                <StateLink st={postal} cycle={cycle} chamber={chamber} />
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function StateLink({ st, cycle, chamber }: { st: string; cycle: number; chamber: "senate" | "house" }) {
  return (
    <Link to="/state/$st" params={{ st: st.toLowerCase() }} search={{ cycle, chamber }} className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
      View state<ArrowRight className="size-4" aria-hidden="true" />
    </Link>
  );
}
