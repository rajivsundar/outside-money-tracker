import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { detailQuery, houseCandidatesQuery } from "@/lib/fec";
import { readComputed, updateComputeStatus } from "@/lib/results";

/** Loads a state's House candidates; when `auto`, computes uncomputed ones one by one and records progress. */
export function useHouseState(st: string, cycle: number, auto: boolean) {
  const qc = useQueryClient();
  const cands = useQuery({ ...houseCandidatesQuery(st, cycle), enabled: auto });
  const computed = useQuery({ queryKey: ["computed", "house", cycle, st], queryFn: () => readComputed("house", cycle, st), staleTime: 30_000 });
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const run = useRef(0);

  useEffect(() => {
    if (!auto || !cands.data || computed.isLoading) return;
    const id = ++run.current;
    const list = cands.data;
    const have = new Set((computed.data ?? []).map((r) => r.cand_id));
    const todo = list.filter((c) => !have.has(c.id));
    if (!todo.length) { setProgress(null); if (list.length) void updateComputeStatus("house", cycle, st, list.length, list.length); return; }
    (async () => {
      let done = list.length - todo.length;
      setProgress({ done, total: list.length });
      for (const c of todo) {
        if (run.current !== id) return;
        try { await qc.fetchQuery(detailQuery(c, cycle, "house")); } catch { /* shown as data unavailable */ }
        done++;
        if (run.current !== id) return;
        setProgress({ done, total: list.length });
        void updateComputeStatus("house", cycle, st, list.length, done);
        if (done % 3 === 0 || done === list.length) void qc.invalidateQueries({ queryKey: ["computed", "house", cycle, st] });
      }
      setProgress(null);
    })();
    return () => { run.current++; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, cands.data, computed.isLoading, cycle, st]);

  return { cands, computed, progress };
}

export const districtLabel = (d: string | null | undefined, atLarge: boolean) =>
  !d || atLarge || d === "00" ? "At-large" : String(Number(d));
