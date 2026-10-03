import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { CategoryLegend, ChamberToggle, CycleSelect, RaceLink, ShareLegend, shareColor } from "@/components/finance";
import { CandidateBlock } from "@/components/candidate-block";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { STATE_NAME, cycleLabel, parseChamber, parseCycle } from "@/config";
import { candidatesQuery, groupRaces } from "@/lib/fec";
import { groupMedians } from "@/lib/results";
import { districtLabel, useHouseState } from "@/lib/house";

export const Route = createFileRoute("/state/$st")({
  head: ({ params }) => {
    const code = params.st.toUpperCase();
    const name = STATE_NAME[code] ?? code;
    const d = `Where ${name}'s U.S. Senate and House candidates raised their money, from FEC data.`;
    return { meta: [
      { title: `${name} congressional money — Outside Money` },
      { name: "description", content: d },
      { property: "og:title", content: `${name} congressional money — Outside Money` },
      { property: "og:description", content: d },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ] };
  },
  validateSearch: (s: Record<string, unknown>) => ({ cycle: parseCycle(s["cycle"]), chamber: parseChamber(s["chamber"]) }),
  component: StatePage,
});

function StatePage() {
  const { st } = Route.useParams();
  const code = st.toUpperCase();
  const { cycle, chamber } = Route.useSearch();
  const navigate = useNavigate();
  const name = STATE_NAME[code] ?? code;
  const nav = (p: { cycle?: number; chamber?: "senate" | "house" }) => navigate({ to: "/state/$st", params: { st }, search: { cycle, chamber, ...p } });

  return (
    <main>
      <section className="border-b border-border bg-primary text-primary-foreground">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-12">
          <Link to="/" search={{ cycle, chamber }} className="mb-6 inline-flex items-center gap-1 text-sm text-primary-subtle hover:text-primary-foreground"><ArrowLeft className="size-4" />Map</Link>
          <h1 className="font-serif text-4xl font-bold sm:text-6xl">{name}</h1>
          <p className="mt-3 text-sm text-primary-subtle">{cycleLabel(cycle)}</p>
          <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-end">
            <ChamberToggle dark value={chamber} onChange={(c) => nav({ chamber: c })} />
            <div className="sm:w-96"><CycleSelect dark value={cycle} onChange={(c) => nav({ cycle: c })} /></div>
          </div>
        </div>
      </section>
      {chamber === "house" ? <><HouseSection code={code} cycle={cycle} /><SenateSection code={code} cycle={cycle} compact /></> : <><SenateSection code={code} cycle={cycle} /><HouseSection code={code} cycle={cycle} passive /></>}
    </main>
  );
}

function SenateSection({ code, cycle, compact = false }: { code: string; cycle: number; compact?: boolean }) {
  const { data, isLoading, isError } = useQuery(candidatesQuery(cycle));
  const race = data ? groupRaces(data, cycle).find((r) => r.state === code) : undefined;
  return (
    <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <p className="section-kicker">U.S. Senate</p>
      <h2 className="section-title mb-4">Senate race{race?.special ? "s" : ""}</h2>
      {isLoading && <p className="text-muted-foreground">Loading candidates…</p>}
      {isError && <p className="text-muted-foreground">Data unavailable.</p>}
      {data && !race && <p className="text-muted-foreground">No Senate race in {cycle} (no candidates with over $100,000 in receipts).</p>}
      {race?.special && <p className="mb-4 text-sm font-semibold text-muted-foreground">Includes special-election candidates</p>}
      {race && (compact ? (
        <div><p className="text-sm text-muted-foreground">{race.candidates.map((c) => c.name).join(" · ")}</p><div className="mt-2"><RaceLink code={code} cycle={cycle}>View Senate race</RaceLink></div></div>
      ) : <>
        <div className="mb-8"><CategoryLegend /></div>
        <div className="space-y-12">{race.candidates.map((c) => <CandidateBlock key={`${cycle}-${c.id}`} c={c} cycle={cycle} />)}</div>
      </>)}
    </section>
  );
}

