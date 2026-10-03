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
  ["In-state", "Itemized contributions from individuals whose reported address is in the candidate’s state."],
  ["Out-of-state", "Itemized contributions from individuals whose reported address is outside the candidate’s state."],
  ["Unknown small donors", "Unitemized individual contributions and records without enough location detail to classify."],
  ["PACs", "Receipts from political action committees and other committees, excluding party committees."],
  ["Party", "Receipts attributed to national, state, or local party committees."],
  ["Self & other", "Candidate contributions and loans, transfers, refunds, offsets, and other receipts."],
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
        <section><h2 className="font-serif text-2xl font-bold">Rounding</h2><p className="mt-3 text-sm leading-6 text-muted-foreground">Receipt categories are shown as whole percentages and sum to 100%. Geographic shares are shown to one decimal place in detail views. Dollar totals may be compacted for summaries and shown in full in tables.</p></section>
        <section><h2 className="font-serif text-2xl font-bold">Scope</h2><p className="mt-3 text-sm leading-6 text-muted-foreground">This demonstration covers three 2024 U.S. Senate races. It does not include independent spending, candidate support or opposition by outside groups, or election outcomes.</p></section>
        <section><h2 className="font-serif text-2xl font-bold">Data status</h2><p className="mt-3 text-sm leading-6 text-muted-foreground">All names and amounts are placeholder data bundled with this demonstration. They are not Federal Election Commission records and should not be cited as factual campaign-finance figures.</p></section>
      </div>
    </main>
  );
}
