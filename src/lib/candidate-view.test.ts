import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OF_LOCATED, OF_RECEIPTS, candidateView, pctOf } from "@/lib/share";

beforeEach(() => { vi.spyOn(console, "warn").mockImplementation(() => {}); });
afterEach(() => { vi.restoreAllMocks(); });

// Massie-style candidate: out-of-state dollars are 57.0% of receipts but 93.4% of located donor dollars.
const massie = {
  receipts: 1_000_000, itemized: 450_000, donorStateSum: 610_000, outStateItemized: 570_000, outShare: (570_000 / 610_000) * 100,
  categories: { unknown: 30, pacs: 10, party: 0, self: 0, transfers: 15 },
};
const samples = [
  massie,
  { ...massie, donorStateSum: 0, outStateItemized: 0, outShare: null },                         // no located donors
  { ...massie, donorStateSum: 5_000_000, outStateItemized: 4_000_000, outShare: 80 },           // fails isGeoReliable
  { ...massie, categories: { unknown: 80, pacs: 40, party: 20, self: 10, transfers: 0 } },      // components exceed receipts
  { ...massie, outShare: 1482 },                                                                // corrupt share
];
const sum = (rows: { value: number }[]) => rows.reduce((s, r) => s + r.value, 0);

describe("candidateView", () => {
  it("Bar A sums to 100 ±0.1 and has no geography", () => {
    for (const d of samples) {
      const a = candidateView(d, "Kentucky").barA!;
      expect(Math.abs(sum(a) - 100)).toBeLessThanOrEqual(0.1);
      expect(a.map((r) => r.label)).toEqual(["Itemized individual donors", "Small donors (location not reported)", "PACs", "Party", "Self-funding", "Transfers & other"]);
    }
  });
  it("Bar B sums to 100 ±0.1 and names the state", () => {
    const b = candidateView(massie, "Kentucky").barB!;
    expect(Math.abs(sum(b) - 100)).toBeLessThanOrEqual(0.1);
    expect(b.map((r) => r.label)).toEqual(["In Kentucky", "Outside Kentucky"]);
    expect(candidateView(samples[1]!, "Kentucky").barB).toBeNull();
    expect(candidateView(samples[4]!, "Kentucky").barB).toBeNull(); // 1482 is never drawn
  });
  it("headline share equals Bar B's out-of-state value", () => {
    const v = candidateView(massie, "Kentucky");
    const out = v.barB!.find((r) => r.key === "outOfState")!;
    expect(v.headline!.value).toBe(`${out.value.toFixed(1)}%`);
    expect(v.headline!.value).toBe("93.4%");
    expect(v.headline!.text).toBe("of located donor dollars came from outside Kentucky");
    expect(out.text).toBe("93.4% of located donor dollars");
  });
  it("sub-line gives the share of all receipts and the small-donor share", () => {
    expect(candidateView(massie, "Kentucky").subline).toBe("At least 57.0% of all receipts. 30.0% of all receipts came from small donors whose location isn't reported.");
  });
  it("omits the sub-line when the candidate fails isGeoReliable, and caps it at 100", () => {
    expect(candidateView(samples[2]!, "Kentucky").subline).toBeNull();
    const capped = candidateView({ ...massie, donorStateSum: 650_000, outStateItemized: 2_000_000 }, "Kentucky").subline;
    expect(capped).toMatch(/^At least 100\.0% of all receipts\./);
  });
  it("shows data unavailable instead of a corrupt headline", () => {
    expect(candidateView(samples[4]!, "Kentucky").headline).toEqual({ value: "data unavailable", text: "" });
  });
  it("every percentage label passed to the UI includes a denominator phrase", () => {
    const denominator = new RegExp(`${OF_LOCATED}|${OF_RECEIPTS}`);
    let checked = 0;
    for (const d of samples) {
      const v = candidateView(d, "Kentucky");
      const strings = [v.headline && `${v.headline.value} ${v.headline.text}`, v.subline, ...(v.barA ?? []).map((r) => r.text), ...(v.barB ?? []).map((r) => r.text)];
      for (const s of strings) if (s && s.includes("%")) { checked++; expect(s).toMatch(denominator); }
    }
    expect(checked).toBeGreaterThan(20);
    expect(pctOf(42, "located")).toBe("42.0% of located donor dollars");
    expect(pctOf(42, "receipts")).toBe("42.0% of all receipts");
    expect(pctOf(1482, "located")).toBe("data unavailable");
  });
});

describe("vocabulary", () => {
  const files: string[] = [];
  const walk = (dir: string) => { for (const n of readdirSync(dir)) { const p = join(dir, n); if (statSync(p).isDirectory()) walk(p); else if (/\.tsx?$/.test(n) && !/\.test\.|routeTree\.gen/.test(n)) files.push(p); } };
  walk(join(process.cwd(), "src"));
  const text = files.map((f) => ({ f, s: readFileSync(f, "utf8") }));

  it("never prints the metric without its denominator", () => {
    const bare = text.flatMap(({ f, s }) => [...s.matchAll(/out-of-state share(?! of located donor dollars)/gi)].map(() => f));
    expect(bare).toEqual([]);
  });
  it("uses 'located donor dollars', never the older 'of donor dollars'", () => {
    expect(text.filter(({ s }) => /of donor dollars/i.test(s)).map(({ f }) => f)).toEqual([]);
  });
});