function HouseSection({ code, cycle, passive = false }: { code: string; cycle: number; passive?: boolean }) {
  const navigate = useNavigate();
  const { cands, computed, progress } = useHouseState(code, cycle, !passive);
  const [asTable, setAsTable] = useState(false);
  const rows = computed.data ?? [];
  const medians = groupMedians(rows, (r) => r.district ?? "00");
  const districts = [...new Set([...(cands.data ?? []).map((c) => c.district ?? "00"), ...rows.map((r) => r.district ?? "00")])].sort();
  const atLarge = districts.length === 1;
  const totals = new Map<string, number>();
  for (const c of cands.data ?? []) totals.set(c.district ?? "00", (totals.get(c.district ?? "00") ?? 0) + 1);
  const status = (d: string) => {
    const m = medians.get(d);
    if (!m) return "Not computed yet";
    const of = totals.get(d) ? ` of ${totals.get(d)}` : "";
    return m.median === null ? `Data unavailable · ${m.count}${of} computed` : `Median ${m.median.toFixed(1)}% of itemized individual dollars from out of state · ${m.count}${of} candidates computed`;
  };
  const open = (d: string) => navigate({ to: "/house/$st/$district", params: { st: code.toLowerCase(), district: d }, search: { cycle } });

  return (
    <section className="border-t border-border bg-muted/40">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <p className="section-kicker">U.S. House</p>
        <h2 className="section-title">House districts</h2>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">Out-of-state means a donor state other than {STATE_NAME[code] ?? code}. In-district vs out-of-district is coming later — it needs ZIP-level data. Tiles are equal-size and ordered by district number, not map boundaries.</p>
        {passive && !rows.length && <p className="mt-4 text-sm"><Link to="/state/$st" params={{ st: code.toLowerCase() }} search={{ cycle, chamber: "house" }} className="font-semibold text-primary hover:underline">Switch to House to load this state's districts</Link></p>}
        {progress && <div className="mt-5 max-w-lg"><Progress value={(progress.done / Math.max(1, progress.total)) * 100} /><p className="mt-1 text-xs text-muted-foreground">Loading {progress.done} of {progress.total} candidates from the FEC</p></div>}
        {cands.isLoading && <p className="mt-4 text-sm text-muted-foreground">Loading House candidates from the FEC…</p>}
        {cands.isError && <p className="mt-4 text-sm text-muted-foreground">Data unavailable. The FEC service could not be reached.</p>}
        {cands.data && !cands.data.length && <p className="mt-4 text-sm text-muted-foreground">No House candidates with over $100,000 in receipts were found for {cycle}.</p>}
        {districts.length > 0 && <>
          <div className="mt-6 flex justify-end"><Button variant="outline" size="sm" aria-pressed={asTable} onClick={() => setAsTable((v) => !v)}>{asTable ? "View as tiles" : "View as table"}</Button></div>
          {asTable ? (
            <Table className="mt-3">
              <TableHeader><TableRow><TableHead>District</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
              <TableBody>{districts.map((d) => (
                <TableRow key={d}><TableCell><button className="font-semibold text-primary hover:underline" onClick={() => open(d)}>{districtLabel(d, atLarge)}</button></TableCell><TableCell className="text-sm text-muted-foreground">{status(d)}</TableCell></TableRow>
              ))}</TableBody>
            </Table>
          ) : (
            <ul className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(4.5rem,1fr))] gap-2">
              {districts.map((d) => {
                const m = medians.get(d);
                const v = m?.median ?? null;
                return (
                  <li key={d}>
                    <button onClick={() => open(d)} aria-label={`District ${districtLabel(d, atLarge)}: ${status(d)}`} title={status(d)}
                      className={`flex aspect-square w-full flex-col items-center justify-center rounded-md border border-border text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${v === null ? "hatch" : ""}`}
                      style={v === null ? undefined : { background: shareColor(v) }}>
                      <span className="rounded bg-background/85 px-1.5 font-mono text-sm font-bold">{districtLabel(d, atLarge)}</span>
                      <span className="mt-1 rounded bg-background/85 px-1 font-mono text-[10px]">{v === null ? (m ? "n/a" : "—") : `${v.toFixed(0)}%`}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="mt-5"><ShareLegend /></div>
        </>}
      </div>
    </section>
  );
}
