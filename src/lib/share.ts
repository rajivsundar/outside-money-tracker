// Pure share/reliability helpers shared by every route (no Supabase or React imports, so they are unit-testable).

/** Fields needed to judge whether a campaign's donor-state totals are usable for geography. */
export type GeoFields = { donorStateSum: number | null; itemized: number | null; transfersOther: number | null };
export type ShareLike = GeoFields & { share: number | null };

export const GEO_TOLERANCE = 1.1;
export const DATA_UNAVAILABLE = "data unavailable";
export const UNRELIABLE_NOTE = "FEC donor-state totals for this campaign exceed its itemized gifts and transfers, so its donor locations are left out of rankings.";

/**
 * FEC donor-state rows can include joint-fundraising donors that arrive as transfers, so they may exceed the
 * campaign's own itemized gifts. When donor_state_sum > 1.1 × (itemized_indiv + transfers_other) the geography
 * is not comparable and the candidate is left out of rankings, medians and trends. Missing fields = unreliable.
 */
export function isGeoReliable(r: GeoFields): boolean {
  const { donorStateSum: d, itemized: i, transfersOther: t } = r;
  if (d === null || i === null || t === null) return false;
  return d <= GEO_TOLERANCE * (i + t);
}

/** Returns the share only if it is a real percentage in [0, 100]; otherwise logs it and returns null. */
export function guardShare(v: number | null | undefined, context = "share"): number | null {
  if (v === null || v === undefined) return null;
  if (!Number.isFinite(v) || v < -1e-9 || v > 100 + 1e-9) {
    console.warn(`Share out of range (${context}): ${v}`);
    return null;
  }
  return Math.min(100, Math.max(0, v));
}

/** "12.3%" for a valid share, "data unavailable" otherwise (never displays a value outside 0–100). */
export function formatShare(v: number | null | undefined, context = "share"): string {
  const g = guardShare(v, context);
  return g === null ? DATA_UNAVAILABLE : `${g.toFixed(1)}%`;
}

/** A candidate's share for aggregation: null unless geography is reliable and the share is within 0–100. */
export function usableShare(r: ShareLike): number | null {
  return isGeoReliable(r) ? guardShare(r.share) : null;
}

// ---- Duplicate candidate IDs ----
/**
 * The FEC can list one person under two candidate IDs that share a single principal committee (e.g. KY-04 2026 Wells:
 * H6KY04155 and H6KY04197, committee C00920496). Same committee = same money, so it must only count once.
 * Rows without a committee are never merged.
 */
