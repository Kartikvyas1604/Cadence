import { NextResponse } from "next/server";
import { logRequest, rateLimit } from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";

interface SubgraphSwap {
  epochId: string;
  sizeInEth: string;
  outAmount: string;
  blockNumber: string;
  timestamp: string;
}

/**
 * LVR / markout panel data (Extended §3). Aggregates the live Studio
 * subgraph's CadenceSwap events into per-epoch samples:
 *
 *   markoutBps — execution price per fill vs the epoch's first fill price.
 *   This is a PROXY (documented in the UI as HYPOTHESIS quality): true LVR
 *   compares each fill with an external CFMM price one block later, which
 *   needs a DEX compose feed. What we can compute honestly from our own
 *   fills is the within-epoch execution drift.
 *
 * Returns 503 with an explanation when the subgraph is not configured —
 * no fabricated samples.
 */
export async function GET(req: Request) {
  const limited = rateLimit(req, "lvr", 20, 10_000);
  if (limited) return limited;

  const endpoint = process.env.GRAPH_ENDPOINT;
  if (!endpoint) {
    return NextResponse.json(
      {
        error: "lvr_not_configured",
        detail:
          "GRAPH_ENDPOINT is not set — the markout proxy needs the live Studio subgraph. No fabricated samples are served.",
      },
      { status: 503 },
    );
  }

  const id = logRequest(req, "lvr");
  try {
    const query = `{
      cadenceSwaps(first: 1000, orderBy: blockNumber, orderDirection: asc) {
        epochId
        sizeInEth
        outAmount
        blockNumber
        timestamp
      }
    }`;
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(process.env.GRAPH_API_KEY ? { authorization: `Bearer ${process.env.GRAPH_API_KEY}` } : {}),
        "x-request-id": id,
      },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) {
      return NextResponse.json({ error: "upstream_error", status: res.status }, { status: 502 });
    }
    const body = (await res.json()) as { data?: { cadenceSwaps?: SubgraphSwap[] }; errors?: unknown };
    const swaps = body.data?.cadenceSwaps ?? [];
    if (swaps.length === 0) {
      return NextResponse.json({ epochs: [], markoutBps: [], volumeActive: [], proxy: "execution-drift" });
    }

    // group by epoch; markout proxy = execution price drift vs first fill of
    // the epoch, in bps (execution price = outAmount / sizeInEth, USDC/ETH)
    type EpochAgg = { firstPrice: number | null; lastPrice: number; volume: number };
    const epochs = new Map<string, EpochAgg>();
    for (const sw of swaps) {
      const sizeEth = Number(sw.sizeInEth);
      const out = Number(sw.outAmount);
      if (!sizeEth || !out) continue;
      const price = out / sizeEth;
      const agg = epochs.get(sw.epochId) ?? { firstPrice: null, lastPrice: price, volume: 0 };
      if (agg.firstPrice === null) agg.firstPrice = price;
      agg.lastPrice = price;
      agg.volume += sizeEth;
      epochs.set(sw.epochId, agg);
    }

    const sorted = [...epochs.entries()].sort((a, b) => Number(a[0]) - Number(b[0]));
    const epochIds: number[] = [];
    const markoutBps: number[] = [];
    const volumeActive: number[] = [];
    for (const [ep, agg] of sorted) {
      if (agg.firstPrice === null) continue;
      epochIds.push(Number(ep));
      // negative drift = fills getting worse than the epoch's open (classic
      // adverse selection direction); bps of the epoch's first fill price
      markoutBps.push(Math.round(((agg.lastPrice - agg.firstPrice) / agg.firstPrice) * 10_000));
      volumeActive.push(agg.volume);
    }

    return NextResponse.json(
      { epochs: epochIds, markoutBps, volumeActive, proxy: "execution-drift", asOf: Date.now() },
      { headers: { "cache-control": "no-store", "x-request-id": id } },
    );
  } catch (e) {
    return NextResponse.json(
      { error: "upstream_unreachable", detail: e instanceof Error ? e.message : "unknown" },
      { status: 502 },
    );
  }
}
