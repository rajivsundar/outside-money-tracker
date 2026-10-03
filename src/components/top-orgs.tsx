import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatMoney } from "@/components/finance";
import type { Chamber } from "@/config";
import type { CandidateSummary } from "@/lib/fec";
import { loadOrComputeTopOrgs, storedTopOrgsQuery } from "@/lib/orgs";

export function TopOrgs({ chamber, cycle, state, district, cands }: { chamber: Chamber; cycle: number; state: string; district: string; cands: CandidateSummary[] }) {
  const qc = useQueryClient();
  const q = storedTopOrgsQuery(chamber, cycle, state, district);
  const { data, isLoading } = useQuery(q);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);
  const run = async () => {
    setBusy(true); setErr(false);
    try { qc.setQueryData(q.queryKey, await loadOrComputeTopOrgs(chamber, cycle, state, district, cands)); }
    catch { setErr(true); } finally { setBusy(false); }
  };
  return (
    <section className="mt-14 border-t-2 border-foreground pt-6">
      <h2 className="section-title">Top out-of-state organizations giving to this race</h2>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">Organizations only — PACs, party and other committees. Individual donors are not named.</p>
      {isLoading && <p className="mt-4 text-sm text-muted-foreground">Checking saved results…</p>}
      {!isLoading && !data && !busy && (
        <div className="mt-4"><Button variant="outline" onClick={run}>Load top organizations</Button>
          <p className="mt-2 text-xs text-muted-foreground">Not computed yet. Loading reads up to a few FEC pages per candidate and can take a few minutes.</p></div>
      )}
      {busy && <p className="mt-4 text-sm text-muted-foreground">Loading committee contributions from the FEC…</p>}
      {err && <p className="mt-4 text-sm text-muted-foreground">Data unavailable.</p>}
      {data && data.length === 0 && <p className="mt-4 text-sm text-muted-foreground">No out-of-state committee contributions found in the records read.</p>}
      {data && data.length > 0 && (
        <Table className="mt-4">
          <TableHeader><TableRow><TableHead>#</TableHead><TableHead>Organization</TableHead><TableHead>State</TableHead><TableHead className="text-right">Total to this race</TableHead><TableHead>Funded</TableHead></TableRow></TableHeader>
          <TableBody>{data.map((o) => (
            <TableRow key={o.rank}><TableCell className="font-mono">{o.rank}</TableCell><TableCell className="font-medium">{o.contributor_name}</TableCell><TableCell>{o.contributor_state}</TableCell><TableCell className="text-right font-mono tabular-nums">{formatMoney(o.total)}</TableCell><TableCell className="text-sm text-muted-foreground">{o.candidates}</TableCell></TableRow>
          ))}</TableBody>
        </Table>
      )}
    </section>
  );
}
