import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowDown, CircleDollarSign, MapPin, ReceiptText } from "lucide-react";
import senateData from "@/data/senate2024.json";
import { RaceLink, formatMoney } from "@/components/finance";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Outside Money — 2024 Senate campaign receipts" },
      { name: "description", content: "Compare where money in selected 2024 U.S. Senate races came from." },
      { property: "og:title", content: "Outside Money — 2024 Senate campaign receipts" },
      { property: "og:description", content: "Compare where money in selected 2024 U.S. Senate races came from." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: HomePage,
});

function HomePage() {
  const navigate = useNavigate();
  const races = [...senateData.states]
    .map((state) => ({ ...state, share: (state.outOfStateItemized / state.itemizedIndividualTotal) * 100 }))
    .sort((a, b) => b.share - a.share);
  const totalReceipts = races.reduce((sum, race) => sum + race.raceTotal, 0);
  const totalItemized = races.reduce((sum, race) => sum + race.itemizedIndividualTotal, 0);
  const totalOutOfState = races.reduce((sum, race) => sum + race.outOfStateItemized, 0);

  return (
    <main>
      <section className="border-b border-border bg-primary text-primary-foreground">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
          <div className="max-w-3xl">
            <p className="mb-4 font-mono text-xs font-semibold uppercase tracking-widest text-primary-muted">2024 Senate campaign finance</p>
            <h1 className="font-serif text-4xl font-bold leading-tight sm:text-6xl">Where your senators’ money comes from</h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-primary-subtle sm:text-lg">
              A neutral view of candidate receipts, with individual contributions separated by donor location.
            </p>
          </div>
          <div className="mt-9 max-w-md">
            <label className="mb-2 block text-sm font-semibold" htmlFor="state-picker">Choose a state</label>
            <Select onValueChange={(state) => navigate({ to: "/race/$state", params: { state } })}>
              <SelectTrigger id="state-picker" className="h-12 border-primary-line bg-primary-surface px-4 text-primary-foreground shadow-none">
                <SelectValue placeholder="Select a 2024 Senate race" />
              </SelectTrigger>
              <SelectContent>
                {senateData.states.map((state) => <SelectItem key={state.code} value={state.code.toLowerCase()}>{state.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14" aria-labelledby="snapshot-heading">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <p className="section-kicker">At a glance</p>
            <h2 id="snapshot-heading" className="section-title">Three-race snapshot</h2>
          </div>
          <span className="data-badge">Placeholder data</span>
        </div>
        <div className="grid gap-px overflow-hidden rounded-md border border-border bg-border sm:grid-cols-3">
          <Headline icon={CircleDollarSign} label="Combined receipts" value={formatMoney(totalReceipts, true)} note="across all three races" />
          <Headline icon={ReceiptText} label="Itemized individuals" value={formatMoney(totalItemized, true)} note="reported donor details" />
          <Headline icon={MapPin} label="Out-of-state" value={`${Math.round((totalOutOfState / totalItemized) * 100)}%`} note="of itemized individual dollars" />
        </div>
      </section>

      <section className="border-t border-border bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
          <p className="section-kicker">Race comparison</p>
          <div className="mb-7 flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
            <h2 className="section-title">Out-of-state share</h2>
            <p className="flex items-center gap-1 text-xs text-muted-foreground"><ArrowDown className="size-3.5" /> Sorted highest to lowest</p>
          </div>
          <div className="divide-y divide-border border-y border-border">
            {races.map((race, index) => (
              <article key={race.code} className="grid gap-5 py-7 sm:grid-cols-[3rem_1fr_11rem] sm:items-center">
                <div className="hidden font-mono text-sm text-subtle sm:block">{String(index + 1).padStart(2, "0")}</div>
                <div>
                  <div className="flex items-baseline justify-between gap-3">
                    <h3 className="font-serif text-2xl font-bold">{race.name}</h3>
                    <span className="font-mono text-2xl font-bold text-out-state sm:hidden">{Math.round(race.share)}%</span>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-sm bg-muted" aria-hidden="true">
                    <div className="h-full bg-out-state" style={{ width: `${race.share}%` }} />
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">{race.share.toFixed(1)}% of itemized individual dollars came from outside {race.name}.</p>
                </div>
                <div className="sm:text-right">
                  <p className="hidden font-mono text-3xl font-bold text-out-state sm:block">{Math.round(race.share)}%</p>
                  <RaceLink code={race.code}>View race</RaceLink>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}

function Headline({ icon: Icon, label, value, note }: { icon: typeof MapPin; label: string; value: string; note: string }) {
  return (
    <article className="bg-background p-5 sm:p-6">
      <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground"><Icon className="size-4 text-primary" />{label}</div>
      <p className="mt-6 font-mono text-3xl font-bold tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{note}</p>
    </article>
  );
}