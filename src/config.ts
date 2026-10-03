// Public FEC (api.data.gov) key — used directly from the browser.
export const FEC_API_BASE = "https://api.open.fec.gov/v1";
export const FEC_API_KEY = "YXXosIoVP60bOIlePB4N2Nv6vkXrfdPhec3LUZ2r";
export const CYCLES = [2016, 2018, 2020, 2022, 2024, 2026] as const;
export const DEFAULT_CYCLE = 2024;
export const IN_PROGRESS_CYCLE = 2026;
export const MIN_RECEIPTS = 100000;

export function parseCycle(v: unknown): number {
  const n = Number(v);
  return (CYCLES as readonly number[]).includes(n) ? n : DEFAULT_CYCLE;
}

export function cycleLabel(c: number) {
  return c === IN_PROGRESS_CYCLE
    ? `Two-year period ending ${c} · In progress — data through the latest FEC filing`
    : `Two-year period ending ${c}`;
}

/** Cache lifetime: completed cycles never expire; 2024 30 days; 2026 24 hours. */
export function ttlFor(c: number) {
  if (c <= 2022) return Infinity;
  if (c === 2024) return 30 * 24 * 60 * 60 * 1000;
  return 24 * 60 * 60 * 1000;
}

/** States holding a special Senate election alongside (or instead of) a regular one, per cycle. */
export const SPECIAL_ELECTIONS: Record<number, string[]> = {
  2016: [], 2018: ["MN", "MS"], 2020: ["AZ", "GA"], 2022: ["CA", "OK"], 2024: ["NE"], 2026: ["FL", "OH"],
};
