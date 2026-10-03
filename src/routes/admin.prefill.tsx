import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { CYCLES, STATES, type Chamber } from "@/config";
import { detailQuery, fetchCandidates, useFecStatus, type CandidateSummary } from "@/lib/fec";
import { loadOrComputeTopOrgs } from "@/lib/orgs";
import { readCompleteStates, readComputed, updateComputeStatus } from "@/lib/results";

export const Route = createFileRoute("/admin/prefill")({
  head: () => ({
    meta: [
      { title: "Prefill saved results — Outside Money" },
      { name: "description", content: "Admin tool that computes and saves FEC results for every cycle, chamber and state." },
      { property: "og:title", content: "Prefill saved results — Outside Money" },
      { property: "og:description", content: "Admin tool that computes and saves FEC results for every cycle, chamber and state." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PrefillPage,
});

const PLAN: [number, Chamber][] = [2026, 2024, 2022, 2020, 2018, 2016].flatMap((c) => [[c, "senate"], [c, "house"]] as [number, Chamber][]);
const ALL = Object.values(STATES).map(([p]) => p).sort();
type Prog = { statesDone: number; statesTotal: number | null; candsDone: number; candsTotal: number };
const key = (c: number, ch: Chamber) => `${c}-${ch}`;

function PrefillPage() {
  const qc = useQueryClient();
  const fec = useFecStatus();
  const [priority, setPriority] = useState("MD, VA, PA, TX, CA");
  const [state, setState] = useState<"idle" | "running" | "paused" | "done">("idle");
  const [other, setOther] = useState(false);
  const [onlyCh, setOnlyCh] = useState<Chamber>("senate");
  const [onlyCycle, setOnlyCycle] = useState(2026);
  const [fullQueue, setFullQueue] = useState(false);
  const [skipOrgs, setSkipOrgs] = useState(true);
  const [prog, setProg] = useState<Record<string, Prog>>({});
  const [current, setCurrent] = useState("");
  const [log, setLog] = useState<string[]>([]);
  const [wake, setWake] = useState<string>("");
  const paused = useRef(false);
  const running = useRef(false);
  const chan = useRef<BroadcastChannel | null>(null);
  const started = useRef(0);
  const doneThisRun = useRef(0);

  const add = (m: string) => setLog((l) => [`${new Date().toLocaleTimeString()} ${m}`, ...l].slice(0, 20));
  const upd = (k: string, p: Partial<Prog>) => setProg((s) => ({ ...s, [k]: { statesDone: 0, statesTotal: null, candsDone: 0, candsTotal: 0, ...s[k], ...p } }));

  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const ch = new BroadcastChannel("outside-money-prefill");
    chan.current = ch;
    ch.onmessage = (e) => {
      if (e.data === "ping" && running.current) ch.postMessage("running");
      if (e.data === "running") setOther(true);
      if (e.data === "stopped") setOther(false);
    };
    ch.postMessage("ping");
    return () => { if (running.current) ch.postMessage("stopped"); ch.close(); };
  }, []);

  const otherRunning = () => new Promise<boolean>((res) => {
    const ch = chan.current; if (!ch) return res(false);
    let seen = false;
    const h = (e: MessageEvent) => { if (e.data === "running") seen = true; };
    ch.addEventListener("message", h); ch.postMessage("ping");
    setTimeout(() => { ch.removeEventListener("message", h); res(seen); }, 400);
  });

  const gate = async () => { while (paused.current) await new Promise((r) => setTimeout(r, 500)); };

  async function start() {
    if (await otherRunning()) { setOther(true); return; }
    running.current = true; paused.current = false; setState("running");
    started.current = Date.now(); doneThisRun.current = 0;
    let lock: any = null;
    try { if ("wakeLock" in navigator) { lock = await (navigator as any).wakeLock.request("screen"); setWake("Screen kept awake"); } else setWake("Wake lock not supported in this browser"); }
    catch { setWake("Wake lock not available"); }
    const pri = priority.split(/[\s,]+/).map((s) => s.trim().toUpperCase()).filter((s) => ALL.includes(s));
    const houseOrder = [...new Set([...pri, ...ALL])];
    try {
      const plan: [number, Chamber][] = fullQueue ? PLAN : [[onlyCycle, onlyCh]];
      for (const [cycle, ch] of plan) {
        const k = key(cycle, ch);
        const complete = (await readCompleteStates(ch, cycle)) ?? new Set<string>();
        let bySt: Map<string, CandidateSummary[]> | null = null;
        let order = houseOrder;
        if (ch === "senate") {
          setCurrent(`${cycle} Senate · loading candidate list`);
          const all = await fetchCandidates(cycle, "S");
          bySt = new Map();
          for (const c of all) bySt.set(c.state, [...(bySt.get(c.state) ?? []), c]);
          order = [...bySt.keys()].sort();
        }
        upd(k, { statesTotal: order.length, statesDone: order.filter((s) => complete.has(s)).length });
        add(`${cycle} ${ch}: ${complete.size} states already complete`);
        for (const st of order) {
          if (complete.has(st)) continue;
          await gate();
          setCurrent(`${cycle} ${ch} · ${st} · candidate list`);
          let list: CandidateSummary[];
          try { list = bySt ? bySt.get(st) ?? [] : await fetchCandidates(cycle, "H", st); }
          catch (e) { add(`Error ${cycle} ${ch} ${st} list: ${(e as Error).message}`); continue; }
          const have = new Set(((await readComputed(ch, cycle, st)) ?? []).map((r) => r.cand_id));
          let done = list.filter((c) => have.has(c.id)).length;
          setProg((s) => { const p = s[k]!; return { ...s, [k]: { ...p, candsTotal: p.candsTotal + list.length, candsDone: p.candsDone + done } }; });
          for (const c of list) {
            if (have.has(c.id)) continue;
            await gate();
            setCurrent(`${cycle} ${ch} · ${st} · ${c.name}`);
            try { await qc.fetchQuery(detailQuery(c, cycle, ch)); add(`Saved ${c.name} (${st}, ${cycle} ${ch})`); }
            catch (e) { add(`Error ${c.name} (${st}): ${(e as Error).message} — data unavailable`); }
            done++; doneThisRun.current++;
            setProg((s) => { const p = s[k]!; return { ...s, [k]: { ...p, candsDone: p.candsDone + 1 } }; });
            void updateComputeStatus(ch, cycle, st, list.length, done);
          }
          const races = new Map<string, CandidateSummary[]>();
          for (const c of list) { const d = ch === "senate" ? "00" : c.district ?? "00"; races.set(d, [...(races.get(d) ?? []), c]); }
          if (!skipOrgs) for (const [d, cs] of races) {
            await gate();
            setCurrent(`${cycle} ${ch} · ${st}${ch === "house" ? `-${d}` : ""} · top organizations`);
            try { const r = await loadOrComputeTopOrgs(ch, cycle, st, d, cs); add(`Top organizations ${st}${ch === "house" ? `-${d}` : ""}: ${r.length} saved`); }
            catch (e) { add(`Error top organizations ${st}-${d}: ${(e as Error).message}`); }
          }
          if (!list.length) void updateComputeStatus(ch, cycle, st, 0, 0);
          setProg((s) => { const p = s[k]!; return { ...s, [k]: { ...p, statesDone: p.statesDone + 1 } }; });
          void qc.invalidateQueries({ queryKey: ["computed", ch, cycle] });
          void qc.invalidateQueries({ queryKey: ["coverage", ch, cycle] });
        }
        add(`Finished ${cycle} ${ch}`);
      }
      setState("done"); setCurrent(fullQueue ? "All cycles complete" : `${onlyCycle} ${onlyCh} complete`);
    } catch (e) { add(`Stopped: ${(e as Error).message}`); setState("idle"); }
    finally { running.current = false; chan.current?.postMessage("stopped"); try { await lock?.release(); } catch { /* ignore */ } }
  }

  const rate = doneThisRun.current > 0 ? (Date.now() - started.current) / doneThisRun.current : 2 * 3800;
  const etaFor = (p?: Prog) => {
    if (!p || p.statesTotal === null) return "—";
    const avg = p.statesDone > 0 && p.candsTotal > 0 ? p.candsTotal / Math.max(1, p.statesDone) : 4;
    const left = Math.max(0, p.candsTotal - p.candsDone) + avg * Math.max(0, p.statesTotal - p.statesDone);
    const min = Math.round((left * rate) / 60000);
    return left === 0 ? "done" : min < 60 ? `~${min} min` : `~${(min / 60).toFixed(1)} h`;
  };

  const activePlan: [number, Chamber][] = fullQueue ? PLAN : [[onlyCycle, onlyCh]];
  const totalEta = (() => {
    let left = 0; let known = true;
    for (const [c, ch] of activePlan) {
      const p = prog[key(c, ch)];
      if (!p || p.statesTotal === null) { known = false; continue; }
      const avg = p.statesDone > 0 && p.candsTotal > 0 ? p.candsTotal / Math.max(1, p.statesDone) : 4;
      left += Math.max(0, p.candsTotal - p.candsDone) + avg * Math.max(0, p.statesTotal - p.statesDone);
    }
    if (!known && left === 0) return "—";
    const min = Math.round((left * rate) / 60000);
    return `${min < 60 ? `~${min} min` : `~${(min / 60).toFixed(1)} h`}${known ? "" : " (so far; more chamber-cycles not yet counted)"}`;
  })();
  const locked = state === "running" || state === "paused";

  return (
    <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <p className="section-kicker">Admin</p>
      <h1 className="section-title mb-2">Prefill saved results</h1>
      <p className="mb-6 text-sm text-muted-foreground">Keep this tab open and the laptop plugged in. Order: 2026 → 2016, Senate then House each cycle. Already-saved states and candidates are skipped, so you can reload and press Start to continue.</p>

      <label className="mb-4 block text-sm font-semibold">Priority states (House)
        <input value={priority} onChange={(e) => setPriority(e.target.value)} disabled={state === "running" || state === "paused"} className="mt-1 block w-full rounded-md border border-border bg-card px-3 py-2 font-mono text-sm" />
      </label>

      <fieldset className="mb-4 grid gap-3 rounded-md border border-border p-3 text-sm" disabled={locked}>
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-semibold">Run only</span>
          <select value={onlyCh} onChange={(e) => setOnlyCh(e.target.value as Chamber)} disabled={fullQueue} className="rounded-md border border-border bg-card px-2 py-1">
            <option value="senate">Senate</option><option value="house">House</option>
          </select>
          <select value={onlyCycle} onChange={(e) => setOnlyCycle(Number(e.target.value))} disabled={fullQueue} className="rounded-md border border-border bg-card px-2 py-1">
            {[...CYCLES].reverse().map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <label className="flex items-center gap-2"><input type="checkbox" checked={fullQueue} onChange={(e) => setFullQueue(e.target.checked)} /> Run full queue instead</label>
        </div>
        <label className="flex items-center gap-2"><input type="checkbox" checked={skipOrgs} onChange={(e) => setSkipOrgs(e.target.checked)} /> Skip top organizations (faster)</label>
      </fieldset>

      {other && state === "idle" && <p className="mb-4 rounded-md border border-border bg-muted p-3 text-sm font-semibold">Prefill already running in another tab</p>}
      <div className="mb-6 flex gap-3">
        <button onClick={start} disabled={state === "running" || state === "paused" || other} className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">Start</button>
        <button onClick={() => { paused.current = true; setState("paused"); add("Paused"); }} disabled={state !== "running"} className="rounded-md border border-border px-4 py-2 text-sm font-semibold disabled:opacity-50">Pause</button>
        <button onClick={() => { paused.current = false; setState("running"); add("Resumed"); }} disabled={state !== "paused"} className="rounded-md border border-border px-4 py-2 text-sm font-semibold disabled:opacity-50">Resume</button>
      </div>

      <div className="mb-6 grid gap-1 text-sm">
        <p>Status: <strong>{state}</strong>{wake && <span className="text-muted-foreground"> · {wake}</span>}</p>
        <p>Current: {current || "—"}</p>
        <p>FEC calls used this hour (this tab): <strong className="font-mono">{fec.usedHour}</strong> / 950 · X-RateLimit-Remaining: <strong className="font-mono">{fec.remaining ?? "not yet known"}</strong></p>
        <p>Estimated time left: <strong className="font-mono">{totalEta}</strong></p>
        {fec.paused && <p className="font-semibold">FEC hourly limit reached — resuming automatically</p>}
      </div>

      <div className="mb-8 grid gap-4">
        {PLAN.map(([c, ch]) => {
          const p = prog[key(c, ch)];
          const pct = p?.statesTotal ? (p.statesDone / p.statesTotal) * 100 : 0;
          return (
            <div key={key(c, ch)}>
              <div className="flex justify-between text-sm"><span className="font-semibold">{c} {ch === "senate" ? "Senate" : "House"}</span>
                <span className="font-mono text-xs text-muted-foreground">states {p?.statesDone ?? 0}/{p?.statesTotal ?? "?"} · candidates {p?.candsDone ?? 0}/{p?.candsTotal ?? "?"} · {etaFor(p)}</span></div>
              <div className="mt-1 h-2 rounded bg-muted"><div className="h-2 rounded bg-primary" style={{ width: `${pct}%` }} /></div>
            </div>
          );
        })}
      </div>

      <h2 className="mb-2 font-semibold">Last 20 actions</h2>
      <ol className="space-y-1 font-mono text-xs">{log.map((l, i) => <li key={i} className={l.includes("Error") ? "text-destructive" : ""}>{l}</li>)}</ol>
    </main>
  );
}
