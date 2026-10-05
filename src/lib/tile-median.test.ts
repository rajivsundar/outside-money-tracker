import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { groupMedians, median, type ShareLike } from "@/lib/share";

beforeEach(() => { vi.spyOn(console, "warn").mockImplementation(() => {}); });
afterEach(() => { vi.restoreAllMocks(); });

type Row = ShareLike & { district: string; receipts: number; outState: number };
// share is out_of_state ÷ donor_state_sum (the Bar B value), exactly as stored in out_of_state_share.
const cand = (district: string, out: number, donor: number, receipts: number, itemized = donor, transfersOther = 0): Row =>
  ({ district, receipts, outState: out, donorStateSum: donor, itemized, transfersOther, share: (out / donor) * 100 });

// KY-04, 2026 (figures from the live page): Massie 93.4%, Gallrein 95.8%, Wells 11.8% of located donor dollars.
const massie = cand("04", 5_039_094, 5_396_459, 8_800_000, 5_393_911, 130_000);
const gallrein = cand("04", 2_987_192, 3_117_725, 3_600_000, 3_114_952);
const wells = cand("04", 2_360, 20_000, 113_200, 20_000);

describe("district tile medians", () => {
  it("is the median of candidates' out-of-state share of located donor dollars (Bar B), not of receipts", () => {
    const rows = [massie, gallrein, wells];
    expect(rows.map((r) => Math.round(r.share! * 10) / 10)).toEqual([93.4, 95.8, 11.8]);
    const tile = groupMedians(rows, (r) => r.district).get("04")!;
    expect(tile.median).toBeCloseTo(93.4, 1);
    expect(tile.count).toBe(3);
    const ofReceipts = median(rows.map((r) => (r.outState / r.receipts) * 100))!; // the misleading alternative
    expect(ofReceipts).toBeLessThan(80);
    expect(tile.median).not.toBeCloseTo(ofReceipts, 0);
  });
  it("leaves unreliable candidates out of the median but still counts them", () => {
    const bad = cand("04", 9_000_000, 9_500_000, 1_000_000, 100_000, 0); // donor-state dollars far above itemized + transfers
    const tile = groupMedians([massie, gallrein, wells, bad], (r) => r.district).get("04")!;
    expect(tile.median).toBeCloseTo(93.4, 1);
    expect(tile.count).toBe(4);
  });
  it("returns a null median (hatched, not 0%) when no candidate has usable geography", () => {
    const bad = cand("07", 9_000_000, 9_500_000, 1_000_000, 100_000, 0);
    expect(groupMedians([bad], (r) => r.district).get("07")).toEqual({ median: null, count: 1 });
  });
});

describe("state page tiles", () => {
  const src = readFileSync(join(process.cwd(), "src/routes/state.$st.tsx"), "utf8");
  it("take their number from groupMedians and never from receipts", () => {
    expect(src).toContain("groupMedians(rows");
    expect(src).not.toMatch(/\.receipts\b/); // no receipt-based figure feeds a tile
  });
  it("caption every tile number with its denominator", () => {
    expect(src).toContain("located $ out of state");
  });
});
