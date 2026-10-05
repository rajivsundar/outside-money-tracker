import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DATA_UNAVAILABLE, detailGeoReliable, donorLocation, formatShare, guardShare, isGeoReliable, poolDistricts, receiptBreakdown, usableShare, type PoolRow } from "@/lib/share";

const row = (o: Partial<PoolRow> = {}): PoolRow => ({ state: "LA", district: "01", donorStateSum: 1_000_000, itemized: 600_000, transfersOther: 400_000, outState: 900_000, ...o });

beforeEach(() => { vi.spyOn(console, "warn").mockImplementation(() => {}); });
afterEach(() => { vi.restoreAllMocks(); });

describe("isGeoReliable", () => {
  it("accepts donor-state totals within 1.1 × (itemized + transfers)", () => {
    expect(isGeoReliable({ donorStateSum: 1_000_000, itemized: 600_000, transfersOther: 400_000 })).toBe(true);
    expect(isGeoReliable({ donorStateSum: 1_100_000, itemized: 600_000, transfersOther: 400_000 })).toBe(true); // exactly at the limit
    expect(isGeoReliable({ donorStateSum: 0, itemized: 0, transfersOther: 0 })).toBe(true);
  });
  it("rejects donor-state totals above the limit", () => {
    expect(isGeoReliable({ donorStateSum: 1_100_001, itemized: 600_000, transfersOther: 400_000 })).toBe(false);
    expect(isGeoReliable({ donorStateSum: 5_000_000, itemized: 100_000, transfersOther: 0 })).toBe(false);
  });
  it("treats missing fields as unreliable", () => {
    expect(isGeoReliable({ donorStateSum: null, itemized: 1, transfersOther: 1 })).toBe(false);
    expect(isGeoReliable({ donorStateSum: 1, itemized: null, transfersOther: 1 })).toBe(false);
    expect(isGeoReliable({ donorStateSum: 1, itemized: 1, transfersOther: null })).toBe(false);
  });
  it("applies the same rule to a freshly computed detail", () => {
    const base = { receipts: 2_000_000, itemized: 600_000, donorStateSum: 1_000_000, categories: { transfers: 20 } }; // transfers = $400k
    expect(detailGeoReliable(base)).toBe(true);
    expect(detailGeoReliable({ ...base, donorStateSum: 1_200_000 })).toBe(false);
  });
  it("usableShare needs reliable geography and a share within 0–100", () => {
    expect(usableShare({ ...row(), share: 90 })).toBe(90);
    expect(usableShare({ ...row({ donorStateSum: 9_000_000 }), share: 90 })).toBeNull();
    expect(usableShare({ ...row(), share: 1482 })).toBeNull();
  });
});

describe("guardShare", () => {
  it("rejects 1482 and other out-of-range values, logging them", () => {
    expect(guardShare(1482)).toBeNull();
    expect(guardShare(-0.5)).toBeNull();
    expect(guardShare(100.5)).toBeNull();
    expect(guardShare(NaN)).toBeNull();
    expect(console.warn).toHaveBeenCalledTimes(4);
  });
  it("passes valid shares through, including 0 and 100", () => {
    expect(guardShare(0)).toBe(0);
    expect(guardShare(100)).toBe(100);
    expect(guardShare(42.5)).toBe(42.5);
    expect(guardShare(null)).toBeNull();
  });
  it("formats rejected shares as data unavailable", () => {
    expect(formatShare(1482)).toBe(DATA_UNAVAILABLE);
    expect(formatShare(-3)).toBe(DATA_UNAVAILABLE);
    expect(formatShare(null)).toBe(DATA_UNAVAILABLE);
    expect(formatShare(61.234)).toBe("61.2%");
  });
});

describe("poolDistricts", () => {
  it("pools sum(out_of_state) ÷ sum(donor_state_sum), never above 100%", () => {
    // The old formula divided out_of_state by itemized: 900k ÷ 60k would be 1500%.
    const rows = [row({ itemized: 60_000, transfersOther: 940_000 }), row({ itemized: 300_000, transfersOther: 0, donorStateSum: 320_000, outState: 320_000 })];
    const { ranked } = poolDistricts(rows, 100_000);
    expect(ranked).toHaveLength(1);
    expect(ranked[0]!.share).toBeCloseTo((1_220_000 / 1_320_000) * 100, 6);
    expect(ranked[0]!.share).toBeLessThanOrEqual(100);
    expect(ranked[0]!.donorDollars).toBe(1_320_000);
  });
  it("is at most 100% for any reliable rows where out_of_state ≤ donor_state_sum", () => {
    let seed = 7;
    const rand = () => (seed = (seed * 48271) % 2147483647) / 2147483647;
    const rows: PoolRow[] = Array.from({ length: 500 }, (_, i) => {
      const donor = Math.round(rand() * 5_000_000);
      return { state: "TX", district: String((i % 38) + 1).padStart(2, "0"), donorStateSum: donor, itemized: Math.round(donor * (0.5 + rand())), transfersOther: Math.round(donor * rand()), outState: Math.round(donor * rand()) };
    });
    for (const d of poolDistricts(rows, 0).ranked) { expect(d.share).toBeGreaterThanOrEqual(0); expect(d.share).toBeLessThanOrEqual(100); }
  });
  it("leaves unreliable candidates out of the pool", () => {
    const bad = row({ donorStateSum: 9_000_000, outState: 8_000_000 });
    const { ranked } = poolDistricts([row(), bad], 100_000);
    expect(ranked[0]!.donorDollars).toBe(1_000_000);
    expect(ranked[0]!.cands).toBe(1);
  });
  it("applies the minimum to the sum of donor_state_sum and ranks by share", () => {
    const rows = [row({ state: "LA", district: "01" }), row({ state: "TX", district: "02", donorStateSum: 99_999, itemized: 99_999, transfersOther: 0, outState: 90_000 }), row({ state: "NY", district: "03", outState: 100_000 })];
    const { loaded, ranked } = poolDistricts(rows, 100_000);
    expect(loaded).toBe(3);
    expect(ranked.map((d) => d.label)).toEqual(["LA-01", "NY-03"]);
  });
  it("labels single-seat districts At-large", () => {
    expect(poolDistricts([row({ state: "AK", district: "00" })], 0).ranked[0]!.label).toBe("AK-AL");
  });
});

describe("receipt bars", () => {
  const d = { receipts: 1_000_000, itemized: 400_000, categories: { unknown: 10, pacs: 15, party: 5, self: 2 } }; // categories are % of receipts, itemized is dollars
  it("Bar A always sums to 100%", () => {
    const p = receiptBreakdown(d)!;
    expect(Object.values(p).reduce((s, v) => s + v, 0)).toBeCloseTo(100, 9);
    expect(p.other).toBeCloseTo(28, 9);
    const over = receiptBreakdown({ ...d, itemized: 2_000_000 })!; // components above receipts are scaled down to fit
    expect(Object.values(over).reduce((s, v) => s + v, 0)).toBeCloseTo(100, 9);
    expect(receiptBreakdown({ ...d, receipts: 0 })).toBeNull();
  });
  it("Bar B splits donor dollars into in-state and out-of-state and rejects bad shares", () => {
    const l = donorLocation({ donorStateSum: 1_000_000, outShare: 62.5 })!;
    expect(l.inState + l.outOfState).toBeCloseTo(100, 9);
    expect(donorLocation({ donorStateSum: 0, outShare: null })).toBeNull();
    expect(donorLocation({ donorStateSum: 1_000_000, outShare: 1482 })).toBeNull();
  });
});
