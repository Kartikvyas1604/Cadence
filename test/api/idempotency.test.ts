import { describe, test, afterEach } from "node:test";
import assert from "node:assert/strict";

async function loadStore() {
  return import("../../lib/server/idempotency.ts");
}

describe("withIdempotency (M-IDEM shared store)", () => {
  afterEach(() => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
  });

  test("same key twice → one paid call, second replays with x-replay semantics", async () => {
    const { withIdempotency, IDEMPOTENCY_TTL_MS } = await loadStore();
    let payments = 0;
    const pay = async () => {
      payments++;
      return { quote: "ask", settlement: "settled" };
    };
    const first = await withIdempotency("test-key-1", IDEMPOTENCY_TTL_MS, pay);
    assert.equal(first.replayed, false);
    const second = await withIdempotency("test-key-1", IDEMPOTENCY_TTL_MS, pay);
    assert.equal(second.replayed, true);
    assert.deepEqual(first.result, second.result);
    assert.equal(payments, 1, "exactly one upstream payment per key");
  });

  test("concurrent same key → one payment, both callers share the result", async () => {
    const { withIdempotency } = await loadStore();
    let payments = 0;
    const pay = async () => {
      payments++;
      await new Promise((r) => setTimeout(r, 20));
      return { quote: "concurrent" };
    };
    const [a, b] = await Promise.all([
      withIdempotency("test-key-2", 10_000, pay),
      withIdempotency("test-key-2", 10_000, pay),
    ]);
    assert.equal(payments, 1, "concurrent duplicates must not pay twice");
    assert.deepEqual(a.result, b.result);
  });

  test("failed call is not cached — a retry can pay", async () => {
    const { withIdempotency } = await loadStore();
    let attempts = 0;
    const failing = async () => {
      attempts++;
      throw new Error("upstream_down");
    };
    await assert.rejects(() => withIdempotency("test-key-fail", 10_000, failing));
    const ok = await withIdempotency("test-key-fail", 10_000, async () => {
      attempts++;
      return "paid";
    });
    assert.equal(ok.replayed, false);
    assert.equal(attempts, 2, "failure does not cache — retry pays exactly once more");
  });

  test("configured store unavailable → fails closed (never pay twice)", async () => {
    process.env.UPSTASH_REDIS_REST_URL = "http://127.0.0.1:1/"; // closed port
    process.env.UPSTASH_REDIS_REST_TOKEN = "test";
    const { withIdempotency } = await loadStore();
    await assert.rejects(
      () => withIdempotency("test-key-3", 10_000, async () => "should-not-run"),
      { message: "idempotency_store_unavailable" },
    );
  });

  test("TTL expiry: a key older than the TTL pays again (correct behavior)", async () => {
    const { withIdempotency } = await loadStore();
    let payments = 0;
    const pay = async () => {
      payments++;
      return "q" + payments;
    };
    await withIdempotency("test-key-4", 1, pay); // TTL 1ms
    await new Promise((r) => setTimeout(r, 30));
    const second = await withIdempotency("test-key-4", 1, pay);
    assert.equal(second.replayed, false);
    assert.equal(payments, 2, "expired key is a new payment");
  });
});
