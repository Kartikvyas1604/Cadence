import { describe, test, afterEach } from "node:test";
import assert from "node:assert/strict";

async function loadRoute() {
  return import("../../app/api/x402/cre-ask/route.ts");
}

describe("GET /api/x402/cre-ask", () => {
  afterEach(() => {
    delete process.env.CRE_WORKFLOW_URL;
    delete process.env.CRE_API_KEY;
  });

  test("unconfigured → 503 cre_not_configured (honest, no fabricated ask)", async () => {
    const res = await (await loadRoute()).GET(new Request("http://localhost:3000/api/x402/cre-ask"));
    assert.equal(res.status, 503);
    const body = await res.json();
    assert.equal(body.error, "cre_not_configured");
  });
});
