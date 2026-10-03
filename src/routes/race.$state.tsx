import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import senateData from "@/data/senate2024.json";
import { CategoryLegend, ReceiptBar, formatMoney, type Categories } from "@/components/finance";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/race/$state")({
  loader: ({ params }) => {
    const race = senateData.states.find((item) => item.code.toLowerCase() === params.state.toLowerCase());
    if (!race) throw notFound();
    return { race };
  },
  head: ({ loaderData }) => {
    const name = loaderData?.race.name ?? "Race unavailable";
    const description = loaderData
      ? `See the sources of 2024 Senate candidate receipts in ${name}.`
      : "The requested 2024 Senate race is unavailable.";
    return { meta: [
      { title: `${name} Senate money — Outside Money` },
      { name: "description", content: description },
      { property: "og:title", content: `${name} Senate money — Outside Money` },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ] };
  },
  component: RacePage,
  notFoundComponent: RaceNotFound,
});

function RacePage() {
  const { race } = Route.useLoaderData();
  const outShare = (race.outOfStateItemized / race.itemizedIndividualTotal) * 100;
  return (
    <main>
      <section className="border-b border-border bg-primary text-primary-foreground">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
          <Link to="/" className="mb-7 inline-flex items-center gap-1 text-sm text-primary-subtle hover:text-primary-foreground"><ArrowLeft className="size-4" />All races</Link>
          <p className="mb-3 font-mono text-xs font-semibold uppercase tracking-widest text-primary-muted">2024 U.S. Senate race</p>
          <h1 className="font-serif text-4xl font-bold sm:text-6xl">{race.name}</h1>
          <div className="mt-8 grid max-w-3xl grid-cols-2 gap-px overflow-hidden rounded-md bg-primary-line sm:grid-cols-3">
            <Stat value={formatMoney(race.raceTotal, true)} label="total receipts" />
            <Stat value={formatMoney(race.itemizedIndividualTotal, true)} label="itemized individuals" />
            <Stat value={`${outShare.toFixed(1)}%`} label="of itemized individual dollars from out of state" wide />
          </div>
        </div>
      </section>
      <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
        <div className="mb-8 max-w-3xl">
          <p className="section-kicker">Receipt composition</p>
          <h2 className="section-title">How each campaign was funded</h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">Bars show all reported receipts. Individual contributions are separated by donor location; institutional and other sources are shown separately.</p>
          <div className="mt-5"><CategoryLegend /></div>
        </div>
        <div className="space-y-12">
          {race.candidates.map((candidate) => (
            <article key={candidate.name} className="border-t-2 border-foreground pt-5">
              <div className="mb-6 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                <div><p className="text-xs text-muted-foreground">{candidate.partyLabel}</p><h3 className="font-serif text-2xl font-bold">{candidate.name}</h3></div>
                <p className="font-mono text-xl font-bold">{formatMoney(candidate.receipts, true)} <span className="font-sans text-xs font-normal text-muted-foreground">total receipts</span></p>
              </div>
              <ReceiptBar categories={candidate.categories as Categories} label={`${candidate.name} receipt composition`} />
              <div className="mt-8">
                <h4 className="mb-1 text-sm font-bold">Top donor states</h4>
                <p className="mb-3 text-xs text-muted-foreground">Shares are of this candidate’s itemized individual dollars.</p>
                <Table>
                  <TableHeader><TableRow><TableHead>State</TableHead><TableHead className="text-right">Amount</TableHead><TableHead className="text-right">Share</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {candidate.topDonorStates.map((donor) => (
                      <TableRow key={donor.state}><TableCell className="font-medium">{donor.state}</TableCell><TableCell className="text-right font-mono tabular-nums">{formatMoney(donor.amount)}</TableCell><TableCell className="text-right font-mono font-semibold tabular-nums">{donor.share}%</TableCell></TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

function Stat({ value, label, wide = false }: { value: string; label: string; wide?: boolean }) {
  return <div className={`bg-primary-surface p-4 ${wide ? "col-span-2 sm:col-span-1" : ""}`}><p className="font-mono text-xl font-bold">{value}</p><p className="mt-1 text-xs leading-4 text-primary-subtle">{label}</p></div>;
}

function RaceNotFound() {
  return <main className="mx-auto max-w-3xl px-4 py-24 text-center"><p className="section-kicker">Race unavailable</p><h1 className="section-title">We don’t have that state in this sample.</h1><p className="mt-4 text-muted-foreground">Choose Arizona, Montana, or Ohio from the race list.</p><Link to="/" className="mt-7 inline-flex items-center gap-1 font-semibold text-primary hover:underline"><ArrowLeft className="size-4" />Back to all races</Link></main>;
}
