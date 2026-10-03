import { createFileRoute } from "@tanstack/react-router";
import { CategoryLegend } from "@/components/finance";

export const Route = createFileRoute("/methodology")({
  head: () => ({ meta: [
    { title: "Methodology — Outside Money" },
    { name: "description", content: "How Outside Money classifies and calculates 2024 Senate campaign receipts." },
    { property: "og:title", content: "Methodology — Outside Money" },
    { property: "og:description", content: "How Outside Money classifies and calculates 2024 Senate campaign receipts." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: MethodologyPage,
});

const definitions = [
  ["In-state", "Itemized individual dollars whose donor address is in the race state. Calculated as the candidate's itemized individual total times the in-state fraction of FEC donor-state totals."],
  ["Out-of-state", "Itemized individual dollars from every other state. Military addresses (AA, AE, AP), unknown (ZZ) and U.S. territories count as out-of-state."],
  ["Unknown small donors", "Unitemized individual contributions. Donors who give $200 or less in the cycle are not itemized, so their location is unknown."],
  ["PACs", "Contributions from other political committees (FEC: other_political_committee_contributions)."],
  ["Party", "Contributions from political party committees."],
  ["Self & other", "Everything else in total receipts: candidate contributions and loans, transfers, refunds and other receipts."],
];

function MethodologyPage() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-12 sm:px-6 sm:py-16">
      <p className="section-kicker">About the numbers</p>
      <h1 className="font-serif text-4xl font-bold sm:text-5xl">Methodology</h1>
      <p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground">Outside Money describes the geographic and organizational sources of campaign receipts without evaluating candidates or donors.</p>

      <div className="mt-10 border-y border-border py-6"><CategoryLegend /></div>

      <div className="mt-10 grid gap-10 sm:grid-cols-[1fr_2fr]">
        <h2 className="font-serif text-2xl font-bold">What each category means</h2>
        <dl className="divide-y divide-border border-t border-border">
          {definitions.map(([term, description]) => <div key={term} className="py-5"><dt className="font-semibold">{term}</dt><dd className="mt-1 text-sm leading-6 text-muted-foreground">{description}</dd></div>)}
        </dl>
      </div>

      <div className="mt-14 grid gap-10 border-t-2 border-foreground pt-8 sm:grid-cols-2">
        <section><h2 className="font-serif text-2xl font-bold">Denominators</h2><p className="mt-3 text-sm leading-6 text-muted-foreground">Receipt-bar percentages use total receipts for that candidate. Geographic shares use only itemized individual dollars, because those records contain donor location information. Every displayed percentage states which denominator it uses.</p></section>
        <section><h2 className="font-serif text-2xl font-bold">Itemized donors</h2><p className="mt-3 text-sm leading-6 text-muted-foreground">Itemized means individual donors who gave more than $200 to the campaign in the cycle; campaigns must report their name and address. Unitemized donor location is unknown.</p></section>
        <section><h2 className="font-serif text-2xl font-bold">Context</h2><p className="mt-3 text-sm leading-6 text-muted-foreground">Giving to candidates in other states is legal and common. These figures describe where reported contributions came from; they do not evaluate candidates or donors.</p></section>
        <section><h2 className="font-serif text-2xl font-bold">Cycles</h2><p className="mt-3 text-sm leading-6 text-muted-foreground">Each cycle is a two-year period ending in the even year shown (for example, 2020 covers January 2019 through December 2020). Cycles 2016 through 2026 are available. Each cycle covers different Senate seats, because one-third of the Senate is elected every two years. The 2026 cycle is in progress: its figures include data through the latest FEC filing and will change.</p></section>
        <section><h2 className="font-serif text-2xl font-bold">Special elections</h2><p className="mt-3 text-sm leading-6 text-muted-foreground">When a state holds more than one Senate race in a cycle (a regular and a special election), all of its candidates are shown together on the race page with the note "Includes special-election candidates".</p></section>
        <section><h2 className="font-serif text-2xl font-bold">Source</h2><p className="mt-3 text-sm leading-6 text-muted-foreground">All figures come live from the Federal Election Commission's OpenFEC API, for the selected two-year period. Completed cycles (2016–2022) are cached indefinitely, 2024 for 30 days and 2026 for 24 hours. If a figure is missing, it is shown as "data unavailable".</p></section>
        <section><h2 className="font-serif text-2xl font-bold">Credits</h2><p className="mt-3 text-sm leading-6 text-muted-foreground">Data courtesy of the U.S. Federal Election Commission (FEC). Built with support from the GW Open Source Program Office (GW OSPO).</p></section>
      </div>
    </main>
  );
}
