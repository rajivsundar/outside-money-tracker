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

export type Chamber = "senate" | "house";
export const parseChamber = (v: unknown): Chamber => (v === "house" ? "house" : "senate");
export const chamberName = (c: Chamber) => (c === "house" ? "House" : "Senate");
/** Landing page defaults to the in-progress cycle. */
export const parseCycleOr = (v: unknown, fallback: number) => (v === undefined || v === null || v === "" ? fallback : parseCycle(v));

/** FIPS code → [postal, name] for the 50 states + DC (us-atlas feature ids). */
export const STATES: Record<string, [string, string]> = {
  "01": ["AL", "Alabama"], "02": ["AK", "Alaska"], "04": ["AZ", "Arizona"], "05": ["AR", "Arkansas"], "06": ["CA", "California"],
  "08": ["CO", "Colorado"], "09": ["CT", "Connecticut"], "10": ["DE", "Delaware"], "11": ["DC", "District of Columbia"], "12": ["FL", "Florida"],
  "13": ["GA", "Georgia"], "15": ["HI", "Hawaii"], "16": ["ID", "Idaho"], "17": ["IL", "Illinois"], "18": ["IN", "Indiana"],
  "19": ["IA", "Iowa"], "20": ["KS", "Kansas"], "21": ["KY", "Kentucky"], "22": ["LA", "Louisiana"], "23": ["ME", "Maine"],
  "24": ["MD", "Maryland"], "25": ["MA", "Massachusetts"], "26": ["MI", "Michigan"], "27": ["MN", "Minnesota"], "28": ["MS", "Mississippi"],
  "29": ["MO", "Missouri"], "30": ["MT", "Montana"], "31": ["NE", "Nebraska"], "32": ["NV", "Nevada"], "33": ["NH", "New Hampshire"],
  "34": ["NJ", "New Jersey"], "35": ["NM", "New Mexico"], "36": ["NY", "New York"], "37": ["NC", "North Carolina"], "38": ["ND", "North Dakota"],
  "39": ["OH", "Ohio"], "40": ["OK", "Oklahoma"], "41": ["OR", "Oregon"], "42": ["PA", "Pennsylvania"], "44": ["RI", "Rhode Island"],
  "45": ["SC", "South Carolina"], "46": ["SD", "South Dakota"], "47": ["TN", "Tennessee"], "48": ["TX", "Texas"], "49": ["UT", "Utah"],
  "50": ["VT", "Vermont"], "51": ["VA", "Virginia"], "53": ["WA", "Washington"], "54": ["WV", "West Virginia"], "55": ["WI", "Wisconsin"],
  "56": ["WY", "Wyoming"],
};
export const STATE_NAME: Record<string, string> = Object.fromEntries(Object.values(STATES).map(([p, n]) => [p, n]));
