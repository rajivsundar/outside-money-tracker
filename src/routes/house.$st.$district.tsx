import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { CategoryLegend } from "@/components/finance";
import { TopOrgs } from "@/components/top-orgs";
import { CandidateBlock } from "@/components/candidate-block";
import { STATE_NAME, cycleLabel, parseCycle } from "@/config";
import { houseCandidatesQuery } from "@/lib/fec";
import { districtLabel } from "@/lib/house";

export const Route = createFileRoute("/house/$st/$district")({
  head: ({ params }) => {
    const code = params.st.toUpperCase();
    const label = params.district === "00" ? "At-large" : `District ${Number(params.district)}`;
    const t = `${STATE_NAME[code] ?? code} ${label} House money — Outside Money`;
    const d = `Where U.S. House candidates in ${STATE_NAME[code] ?? code} ${label} raised their money, from FEC data.`;
    return { meta: [
      { title: t }, { name: "description", content: d }, { property: "og:title", content: t }, { property: "og:description", content: d },
      { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" },
    ] };
  },
  validateSearch: (s: Record<string, unknown>) => ({ cycle: parseCycle(s["cycle"]) }),
  component: DistrictPage,
});

function DistrictPage() {
  const { st, district } = Route.useParams();
  const code = st.toUpperCase();
  const { cycle } = Route.useSearch();
  const { data, isLoading, isError } = useQuery(houseCandidatesQuery(code, cycle));
  const districts = new Set((data ?? []).map((c) => c.district ?? "00"));
  const atLarge = districts.size === 1;
  const cands = (data ?? []).filter((c) => (c.district ?? "00") === district);
  const label = districtLabel(district, atLarge);

  return (
    <main>
      <section className="border-b border-border bg-primary text-primary-foreground">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-12">
          <Link to="/state/$st" params={{ st }} search={{ cycle, chamber: "house" }} className="mb-6 inline-flex items-center gap-1 text-sm text-primary-subtle hover:text-primary-foreground"><ArrowLeft className="size-4" />{STATE_NAME[code] ?? code}</Link>
          <p className="mb-3 font-mono text-xs font-semibold uppercase tracking-widest text-primary-muted">{cycle} U.S. House race</p>
          <h1 className="font-serif text-4xl font-bold sm:text-5xl">{STATE_NAME[code] ?? code} · {label === "At-large" ? "At-large" : `District ${label}`}</h1>
          <p className="mt-3 text-sm text-primary-subtle">{cycleLabel(cycle)}</p>
        </div>
      </section>
      <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <p className="mb-6 max-w-2xl text-sm text-muted-foreground">Out-of-state means a donor state other than {STATE_NAME[code] ?? code}.</p>
        <div className="mb-8 max-w-2xl rounded-md border border-border bg-muted p-4 text-sm text-muted-foreground">Out-of-district: coming next — it needs donor ZIP codes matched to each election's district map, which the FEC does not summarize per candidate.</div>
        {isLoading && <p className="text-muted-foreground">Loading candidates…</p>}
        {isError && <p className="text-muted-foreground">Data unavailable.</p>}
        {data && !cands.length && <p className="text-muted-foreground">No candidates with over $100,000 in receipts were found for this district in {cycle}.</p>}
        {cands.length > 0 && <>
          <div className="mb-8"><CategoryLegend /></div>
          <div className="space-y-12">{cands.map((c) => <CandidateBlock key={`${cycle}-${c.id}`} c={c} cycle={cycle} chamber="house" />)}</div>
          <TopOrgs chamber="house" cycle={cycle} state={code} district={district} cands={cands} />
        </>}
      </section>
    </main>
  );
}
