import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ReceiptBar, formatMoney } from "@/components/finance";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Chamber } from "@/config";
import { detailQuery, type CandidateSummary } from "@/lib/fec";

export function CandidateBlock({ c, cycle, chamber = "senate" }: { c: CandidateSummary; cycle: number; chamber?: Chamber }) {
  const { data, isLoading, isError } = useQuery(detailQuery(c, cycle, chamber));
  return (
    <article className="border-t-2 border-foreground pt-5">
      <div className="mb-6 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="text-xs text-muted-foreground">{c.party}</p><h3 className="font-serif text-2xl font-bold">{c.name}</h3>
          {data && !data.reconciles && <Link to="/methodology" hash="reconciliation" className="mt-1 inline-block rounded-sm border border-border bg-muted px-2 py-0.5 text-xs text-muted-foreground hover:underline" title={`Donor-state rows ${formatMoney(data.donorStateSum)} vs itemized individual ${formatMoney(data.itemized)}`}>Totals don't reconcile — see methodology</Link>}</div>
        {data?.outShare != null && <p className="font-mono text-3xl font-bold text-out-state">{data.outShare.toFixed(1)}% <span className="block font-sans text-xs font-normal text-muted-foreground sm:inline">out-of-state share of itemized individual dollars</span></p>}
      </div>
      {isLoading && <p className="text-sm text-muted-foreground">Loading FEC data…</p>}
      {isError && <p className="text-sm text-muted-foreground">Data unavailable.</p>}
      {data && <>
        <p className="mb-3 font-mono text-sm">{formatMoney(data.receipts, true)} <span className="font-sans text-xs text-muted-foreground">total receipts</span></p>
        <ReceiptBar categories={data.categories} label={`${c.name} receipt composition`} />
        <div className="mt-8">
          <h4 className="mb-1 text-sm font-bold">Top 10 donor states</h4>
          <p className="mb-3 text-xs text-muted-foreground">Shares are of the sum of this candidate's principal-committee donor-state rows ({formatMoney(data.donorStateSum)}; FEC itemized individual total {formatMoney(data.itemized)}).</p>
          {data.donorStates.length === 0 ? <p className="text-sm text-muted-foreground">Data unavailable.</p> : (
            <Table>
              <TableHeader><TableRow><TableHead>State</TableHead><TableHead className="text-right">Amount</TableHead><TableHead className="text-right">Share</TableHead></TableRow></TableHeader>
              <TableBody>
                {(() => { const sum = data.donorStates.reduce((s, d) => s + d.total, 0); return data.donorStates.slice(0, 10).map((d) => (
                  <TableRow key={d.state}><TableCell className="font-medium">{d.name}</TableCell><TableCell className="text-right font-mono tabular-nums">{formatMoney(d.total)}</TableCell><TableCell className="text-right font-mono font-semibold tabular-nums">{((d.total / sum) * 100).toFixed(1)}%</TableCell></TableRow>
                )); })()}
              </TableBody>
            </Table>
          )}
        </div>
      </>}
    </article>
  );
}
