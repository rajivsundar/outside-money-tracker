// Pure helpers for scripts/backfill.ts (no network, no Supabase), so the rules can be unit-tested.
import type { Chamber } from "@/config";
import { DataUnavailable, FecStop } from "@/lib/fec";

/** 2026 first (the demo cycle), then newest to oldest; Senate before House within each cycle. */
export const BACKFILL_CYCLES = [2026, 2024, 2022, 2020, 2018, 2016] as const;
export const PLAN: [number, Chamber][] = BACKFILL_CYCLES.flatMap((c) => [[c, "senate"], [c, "house"]] as [number, Chamber][]);

/**
 * Refresh mode (after everything is backfilled): only the in-progress cycle is ever recomputed, and only rows older than
 * REFRESH_AFTER_DAYS, oldest first. Completed cycles (2016–2024) never change, so they are never recomputed.
 */
export const REFRESH_CYCLE = 2026;
export const REFRESH_AFTER_DAYS = 7;
export const staleCutoff = (now: number, days = REFRESH_AFTER_DAYS) => new Date(now - days * 86_400_000);
const at = (computedAt: string | null) => { const t = computedAt ? Date.parse(computedAt) : 0; return Number.isNaN(t) ? 0 : t; };
/** A missing or unreadable computed_at counts as stale. */
export const isStale = (computedAt: string | null, now: number, days = REFRESH_AFTER_DAYS) => at(computedAt) < staleCutoff(now, days).getTime();
export const oldestFirst = <T extends { computedAt: string | null }>(rows: T[]): T[] => [...rows].sort((a, b) => at(a.computedAt) - at(b.computedAt));

export const MIN_REMAINING = 30;
export type Options = { maxCalls: number; maxMinutes: number; withOrgs: boolean; refreshOnly: boolean; refreshAfterDays: number };

export function parseArgs(argv: string[]): Options {
  const o: Options = { maxCalls: 850, maxMinutes: 55, withOrgs: false, refreshOnly: false, refreshAfterDays: REFRESH_AFTER_DAYS };
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
    else if (a === "--refresh-after-days") o.refreshAfterDays = positive(a, argv[++i]);
    else if (a === "--refresh-only") o.refreshOnly = true; // skip the backfill pass (testing / manual refresh)
    else throw new Error(`Unknown argument: ${a}\nUsage: tsx scripts/backfill.ts [--max-calls 850] [--max-minutes 55] [--with-orgs] [--refresh-only] [--refresh-after-days 7]`);
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
