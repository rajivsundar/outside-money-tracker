import { afterEach, describe, expect, it, vi } from "vitest";
import { BACKFILL_CYCLES, MIN_REMAINING, PLAN, classifyFailure, parseArgs, stopReason } from "../../scripts/backfill-lib";

// The app's Supabase client is not needed to test the FEC hooks: every cache lookup misses and every write succeeds.
vi.mock("@/lib/supabase", () => {
  const chain: Record<string, unknown> = {};
  Object.assign(chain, { select: () => chain, eq: () => chain, gte: () => chain, limit: () => chain, maybeSingle: async () => ({ data: null, error: null }), upsert: async () => ({ error: null }) });
  return { supabase: { from: () => chain }, setSharedCacheOnline: () => {}, recordDiag: () => {}, withTimeout: <T,>(p: T) => p, getDiagnostics: () => ({ read: 0, written: 0, lastError: null }) };
});
import { DataUnavailable, FecStop, fecControl, fecGet, fecStats } from "@/lib/fec";

describe("plan and options", () => {
  it("runs 2024 → 2016, Senate then House within each cycle", () => {
    expect(PLAN.map(([c, ch]) => `${c} ${ch}`)).toEqual([
      "2024 senate", "2024 house", "2022 senate", "2022 house", "2020 senate", "2020 house", "2018 senate", "2018 house", "2016 senate", "2016 house",
    ]);
    expect(BACKFILL_CYCLES).not.toContain(2026);
  });
  it("defaults to 850 calls / 55 minutes without organizations", () => {
    expect(parseArgs([])).toEqual({ maxCalls: 850, maxMinutes: 55, withOrgs: false });
  });
  it("accepts overrides and --with-orgs, and rejects bad input", () => {
    expect(parseArgs(["--max-calls", "20", "--max-minutes", "5", "--with-orgs"])).toEqual({ maxCalls: 20, maxMinutes: 5, withOrgs: true });
    expect(() => parseArgs(["--max-calls"])).toThrow();
    expect(() => parseArgs(["--max-calls", "-3"])).toThrow();
    expect(() => parseArgs(["--bogus"])).toThrow(/Unknown argument/);
  });
});

describe("stopReason", () => {
  const base = { calls: 0, maxCalls: 850, elapsedMs: 0, maxMinutes: 55, remaining: null };
  it("keeps going inside every budget", () => {
    expect(stopReason({ ...base, calls: 849, elapsedMs: 54 * 60_000, remaining: MIN_REMAINING })).toBeNull();
  });
  it("stops at 850 calls, 55 minutes, or fewer than 30 requests remaining", () => {
    expect(stopReason({ ...base, calls: 850 })?.reason).toBe("budget");
    expect(stopReason({ ...base, elapsedMs: 55 * 60_000 })?.reason).toBe("time");
    expect(stopReason({ ...base, remaining: 29 })?.reason).toBe("rate-limit");
  });
});

describe("classifyFailure", () => {
  it("separates clean stops, bad setup, retryable errors and missing data", () => {
    expect(classifyFailure(new FecStop("budget", "x"))).toBe("stop");
    expect(classifyFailure(new DataUnavailable("FEC request failed (403)", 403))).toBe("fatal");
    expect(classifyFailure(new DataUnavailable("FEC request failed (401)", 401))).toBe("fatal");
    expect(classifyFailure(new DataUnavailable("FEC request failed (503)", 503))).toBe("transient");
    expect(classifyFailure(new TypeError("fetch failed"))).toBe("transient");
    expect(classifyFailure(new DataUnavailable("FEC request failed (404)", 404))).toBe("permanent");
    expect(classifyFailure(new DataUnavailable("data unavailable"))).toBe("permanent");
  });
});

describe("FEC run controls", () => {
  const reply = (status: number, remaining?: string) => ({ status, ok: status < 400, headers: { get: (h: string) => (h === "X-RateLimit-Remaining" ? remaining ?? null : null) }, json: async () => ({ results: [] }) });
  let n = 0;
  const path = () => `/test/${Date.now()}-${n++}/`; // unique cache key per call
  afterEach(() => { fecControl.beforeCall = undefined as never; fecControl.afterResponse = undefined as never; fecControl.waitOn429 = true; fecStats.calls = 0; vi.unstubAllGlobals(); });

  it("counts only live requests and reports X-RateLimit-Remaining", async () => {
    const fetchMock = vi.fn(async () => reply(200, "123"));
    vi.stubGlobal("fetch", fetchMock);
    const seen: (number | null)[] = [];
    fecControl.afterResponse = ({ remaining }) => { seen.push(remaining); };
    await fecGet(path(), {}, 2024);
    expect(fecStats.calls).toBe(1);
    expect(seen).toEqual([123]);
  });
  it("ends the run before the request that would exceed the budget", async () => {
    const fetchMock = vi.fn(async () => reply(200));
    vi.stubGlobal("fetch", fetchMock);
    fecControl.beforeCall = () => { if (fecStats.calls >= 1) throw new FecStop("budget", "budget reached"); };
    await fecGet(path(), {}, 2024);
    await expect(fecGet(path(), {}, 2024)).rejects.toBeInstanceOf(FecStop);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fecStats.calls).toBe(1);
  });
  it("stops instead of pausing for 10 minutes on HTTP 429 when waitOn429 is false", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => reply(429)));
    fecControl.waitOn429 = false;
    await expect(fecGet(path(), {}, 2024)).rejects.toMatchObject({ reason: "rate-limit" });
  });
  it("keeps the HTTP status on request failures", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => reply(403)));
    await expect(fecGet(path(), {}, 2024)).rejects.toMatchObject({ status: 403 });
  });
});
