// Pure helpers for scripts/backfill.ts (no network, no Supabase), so the rules can be unit-tested.
import type { Chamber } from "@/config";
import { DataUnavailable, FecStop } from "@/lib/fec";

/** Newest first; Senate before House within each cycle. */
export const BACKFILL_CYCLES = [2024, 2022, 2020, 2018, 2016] as const;
export const PLAN: [number, Chamber][] = BACKFILL_CYCLES.flatMap((c) => [[c, "senate"], [c, "house"]] as [number, Chamber][]);

export const MIN_REMAINING = 30;
export type Options = { maxCalls: number; maxMinutes: number; withOrgs: boolean };

export function parseArgs(argv: string[]): Options {
  const o: Options = { maxCalls: 850, maxMinutes: 55, withOrgs: false };
  const positive = (flag: string, v: string | undefined) => {
    const n = Number(v);
    if (!v || !Number.isFinite(n) || n <= 0) throw new Error(`${flag} needs a positive number`);
    return n;
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--max-calls") o.maxCalls = positive(a, argv[++i]);
    else if (a === "--max-minutes") o.maxMinutes = positive(a, argv[++i]);
    else if (a === "--with-orgs") o.withOrgs = true;
    else throw new Error(`Unknown argument: ${a}\nUsage: tsx scripts/backfill.ts [--max-calls 850] [--max-minutes 55] [--with-orgs]`);
  }
  return o;
}

export type StopInput = { calls: number; maxCalls: number; elapsedMs: number; maxMinutes: number; remaining: number | null };
/** Why the run must end now (cleanly), or null to keep going. */
export function stopReason(s: StopInput): { reason: "budget" | "time" | "rate-limit"; message: string } | null {
  if (s.calls >= s.maxCalls) return { reason: "budget", message: `FEC call budget reached (${s.calls}/${s.maxCalls})` };
  if (s.elapsedMs >= s.maxMinutes * 60_000) return { reason: "time", message: `time budget reached (${Math.round(s.elapsedMs / 60_000)}/${s.maxMinutes} min)` };
  if (s.remaining !== null && s.remaining < MIN_REMAINING) return { reason: "rate-limit", message: `X-RateLimit-Remaining is ${s.remaining} (< ${MIN_REMAINING})` };
  return null;
}

/**
 * stop      = end the run cleanly (budget, time, HTTP 429, rate limit)
 * fatal     = something is wrong with the setup (bad API key); do not mark anything complete
 * transient = try again next run (FEC 5xx, network); the state stays incomplete
 * permanent = the FEC has no usable data for this candidate; counted as done so the state can complete
 */
export type Failure = "stop" | "fatal" | "transient" | "permanent";
export function classifyFailure(e: unknown): Failure {
  if (e instanceof FecStop) return "stop";
  if (e instanceof DataUnavailable) {
    const s = e.status;
    if (s === undefined) return "permanent";
    if (s === 401 || s === 403) return "fatal";
    if (s >= 500 || s === 408) return "transient";
    return "permanent";
  }
  return "transient";
}
