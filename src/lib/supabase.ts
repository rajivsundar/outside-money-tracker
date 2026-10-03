import { createClient } from "@supabase/supabase-js";
import { useSyncExternalStore } from "react";

// User's own external Supabase project (publishable key — safe in browser code).
export const SUPABASE_URL = "https://qqpokmhvjfzlrhtumfgt.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_f03m_5mNaU7heNgYlcGg1Q_YJu12Ner";

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
