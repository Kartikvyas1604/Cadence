import { describe, test, afterEach } from "node:test";
import assert from "node:assert/strict";

async function loadRoute() {
  return import("../../app/api/intel-service/ask/route.ts");
}

const PAYMENT = Buffer.from(JSON.stringify({ scheme: "exact", value: "100000" })).toString("base64");
const CAPACITY = "0x" + (10n ** 18n).toString(16).padStart(64, "0"); // 1e18

function getReq(headers: Record<string, string>) {
  return new Request("http://localhost:3000/api/intel-service/ask", { headers });
}

/** mock that answers viem RPC reads and counts facilitator settle calls */
function mockChain({ settleOk = true }: { settleOk?: boolean } = {}) {
  const counts = { settle: 0 };
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    const u = String(_url instanceof Request ? _url.url : _url);
    if (u.endsWith("/verify")) {
      return new Response(JSON.stringify({ isValid: true, payer: "0x1" }), { status: 200 });
    }
    if (u.endsWith("/settle")) {
      counts.settle++;
      return settleOk
        ? new Response(JSON.stringify({ success: true, transaction: "0xsettle-tx" }), { status: 200 })
        : new Response(JSON.stringify({ success: false, errorReason: "reverted" }), { status: 200 });
    }
    // viem JSON-RPC reads (eth_call etc.) → capacity-shaped 32-byte results
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: CAPACITY }), { status: 200 });
  }) as typeof fetch;
  return {
    counts,
    restore() {
      globalThis.fetch = realFetch;
    },
  };
}

describe("GET /api/intel-service/ask (merchant)", () => {
  afterEach(() => {
    delete process.env.HOOK_ADDRESS;
    delete process.env.RPC_URL;
    delete process.env.X402_PAY_TO;
    delete process.env.FACILITATOR_URL;
  });

  test("unpaid GET → 402 challenge with PAYMENT-REQUIRED header (x402 surface)", async () => {
    const m = mockChain();
    try {
      const res = await (await loadRoute()).GET(getReq({}));
      assert.equal(res.status, 402);
      const challenge = res.headers.get("payment-required");
      assert.ok(challenge, "challenge header present");
      const decoded = JSON.parse(Buffer.from(challenge, "base64").toString("utf8"));
      assert.equal(decoded.x402Version, 2);
      assert.equal(decoded.accepts[0].scheme, "exact");
    } finally {
      m.restore();
    }
  });

  test("pool unreadable → 503 intel_pool_unreadable BEFORE settle (fail closed)", async () => {
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      throw new Error("rpc down");
    }) as typeof fetch;
    try {
      const res = await (await loadRoute()).GET(getReq({}));
      assert.equal(res.status, 503);
      const body = await res.json();
      assert.equal(body.error, "intel_pool_unreadable");
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  test("same Idempotency-Key twice → ONE settle, second replays cached quote (H4)", async () => {
    const m = mockChain();
    try {
      const key = "11112222-3333-4444";
      const res1 = await (await loadRoute()).GET(getReq({ "payment-signature": PAYMENT, "idempotency-key": key }));
      assert.equal(res1.status, 200);
      const body1 = await res1.json();
      assert.equal(res1.headers.get("x-idempotent-replay"), null);

      const res2 = await (await loadRoute()).GET(getReq({ "payment-signature": PAYMENT, "idempotency-key": key }));
      assert.equal(res2.status, 200);
      assert.equal(res2.headers.get("x-idempotent-replay"), "true");
      const body2 = await res2.json();
      assert.deepEqual(body1, body2, "replay returns the same cached quote");
      assert.equal(m.counts.settle, 1, "exactly one facilitator settle per key");
    } finally {
      m.restore();
    }
  });

  test("same payment payload without key → settle fingerprint dedupes (H4)", async () => {
    const m = mockChain();
    try {
      // no Idempotency-Key: the verified payload fingerprint is the key
      await (await loadRoute()).GET(getReq({ "payment-signature": PAYMENT }));
      await (await loadRoute()).GET(getReq({ "payment-signature": PAYMENT }));
      assert.equal(m.counts.settle, 1, "same signed payload settles exactly once");
    } finally {
      m.restore();
    }
  });

  test("settlement failure → 402, never a fake paid quote (M11)", async () => {
    const m = mockChain({ settleOk: false });
    try {
      // distinct payload — a prior test settled the default one
      const payment = Buffer.from(JSON.stringify({ scheme: "exact", value: "100000-fail" })).toString("base64");
      const res = await (await loadRoute()).GET(getReq({ "payment-signature": payment }));
      assert.equal(res.status, 402);
      const body = await res.json();
      assert.equal(body.error, "settlement_failed");
    } finally {
      m.restore();
    }
  });
});
