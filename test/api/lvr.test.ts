import { describe, test, afterEach } from "node:test";
import assert from "node:assert/strict";

async function loadRoute() {
  return import("../../app/api/lvr/route.ts");
}

describe("GET /api/lvr", () => {
  afterEach(() => {
    delete process.env.GRAPH_ENDPOINT;
    delete process.env.GRAPH_API_KEY;
  });

  test("unconfigured → 503 lvr_not_configured (no fabricated samples)", async () => {
    const res = await (await loadRoute()).GET(new Request("http://localhost:3000/api/lvr"));
    assert.equal(res.status, 503);
    const body = await res.json();
    assert.equal(body.error, "lvr_not_configured");
  });

  test("configured + swaps → per-epoch markout aggregation", async () => {
    process.env.GRAPH_ENDPOINT = "https://studio.test/graphql";
    const realFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          data: {
            cadenceSwaps: [
              { epochId: "0", sizeInEth: "1000000000000000000", outAmount: "3000000000000000000000", blockNumber: "1", timestamp: "1" },
              { epochId: "0", sizeInEth: "1000000000000000000", outAmount: "2990000000000000000000", blockNumber: "2", timestamp: "2" },
            ],
          },
        }),
        { status: 200 },
      );
    try {
      const res = await (await loadRoute()).GET(new Request("http://localhost:3000/api/lvr"));
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.deepEqual(body.epochs, [0]);
      assert.deepEqual(body.markoutBps, [-33]);
      // volume is aggregated in raw wei units (numbers)
      assert.deepEqual(body.volumeActive, [2000000000000000000]);
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  test("configured + empty series → 200 empty shape with proxy marker (honest)", async () => {
    process.env.GRAPH_ENDPOINT = "https://studio.test/graphql";
    const realFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ data: { cadenceSwaps: [] } }), { status: 200 });
    try {
      const res = await (await loadRoute()).GET(new Request("http://localhost:3000/api/lvr"));
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.deepEqual(body, { epochs: [], markoutBps: [], volumeActive: [], proxy: "execution-drift" });
      // empty/stable series is CDN-cacheable briefly (sandbox-2 latency fix)
      assert.match(res.headers.get("cache-control") ?? "", /s-maxage/);
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});
