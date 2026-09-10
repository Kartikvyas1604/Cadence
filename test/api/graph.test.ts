import { describe, test, afterEach } from "node:test";
import assert from "node:assert/strict";

async function loadRoute() {
  return import("../../app/api/graph/route.ts");
}

function jsonReq(body: unknown) {
  return new Request("http://localhost:3000/api/graph", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/graph", () => {
  afterEach(() => {
    delete process.env.GRAPH_ENDPOINT;
    delete process.env.GRAPH_API_KEY;
  });

  test("invalid op → 400 invalid_op (allowlist holds)", async () => {
    process.env.GRAPH_ENDPOINT = "https://studio.test/graphql";
    const res = await (await loadRoute()).POST(jsonReq({ op: "rawGraph" }));
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error, "invalid_op");
  });

  test("unconfigured → 503 graph_not_configured (honest)", async () => {
    const res = await (await loadRoute()).POST(jsonReq({ op: "mints" }));
    assert.equal(res.status, 503);
    const body = await res.json();
    assert.equal(body.error, "graph_not_configured");
  });

  test("allowlisted op → 200, upstream data shape passthrough", async () => {
    process.env.GRAPH_ENDPOINT = "https://studio.test/graphql";
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          data: { cadenceMints: [{ id: "a", epochId: "0", buyer: "0x1", size: "1", pricePaid: "1", blockNumber: "1", timestamp: "1" }] },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    const res = await (await loadRoute()).POST(jsonReq({ op: "mints", last: 10 }));
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(Array.isArray(body.data.cadenceMints), true);
    assert.equal(body.data.cadenceMints[0].id, "a");
  });

  test("synced-but-empty → 200 with x-graph-empty marker (no fake data)", async () => {
    process.env.GRAPH_ENDPOINT = "https://studio.test/graphql";
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ data: { cadenceMints: [] } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    const res = await (await loadRoute()).POST(jsonReq({ op: "mints" }));
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("x-graph-empty"), "synced-but-empty");
  });
});
