import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CycleSelect, RaceLink, formatMoney } from "@/components/finance";
import { cycleLabel, parseCycle } from "@/config";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { candidatesQuery, groupRaces } from "@/lib/fec";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Outside Money — Where your senators' money comes from" },
      { name: "description", content: "Live FEC data on where U.S. Senate candidates' receipts came from, 2016–2026." },
      { property: "og:title", content: "Outside Money — Where your senators' money comes from" },
      { property: "og:description", content: "Live FEC data on where U.S. Senate candidates' receipts came from, 2016–2026." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  validateSearch: (s: Record<string, unknown>) => ({ cycle: parseCycle(s.cycle) }),
  component: HomePage,
});

function HomePage() {
  const navigate = useNavigate();
  const { cycle } = Route.useSearch();
  const { data, isLoading, isError } = useQuery(candidatesQuery(cycle));
  const races = data ? groupRaces(data, cycle) : [];

  return (
    <main>
      <section className="border-b border-border bg-primary text-primary-foreground">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
          <p className="mb-4 font-mono text-xs font-semibold uppercase tracking-widest text-primary-muted">U.S. Senate · FEC data</p>
          <h1 className="max-w-3xl font-serif text-4xl font-bold leading-tight sm:text-6xl">Where your senators' money comes from</h1>
          <p className="mt-4 text-sm text-primary-subtle">{cycleLabel(cycle)}</p>
          <div className="mt-9 grid max-w-2xl gap-4 sm:grid-cols-2">
            <CycleSelect dark value={cycle} onChange={(c) => navigate({ to: "/", search: { cycle: c } })} />
            <div>
            <label className="mb-2 block text-sm font-semibold" htmlFor="state-picker">Choose a state</label>
            <Select disabled={!races.length} key={cycle} onValueChange={(state) => navigate({ to: "/race/$state", params: { state }, search: { cycle } })}>
              <SelectTrigger id="state-picker" className="h-12 border-primary-line bg-primary-surface px-4 text-primary-foreground shadow-none">
                <SelectValue placeholder={isLoading ? "Loading races…" : `Select a ${cycle} Senate race`} />
              </SelectTrigger>
              <SelectContent>
                {races.map((r) => <SelectItem key={r.state} value={r.state.toLowerCase()}>{r.stateName}</SelectItem>)}
              </SelectContent>
            </Select>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
        <p className="section-kicker">All races</p>
        <h2 className="section-title mb-6">{cycle} Senate races by state</h2>
        {isLoading && <p className="text-muted-foreground">Loading candidates from the FEC…</p>}
        {isError && <p className="text-muted-foreground">Data unavailable. The FEC service could not be reached.</p>}
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
                <RaceLink code={race.state} cycle={cycle}>View race</RaceLink>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
