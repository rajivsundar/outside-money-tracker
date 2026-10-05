import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dedupeByCommittee, groupMedians, isDuplicateCandidate, type ShareLike } from "@/lib/share";

beforeEach(() => { vi.spyOn(console, "warn").mockImplementation(() => {}); });
afterEach(() => { vi.restoreAllMocks(); });

type Row = ShareLike & { cand_id: string; state: string; district: string; committee: string | null };
const row = (cand_id: string, committee: string | null, out: number, donor: number): Row =>
  ({ cand_id, state: "KY", district: "04", committee, donorStateSum: donor, itemized: donor, transfersOther: 0, share: (out / donor) * 100 });

// KY-04, 2026: the FEC lists Wells under two candidate IDs that share principal committee C00920496.
const massie = row("H2KY04121", "C00500000", 5_039_094, 5_396_459);
const gallrein = row("H6KY04171", "C00600000", 2_987_192, 3_117_725);
const wells1 = row("H6KY04155", "C00920496", 2_360, 20_000);
const wells2 = row("H6KY04197", "C00920496", 2_360, 20_000);

describe("one person under two FEC candidate IDs", () => {
  it("counts a shared principal committee once", () => {
    const rows = dedupeByCommittee([massie, gallrein, wells1, wells2]);
    expect(rows.map((r) => r.cand_id)).toEqual(["H2KY04121", "H6KY04171", "H6KY04155"]);
  });
  it("never merges rows without a committee, or the same committee in another district", () => {
    expect(dedupeByCommittee([row("a", null, 1, 2), row("b", null, 1, 2)])).toHaveLength(2);
    expect(dedupeByCommittee([wells1, { ...wells2, district: "05" }])).toHaveLength(2);
  });
  it("KY-04 tile is the median of Massie 93.4, Gallrein 95.8 and Wells 11.8, i.e. 93.4%", () => {
    const tile = groupMedians(dedupeByCommittee([massie, gallrein, wells1, wells2]), (r) => r.district).get("04")!;
    expect(tile.median).toBeCloseTo(93.4, 1);
    expect(tile.count).toBe(3);
    // Without the fix Wells counted twice and the tile read (11.8 + 93.4) / 2 = 52.6%.
    const doubled = groupMedians([massie, gallrein, wells1, wells2], (r) => r.district).get("04")!;
    expect(doubled.median).toBeCloseTo(52.6, 1);
  });
  it("drops the second listing in the candidate list (same state, name and receipts)", () => {
    const first = { id: "H6KY04155", state: "KY", name: "Robert Stacy Dr Wells", receipts: 113_241.15 };
    expect(isDuplicateCandidate([first], { ...first, id: "H6KY04197" })).toBe(true);
    expect(isDuplicateCandidate([first], { ...first, id: "H6KY04197", receipts: 113_300 })).toBe(false);
    expect(isDuplicateCandidate([first], { ...first, id: "H6KY04197", state: "TN" })).toBe(false);
    expect(isDuplicateCandidate([first], first)).toBe(true);
  });
});
