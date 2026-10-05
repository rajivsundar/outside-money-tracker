import { createFileRoute } from "@tanstack/react-router";
import { CategoryLegend } from "@/components/finance";
import { GEO_TOLERANCE } from "@/lib/share";

export const Route = createFileRoute("/methodology")({
  head: () => ({ meta: [
    { title: "Methodology — Outside Money" },
    { name: "description", content: "How Outside Money classifies and maps U.S. Senate and House campaign receipts, 2016–2026." },
    { property: "og:title", content: "Methodology — Outside Money" },
    { property: "og:description", content: "How Outside Money classifies and maps U.S. Senate and House campaign receipts, 2016–2026." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: MethodologyPage,
});

const definitions = [
  ["Itemized individual donors", "Individual contributions the campaign itemized (FEC: individual_itemized_contributions), shown as a share of total receipts."],
  ["In-state", "Dollars in the race state's row of the principal campaign committee's FEC donor-state totals, used directly (no scaling)."],
  ["Out-of-state", "The sum of every other donor-state row. Military addresses (AA, AE, AP), unknown (ZZ) and U.S. territories count as out-of-state."],
  ["Small donors (location not reported)", "Unitemized individual contributions. Donors who give $200 or less in the cycle are not itemized, so their location is unknown."],
  ["PACs", "Contributions from other political committees (FEC: other_political_committee_contributions)."],
  ["Party", "Contributions from political party committees."],
  ["Self-funding", "Candidate contributions plus loans made by the candidate."],
  ["Transfers & other", "The remainder of total receipts after the categories above, so the receipts bar always adds to 100%: transfers from joint fundraising and other authorized committees, offsets, refunds and other receipts. Money raised through joint fundraising committees arrives as transfers; its donors' locations are not counted here."],
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
        <section id="two-questions"><h2 className="font-serif text-2xl font-bold">Two different questions</h2><p className="mt-3 text-sm leading-6 text-muted-foreground">“Of the donors whose location we know, how many live outside the state?” and “How much of all the money raised came from outside the state?” are different questions with different denominators. The first is our ranking metric: the out-of-state share of located donor dollars. The second can only be a lower bound. Example: for Thomas Massie (KY-04, 2026), 93.4% of located donor dollars came from outside Kentucky, but those same out-of-state dollars are 57.0% of all receipts, because receipts also include small donors whose location is not reported, PACs, party money, self-funding and transfers. Example figures as of October 4, 2026 FEC data; they change as new filings arrive. Both figures are correct; they divide the same out-of-state dollars by different totals. Small-donor money has no location because campaigns only report a donor's name and address once the donor has given more than $200 in the cycle, so we cannot say where those dollars came from.</p></section>
        <section><h2 className="font-serif text-2xl font-bold">Two bars, two denominators</h2><p className="mt-3 text-sm leading-6 text-muted-foreground">Each candidate has two bars. “Where the money came from” splits total receipts by type (itemized individual donors, small donors whose location is not reported, PACs, party, self-funding, transfers &amp; other); it has no geography and always adds to 100% of all receipts. “Where located donors live” splits located donor dollars (the FEC donor-state totals) into in-state and outside-the-state, so its denominator is located donor dollars, not receipts. The headline above them is Bar B's outside-the-state value; the line under it gives the lower bound as a share of all receipts. Every displayed percentage states which denominator it uses.</p></section>
        <section id="pooled"><h2 className="font-serif text-2xl font-bold">Pooled shares</h2><p className="mt-3 text-sm leading-6 text-muted-foreground">When several candidates are combined (a House district), the pooled share is sum(out-of-state donor dollars) ÷ sum(donor-state dollars), where both sums come from the same FEC donor-state rows. It is never divided by a different pool, such as itemized gifts, so it cannot exceed 100%.</p></section>
        <section id="reliability"><h2 className="font-serif text-2xl font-bold">Reliability rule</h2><p className="mt-3 text-sm leading-6 text-muted-foreground">FEC donor-state totals can include donors whose gifts reached a campaign through joint fundraising committees, which the campaign itself reports as transfers. A candidate's donor locations are treated as reliable only when donor-state dollars ≤ {GEO_TOLERANCE} × (itemized individual dollars + transfers &amp; other). Candidates that fail the rule keep their own page, with a note, but are left out of rankings, map medians, the leaderboard and trends.</p></section>
        <section id="range-guard"><h2 className="font-serif text-2xl font-bold">0–100% guard</h2><p className="mt-3 text-sm leading-6 text-muted-foreground">A share below 0% or above 100% is not a real percentage. We never display one: it is logged and the figure is shown as “data unavailable”.</p></section>
        <section><h2 className="font-serif text-2xl font-bold">Principal committee rule</h2><p className="mt-3 text-sm leading-6 text-muted-foreground">Every figure for a candidate comes from their principal campaign committee for the cycle (FEC designation P): receipts from that committee's totals, and donor states from that committee's Schedule A by-state totals. Joint fundraising and other committees are not added in. Geographic shares are the out-of-state rows divided by the sum of all donor-state rows.</p></section>
        <section id="reconciliation"><h2 className="font-serif text-2xl font-bold">Reconciliation check</h2><p className="mt-3 text-sm leading-6 text-muted-foreground">For each candidate we compare the sum of donor-state rows with the committee's reported itemized individual contributions. If they differ by more than 5%, the candidate shows "Totals don't reconcile" and both numbers are listed. We don't hide or adjust the difference. One known cause: the FEC's by-state totals can include memo entries for donors whose gifts reached the campaign through joint fundraising transfers.</p></section>
        <section><h2 className="font-serif text-2xl font-bold">Itemized donors</h2><p className="mt-3 text-sm leading-6 text-muted-foreground">Itemized means individual donors who gave more than $200 to the campaign in the cycle; campaigns must report their name and address. Unitemized donor location is unknown.</p></section>
        <section><h2 className="font-serif text-2xl font-bold">Context</h2><p className="mt-3 text-sm leading-6 text-muted-foreground">Giving to candidates in other states is legal and common. These figures describe where reported contributions came from; they do not evaluate candidates or donors.</p></section>
        <section><h2 className="font-serif text-2xl font-bold">Cycles</h2><p className="mt-3 text-sm leading-6 text-muted-foreground">Each cycle is a two-year period ending in the even year shown (for example, 2020 covers January 2019 through December 2020). Cycles 2016 through 2026 are available. Each cycle covers different Senate seats, because one-third of the Senate is elected every two years. The 2026 cycle is in progress: its figures include data through the latest FEC filing and will change.</p></section>
        <section><h2 className="font-serif text-2xl font-bold">Special elections</h2><p className="mt-3 text-sm leading-6 text-muted-foreground">When a state holds more than one Senate race in a cycle (a regular and a special election), all of its candidates are shown together on the race page with the note "Includes special-election candidates".</p></section>
        <section><h2 className="font-serif text-2xl font-bold">Source</h2><p className="mt-3 text-sm leading-6 text-muted-foreground">All figures come live from the Federal Election Commission's OpenFEC API, for the selected two-year period. Completed cycles (2016–2022) are cached indefinitely, 2024 for 30 days and 2026 for 24 hours. If a figure is missing, it is shown as "data unavailable".</p></section>
        <section><h2 className="font-serif text-2xl font-bold">House races</h2><p className="mt-3 text-sm leading-6 text-muted-foreground">For House candidates the geographic measure is state-level for now: out-of-state share of located donor dollars means donors outside the district's state. Out-of-district analysis is the next phase: it needs donor ZIP codes matched to each election's district map, which the FEC does not summarize per candidate. House states are computed on demand when a visitor opens them.</p></section>
        <section><h2 className="font-serif text-2xl font-bold">District tiles</h2><p className="mt-3 text-sm leading-6 text-muted-foreground">House districts are shown as equal-size tiles ordered by district number, not as geographic boundaries, because several states redrew their maps for 2026. States with a single seat are labeled "At-large".</p></section>
        <section><h2 className="font-serif text-2xl font-bold">Top districts</h2><p className="mt-3 text-sm leading-6 text-muted-foreground">A district's out-of-state share of located donor dollars pools its candidates: the sum of their out-of-state donor dollars divided by the sum of their donor-state dollars (donor dollars located), for candidates that pass the reliability rule. Districts with under $100,000 in donor dollars located are excluded. Rankings cover only districts loaded so far.</p></section>
        <section><h2 className="font-serif text-2xl font-bold">Top out-of-state organizations</h2><p className="mt-3 text-sm leading-6 text-muted-foreground">For each candidate's principal campaign committee we read its largest contributions from committees (up to 500 records per candidate): Form 3 line 11B (party committees) and line 11C (PACs and other committees). Memo entries (memo code X) are dropped, as are transfers from the candidate's own authorized committees and joint fundraising committees. Amounts are summed by contributor committee across all candidates in the race, and only contributors whose reported state differs from the race's state are kept. Individual donors are never named.</p></section>
        <section><h2 className="font-serif text-2xl font-bold">Map colours</h2><p className="mt-3 text-sm leading-6 text-muted-foreground">Each state's and tile's colour is the median out-of-state share of located donor dollars among the candidates computed so far that pass the reliability rule. Hatched areas mean no data (not computed yet, or no Senate race that cycle), never zero. Every map and tile grid also has a "View as table" option.</p></section>
        <section><h2 className="font-serif text-2xl font-bold">Credits</h2><p className="mt-3 text-sm leading-6 text-muted-foreground">Data courtesy of the U.S. Federal Election Commission (FEC). Built with support from the GW Open Source Program Office (GW OSPO).</p></section>
      </div>
    </main>
  );
}
