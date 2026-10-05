import { createClient } from "@supabase/supabase-js";
import { useSyncExternalStore } from "react";
import { nodeEnv } from "@/lib/env";

// User's own external Supabase project (publishable key — safe in browser code). The Node backfill job may override
// both with SUPABASE_URL / SUPABASE_KEY; in the browser those are never set.
export const SUPABASE_URL = nodeEnv("SUPABASE_URL") ?? "https://qqpokmhvjfzlrhtumfgt.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY = nodeEnv("SUPABASE_KEY") ?? "sb_publishable_f03m_5mNaU7heNgYlcGg1Q_YJu12NEr";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const TIMEOUT = 3000;
export function withTimeout<T>(p: PromiseLike<T>): Promise<T> {
  return Promise.race([
    Promise.resolve(p),
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error("shared cache timeout")), TIMEOUT)),
  ]);
}

// Shared-cache health, observable from React.
let online: boolean | null = null;
const listeners = new Set<() => void>();
export function setSharedCacheOnline(v: boolean) {
  if (online === v) return;
  online = v;
  listeners.forEach((l) => l());
}
export function useSharedCacheStatus() {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => listeners.delete(l); },
    () => online,
    () => null,
  );
}

export async function pingSharedCache() {
  try {
    const { error } = await withTimeout(supabase.from("fec_cache").select("cache_key").limit(1));
    setSharedCacheOnline(!error);
  } catch { setSharedCacheOnline(false); }
}

// ---- Diagnostics (rows read/written, last error), observable from React ----
export const SUPABASE_PROJECT_REF = "qqpokmhvjfzlrhtumfgt";
type Diag = { read: number; written: number; lastError: string | null };
let diag: Diag = { read: 0, written: 0, lastError: null };
const diagListeners = new Set<() => void>();
const initialDiag: Diag = { read: 0, written: 0, lastError: null };
export function recordDiag(p: { read?: number; written?: number; error?: string | null }) {
  diag = { read: diag.read + (p.read ?? 0), written: diag.written + (p.written ?? 0), lastError: p.error !== undefined && p.error !== null ? p.error : diag.lastError };
  diagListeners.forEach((l) => l());
}
export const getDiagnostics = () => diag;
export function useDiagnostics() {
  return useSyncExternalStore(
    (l) => { diagListeners.add(l); return () => diagListeners.delete(l); },
    () => diag,
    () => initialDiag,
  );
}
export async function testWrite(): Promise<string | null> {
  try {
    const { error } = await withTimeout(supabase.from("fec_cache").upsert(
      { cache_key: "diagnostic-test", payload: { ok: true, at: new Date().toISOString() }, fetched_at: new Date().toISOString() },
      { onConflict: "cache_key" },
    ));
    if (error) { recordDiag({ error: error.message }); setSharedCacheOnline(false); return error.message; }
    recordDiag({ written: 1 }); setSharedCacheOnline(true); return null;
  } catch (e) { const m = (e as Error).message; recordDiag({ error: m }); setSharedCacheOnline(false); return m; }
}
