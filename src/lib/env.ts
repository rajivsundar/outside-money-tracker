/** Environment variable in Node (the backfill job); always undefined in the browser. Empty strings count as unset. */
export function nodeEnv(name: string): string | undefined {
  const p = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
  return p?.env?.[name] || undefined;
}
