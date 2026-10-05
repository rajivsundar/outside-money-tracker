import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { DonorLocationBar, ReceiptBar, formatMoney } from "@/components/finance";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { STATE_NAME, type Chamber } from "@/config";
import { detailQuery, type CandidateSummary } from "@/lib/fec";
import { UNRELIABLE_NOTE, candidateView, detailGeoReliable, formatShare } from "@/lib/share";

export function CandidateBlock({ c, cycle, chamber = "senate" }: { c: CandidateSummary; cycle: number; chamber?: Chamber }) {
  const { data, isLoading, isError } = useQuery(detailQuery(c, cycle, chamber));
  const stateName = STATE_NAME[c.state] ?? c.state;
  const view = data ? candidateView(data, stateName, c.id) : null;
  return (
    <article className="border-t-2 border-foreground pt-5">
      <div className="mb-6 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="text-xs text-muted-foreground">{c.party}</p><h3 className="font-serif text-2xl font-bold">{c.name}</h3>
          {data && !data.reconciles && <Link to="/methodology" hash="reconciliation" className="mt-1 inline-block rounded-sm border border-border bg-muted px-2 py-0.5 text-xs text-muted-foreground hover:underline" title={`Donor-state rows ${formatMoney(data.donorStateSum)} vs itemized individual ${formatMoney(data.itemized)}`}>Totals don't reconcile — see methodology</Link>}
          {data && !detailGeoReliable(data) && <p className="mt-2 max-w-xl text-xs text-muted-foreground">{UNRELIABLE_NOTE}</p>}</div>
        {view?.headline && (
          <div className="sm:max-w-sm sm:text-right">
            {view.headline.text ? <p className="font-mono text-3xl font-bold text-out-state">{view.headline.value} <span className="block font-sans text-sm font-normal text-foreground">{view.headline.text}</span></p> : <p className="text-sm text-muted-foreground">{view.headline.value}</p>}
            {view.subline && <p className="mt-1 text-xs text-muted-foreground">{view.subline}</p>}
          </div>
        )}
      </div>
      {isLoading && <p className="text-sm text-muted-foreground">Loading FEC data…</p>}
      {isError && <p className="text-sm text-muted-foreground">Data unavailable.</p>}
      {data && <>
        <p className="mb-3 font-mono text-sm">{formatMoney(data.receipts, true)} <span className="font-sans text-xs text-muted-foreground">total receipts</span></p>
        {view?.barA && <ReceiptBar rows={view.barA} label={`${c.name} receipts by type`} />}
        <DonorLocationBar rows={view?.barB ?? null} donorDollars={data.donorStateSum} label={`${c.name} located donors by state`} />
        <div className="mt-8">
          <h4 className="mb-1 text-sm font-bold">Top 10 donor states</h4>
          <p className="mb-3 text-xs text-muted-foreground">Shares are of the sum of this candidate's principal-committee donor-state rows ({formatMoney(data.donorStateSum)}; FEC itemized individual total {formatMoney(data.itemized)}).</p>
          {data.donorStates.length === 0 ? <p className="text-sm text-muted-foreground">Data unavailable.</p> : (
            <Table>
              <TableHeader><TableRow><TableHead>State</TableHead><TableHead className="text-right">Amount</TableHead><TableHead className="text-right">Share of located donor dollars</TableHead></TableRow></TableHeader>
              <TableBody>
                {(() => { const sum = data.donorStates.reduce((s, d) => s + d.total, 0); return data.donorStates.slice(0, 10).map((d) => (
                  <TableRow key={d.state}><TableCell className="font-medium">{d.name}</TableCell><TableCell className="text-right font-mono tabular-nums">{formatMoney(d.total)}</TableCell><TableCell className="text-right font-mono font-semibold tabular-nums">{formatShare((d.total / sum) * 100, `${c.id} donor state ${d.state}`)}</TableCell></TableRow>
                )); })()}
              </TableBody>
            </Table>
          )}
        </div>
      </>}
    </article>
  );
}
