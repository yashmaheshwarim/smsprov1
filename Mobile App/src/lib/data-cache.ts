// ─── Simple In-Memory Cache with TTL ────────────────────────────────────────

interface CacheEntry<T> {
  data: T;
  expiry: number;
}

const cache = new Map<string, CacheEntry<any>>();
const DEFAULT_TTL_MS = 60_000; // 1 minute default
const SHORT_TTL_MS = 15_000;   // 15 seconds for fast-changing data
const LONG_TTL_MS = 300_000;   // 5 minutes for static data

/**
 * Get data from cache, or fetch and cache it.
 * Accepts any thenable/awaitable fetcher (Supabase queries, Promises, etc.)
 */
export async function getCached<T>(
  key: string,
  fetcher: () => (Promise<T> | any),
  ttlMs: number = DEFAULT_TTL_MS
): Promise<T> {
  const now = Date.now();
  const entry = cache.get(key);

  if (entry && now < entry.expiry) {
    return entry.data as T;
  }

  const data = await Promise.resolve(fetcher());
  cache.set(key, { data, expiry: now + ttlMs });
  return data as T;
}

/**
 * Invalidate a specific cache key.
 */
export function invalidateCache(key: string): void {
  cache.delete(key);
}

/**
 * Invalidate all cache keys matching a prefix.
 */
export function invalidateCachePrefix(prefix: string): void {
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) {
      cache.delete(key);
    }
  }
}

/**
 * Clear the entire cache.
 */
export function clearCache(): void {
  cache.clear();
}

/**
 * Get current cache size (number of entries).
 */
export function getCacheSize(): number {
  return cache.size;
}

export const TTL = {
  SHORT: SHORT_TTL_MS,
  DEFAULT: DEFAULT_TTL_MS,
  LONG: LONG_TTL_MS,
} as const;

// ─── Cache Keys ─────────────────────────────────────────────────────────────

export const CacheKeys = {
  students: (instId: string) => `students:${instId}`,
  studentCount: (instId: string) => `students:count:${instId}`,
  attendance: (instId: string, date: string) => `attendance:${instId}:${date}`,
  invoices: (instId: string) => `invoices:${instId}`,
  fees: (instId: string) => `fees:${instId}`,
  marks: (instId: string) => `marks:${instId}`,
  leaves: (instId: string) => `leaves:${instId}`,
  institutes: 'superadmin:institutes',
  batchStudents: (instId: string, batch: string) => `batch:${instId}:${batch}`,
} as const;
