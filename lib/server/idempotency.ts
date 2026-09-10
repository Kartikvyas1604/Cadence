/**
 * Shared idempotency store for paid POST paths (/api/intel, intel-service/ask).
 *
 * Backends:
 *  - Upstash Redis REST (UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN):
 *    atomic reserve-or-read across serverless isolates. Only one caller per
 *    key reaches the paid handler; concurrent duplicates poll for the result.
 *  - In-process Map fallback when unset: single-isolate demo mode. Same-key
 *    requests inside one isolate serialize through a pending lock, but
 *    cross-isolate replay is NOT covered (documented limitation).
 *
 * Fail closed: if a configured store errors, the caller surfaces a 503 —
 * never a second payment (M-IDEM / backend-5 / finance-7).
 */
export const IDEMPOTENCY_TTL_MS = 10 * 60 * 1000;

export class StoreUnavailableError extends Error {
  constructor() {
    super("idempotency_store_unavailable");
  }
}

function upstashConfigured(): boolean {
  return Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}

async function upstash(cmd: unknown[]): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(process.env.UPSTASH_REDIS_REST_URL as string, {
      method: "POST",
      headers: {
        authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(cmd),
      signal: AbortSignal.timeout(3_000),
    });
  } catch {
    throw new StoreUnavailableError();
  }
  if (!res.ok) throw new StoreUnavailableError();
  const json = (await res.json()) as { result?: unknown; error?: unknown };
  if (json?.error) throw new StoreUnavailableError();
  return json.result;
}

type Done = { state: "done"; result: unknown };

async function upstashPath<T>(nk: string, ttlMs: number, fn: () => Promise<T>) {
  // replay: completed entry → return cached result, no second payment
  const existing = await upstash(["GET", nk]);
  if (existing != null) {
    const parsed = JSON.parse(String(existing)) as Partial<Done>;
    if (parsed.state === "done") return { result: parsed.result as T, replayed: true };
  }
  // atomic reserve — exactly one caller proceeds to the paid handler
  let reserved: unknown;
  try {
    reserved = await upstash(["SET", nk, JSON.stringify({ state: "pending" }), "NX", "PX", ttlMs]);
  } catch {
    throw new StoreUnavailableError();
  }
  if (reserved !== "OK") {
    // in-flight on another isolate — poll for the completed entry, then 503
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 750));
      const v = await upstash(["GET", nk]);
      if (v) {
        const parsed = JSON.parse(String(v)) as Partial<Done>;
        if (parsed.state === "done") return { result: parsed.result as T, replayed: true };
      }
    }
    throw new StoreUnavailableError();
  }
  try {
    const result = await fn();
    try {
      await upstash(["SET", nk, JSON.stringify({ state: "done", ts: Date.now(), result }), "PX", ttlMs]);
    } catch {
      // payment settled; caching the replay is best-effort — do not fail the call
    }
    return { result, replayed: false };
  } catch (e) {
    // release the reservation so a legitimate retry can re-run (failures are
    // never cached — only settled payments are)
    try {
      await upstash(["DEL", nk]);
    } catch {
      // store down; the pending key expires with its TTL anyway
    }
    throw e;
  }
}

type MemoryEntry = { state: "pending" | "done"; ts: number; result?: unknown };

const memoryStore = new Map<string, MemoryEntry>();
const pendingWaiters = new Map<string, Promise<unknown>>();

async function memoryPath<T>(key: string, ttlMs: number, fn: () => Promise<T>) {
  const now = Date.now();
  const existing = memoryStore.get(key);
  if (existing) {
    if (existing.state === "done" && now - existing.ts < ttlMs) {
      return { result: existing.result as T, replayed: true };
    }
    if (existing.state === "pending") {
      const waiter = pendingWaiters.get(key);
      if (waiter) {
        try {
          const result = (await waiter) as T;
          if (result !== undefined) return { result, replayed: true };
        } catch {
          // first caller failed — fall through and run fn ourselves
        }
      }
    }
  }
  let settle!: (v: unknown) => void;
  const promise = new Promise<unknown>((r) => {
    settle = r;
  });
  pendingWaiters.set(key, promise);
  memoryStore.set(key, { state: "pending", ts: now });
  try {
    const result = await fn();
    memoryStore.set(key, { state: "done", ts: Date.now(), result });
    settle(result);
    return { result, replayed: false };
  } catch (e) {
    memoryStore.delete(key);
    settle(undefined);
    throw e;
  } finally {
    pendingWaiters.delete(key);
  }
}

/**
 * Reserve-or-read around a paid handler. `fn` runs at most once per key
 * within `ttlMs` (per store). Store failure fails closed.
 */
export async function withIdempotency<T>(key: string, ttlMs: number, fn: () => Promise<T>) {
  if (upstashConfigured()) return upstashPath<T>(`cadence:idem:${key}`, ttlMs, fn);
  return memoryPath<T>(key, ttlMs, fn);
}
