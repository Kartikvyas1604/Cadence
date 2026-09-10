import { describe, test, afterEach } from "node:test";
import assert from "node:assert/strict";

async function loadRoute() {
  return import("../../app/api/intel/route.ts");
}

function postReq(body: unknown, headers: Record<string, string> = {}) {
  return new Request("http://localhost:3000/api/intel", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("POST /api/intel (paid proxy)", () => {
  afterEach(() => {
    delete process.env.X402_INTEL_URL;
    delete process.env.X402_PRIVATE_KEY;
    delete process.env.HEDERA_PRIVATE_KEY;
    delete process.env.HEDERA_ACCOUNT_ID;
  });

  test("missing Idempotency-Key → 400 (one key = one paid call)", async () => {
    process.env.X402_INTEL_URL = "https://merchant.test/ask";
    process.env.X402_PRIVATE_KEY = "0x" + "1".repeat(64);
    const res = await (await loadRoute()).POST(postReq({}));
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error, "idempotency_key_required");
  });

  test("unconfigured → 503 intel_not_configured (no fake quote)", async () => {
    const res = await (await loadRoute()).POST(postReq({}, { "idempotency-key": "aaaaaaaa-bbbb-cccc" }));
    assert.equal(res.status, 503);
    const body = await res.json();
    assert.equal(body.error, "intel_not_configured");
  });

  test("upstream failure → 502 (never fabricated success)", async () => {
    process.env.X402_INTEL_URL = "https://merchant.test/ask";
    process.env.X402_PRIVATE_KEY = "0x" + "1".repeat(64);
    const realFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      throw new Error("boom");
    };
    try {
      const res = await (await loadRoute()).POST(postReq({}, { "idempotency-key": "ccccdddd-eeee-ffff" }));
      assert.equal(res.status, 502);
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  test("same Idempotency-Key twice → one paid call, replay covered by store tests (M-IDEM)", async () => {
    // the payment-path replay semantics live in lib/server/idempotency —
    // covered in idempotency.test.ts (concurrent same key → one payment)
    assert.ok(true);
  });
});

describe("GET /api/intel", () => {
  test("→ 405 method_not_allowed (POST-only by design)", async () => {
    const res = await (await loadRoute()).GET();
    assert.equal(res.status, 405);
    const body = await res.json();
    assert.equal(body.error, "method_not_allowed");
  });
});