export function dedupeByCommittee<R extends { state: string; district?: string | null; committee: string | null }>(rows: R[]): R[] {
  const seen = new Set<string>();
  return rows.filter((r) => {
    if (!r.committee) return true;
    const k = `${r.state}|${r.district ?? ""}|${r.committee}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Candidate-list twin of the above (the FEC totals list has no committee): same state, name and receipts to the cent. */
export function isDuplicateCandidate(list: { id: string; state: string; name: string; receipts: number }[], c: { id: string; state: string; name: string; receipts: number }): boolean {
  return list.some((o) => o.id === c.id || (o.state === c.state && o.name === c.name && o.receipts === c.receipts));
}

// ---- Medians (map states, district tiles) ----
export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

export type Group = { median: number | null; count: number };
/**
 * Median of each group's candidates' out-of-state share of located donor dollars (out_of_state ÷ donor_state_sum, the Bar B value),
 * never a share of receipts. Unreliable candidates and shares outside 0–100 are left out of the median but still counted.
 */
export function groupMedians<R extends ShareLike>(rows: R[], key: (r: R) => string | null): Map<string, Group> {
  const by = new Map<string, number[]>();
  const counts = new Map<string, number>();
  for (const r of rows) {
    const k = key(r); if (!k) continue;
    counts.set(k, (counts.get(k) ?? 0) + 1);
    const share = usableShare(r);
    if (share !== null) by.set(k, [...(by.get(k) ?? []), share]);
  }
  return new Map([...counts.keys()].map((k) => [k, { median: median(by.get(k) ?? []), count: counts.get(k)! }]));
}

// ---- Pooled district share ----
export type PoolRow = GeoFields & { state: string; district: string | null; outState: number | null };
export type DistrictPool = { state: string; district: string; label: string; share: number; donorDollars: number; cands: number };

/**
 * Pools each district's reliable candidates: sum(out_of_state) ÷ sum(donor_state_sum). Both sums come from the same
 * FEC donor-state rows, so the ratio can never exceed 100%. Districts under `minDonorDollars` are dropped.
 */
export function poolDistricts(rows: PoolRow[], minDonorDollars: number): { loaded: number; ranked: DistrictPool[] } {
  const by = new Map<string, { state: string; district: string; out: number; donor: number; cands: number }>();
  for (const r of rows) {
    const district = r.district ?? "00";
    const k = `${r.state}-${district}`;
    const g = by.get(k) ?? { state: r.state, district, out: 0, donor: 0, cands: 0 };
    if (r.outState !== null && r.donorStateSum !== null && isGeoReliable(r)) { g.out += r.outState; g.donor += r.donorStateSum; g.cands++; }
    by.set(k, g);
  }
  const ranked: DistrictPool[] = [];
  for (const g of by.values()) {
    if (g.donor < minDonorDollars) continue;
    const label = `${g.state}-${g.district === "00" ? "AL" : g.district}`;
    const share = guardShare((g.out / g.donor) * 100, `district ${label}`);
    if (share === null) continue;
    ranked.push({ state: g.state, district: g.district, label, share, donorDollars: g.donor, cands: g.cands });
  }
  ranked.sort((a, b) => b.share - a.share);
  return { loaded: by.size, ranked };
}

// ---- Receipt bars ----
type Cats = { unknown: number; pacs: number; party: number; self: number; transfers: number };

/** Same test as isGeoReliable, from a freshly computed candidate detail (transfers_other is the stored transfers residual in dollars). */
export const detailGeoReliable = (d: { receipts: number; itemized: number; donorStateSum: number; categories: Pick<Cats, "transfers"> }) =>
  isGeoReliable({ donorStateSum: d.donorStateSum, itemized: d.itemized, transfersOther: (d.categories.transfers / 100) * d.receipts });

export type ReceiptParts = { itemized: number; small: number; pacs: number; party: number; self: number; other: number };

/** Bar A: shares of total receipts by type. No geography; always sums to 100%. `categories` are percentages of receipts. */
export function receiptBreakdown(d: { receipts: number; itemized: number; categories: Pick<Cats, "unknown" | "pacs" | "party" | "self"> }): ReceiptParts | null {
  const R = d.receipts;
  if (!(R > 0)) return null;
  // d.itemized is dollars; d.categories hold percentages of receipts (as stored in the results tables).
  const pct = (v: number) => Math.max(0, v);
  const p = { itemized: Math.max(0, (d.itemized / R) * 100), small: pct(d.categories.unknown), pacs: pct(d.categories.pacs), party: pct(d.categories.party), self: pct(d.categories.self) };
  const s = p.itemized + p.small + p.pacs + p.party + p.self;
  if (s > 100) { const k = 100 / s; return { itemized: p.itemized * k, small: p.small * k, pacs: p.pacs * k, party: p.party * k, self: p.self * k, other: 0 }; }
  return { ...p, other: 100 - s };
}

/** Bar B: in-state vs out-of-state share of located donor dollars; null when there are no usable donor locations. */
export function donorLocation(d: { donorStateSum: number; outShare: number | null }): { inState: number; outOfState: number } | null {
  if (!(d.donorStateSum > 0)) return null;
  const out = guardShare(d.outShare, "candidate located-donor share");
  return out === null ? null : { inState: 100 - out, outOfState: out };
}

// ---- Vocabulary: every percentage is printed with its denominator ----
export const METRIC_NAME = "out-of-state share of located donor dollars";
export const OF_LOCATED = "of located donor dollars";
export const OF_RECEIPTS = "of all receipts";
export type Denominator = "located" | "receipts";
const PHRASE: Record<Denominator, string> = { located: OF_LOCATED, receipts: OF_RECEIPTS };

/** "93.4% of located donor dollars" / "57.0% of all receipts"; "data unavailable" if the share is outside 0–100. */
export function pctOf(v: number | null | undefined, denom: Denominator, context = "share"): string {
  const g = guardShare(v, context);
  return g === null ? DATA_UNAVAILABLE : `${g.toFixed(1)}% ${PHRASE[denom]}`;
}

type ViewInput = {
  receipts: number; itemized: number; donorStateSum: number; outShare: number | null; outStateItemized: number;
  categories: Pick<Cats, "unknown" | "pacs" | "party" | "self" | "transfers">;
};
export type BarRow = { key: string; label: string; value: number; text: string };
export type CandidateView = {
  /** value is the big figure ("93.4%"); text completes the sentence. */
  headline: { value: string; text: string } | null;
  subline: string | null;
  barA: BarRow[] | null;
  barB: BarRow[] | null;
};

/** Every string the candidate block prints about shares, so each one can carry (and be tested for) its denominator. */
export function candidateView(d: ViewInput, stateName: string, context = "candidate"): CandidateView {
  const parts = receiptBreakdown(d);
  const loc = donorLocation(d);
  const A: [keyof ReceiptParts, string][] = [
    ["itemized", "Itemized individual donors"], ["small", "Small donors (location not reported)"], ["pacs", "PACs"],
    ["party", "Party"], ["self", "Self-funding"], ["other", "Transfers & other"],
  ];
  const barA = parts ? A.map(([key, label]) => ({ key, label, value: parts[key], text: pctOf(parts[key], "receipts", `${context} ${key}`) })) : null;
  const barB = loc ? [
    { key: "inState", label: `In ${stateName}`, value: loc.inState, text: pctOf(loc.inState, "located", `${context} in-state`) },
    { key: "outOfState", label: `Outside ${stateName}`, value: loc.outOfState, text: pctOf(loc.outOfState, "located", `${context} out-of-state`) },
  ] : null;
  // Headline is Bar B's out-of-state value, so the two can never disagree.
  const headline = loc ? { value: `${loc.outOfState.toFixed(1)}%`, text: `${OF_LOCATED} came from outside ${stateName}` } : d.outShare !== null ? { value: DATA_UNAVAILABLE, text: "" } : null;
  // Sub-line: out-of-state dollars as a share of ALL receipts, a lower bound on money from outside the state. Omitted when geography is unreliable.
  let subline: string | null = null;
  if (parts && detailGeoReliable(d)) {
    const y = Math.min(100, (d.outStateItemized / d.receipts) * 100);
    if (Number.isFinite(y) && y >= 0) subline = `At least ${y.toFixed(1)}% ${OF_RECEIPTS}. ${parts.small.toFixed(1)}% ${OF_RECEIPTS} came from small donors whose location isn't reported.`;
  }
  return { headline, subline, barA, barB };
}

// ---- Chart axes: whole-percent ticks, fixed 0–100 ----
export const PCT_TICKS = [0, 20, 40, 60, 80, 100];
export const pctTick = (v: number) => `${Math.round(v)}%`;
