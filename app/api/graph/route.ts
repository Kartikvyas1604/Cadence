import { NextResponse } from "next/server";
import { z } from "zod";
import { logRequest, rateLimit } from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";

/** M2: allowlisted operations — client sends { op, last } not raw GraphQL */
const OPERATIONS: Record<string, string> = {
  mints: `{ cadenceMints(first: $last, orderBy: blockNumber, orderDirection: desc) { id epochId buyer size pricePaid blockNumber timestamp } }`,
  commits: `{ cadenceCommits(first: $last, orderBy: blockNumber, orderDirection: desc) { id epochId H payer escrow } }`,
  reveals: `{ cadenceReveals(first: $last, orderBy: blockNumber, orderDirection: desc) { id epochId H trader size } }`,
  consumes: `{ cadenceConsumes(first: $last, orderBy: blockNumber, orderDirection: desc) { id epochId trader size } }`,
  swaps: `{ cadenceSwaps(first: $last, orderBy: blockNumber, orderDirection: desc) { id epochId trader sizeInEth outAmount fromCommitment } }`,
};

const OpSchema = z.object({
  op: z.enum(Object.keys(OPERATIONS) as [string, ...string[]]),
  last: z.coerce.number().int().min(1).max(100).optional().default(50),
});

/**
 * Graph Studio subgraph proxy — the Studio API key and endpoint URL stay
 * server-side; the client only ever talks to this route handler.
 */
export async function POST(req: Request) {
  const limited = rateLimit(req, "graph", 30, 10_000);
  if (limited) return limited;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = OpSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_op", detail: parsed.error.issues.slice(0, 3) }, { status: 400 });
  }
  const query = OPERATIONS[parsed.data.op].replace("$last", String(parsed.data.last));

  const endpoint = process.env.GRAPH_ENDPOINT;
  const key = process.env.GRAPH_API_KEY;
  if (!endpoint) {
    return NextResponse.json(
      {
        error: "graph_not_configured",
        detail: "GRAPH_ENDPOINT is not set — subgraph endpoint required for live Studio data.",
      },
      { status: 503 },
    );
  }

  const id = logRequest(req, "graph", { op: parsed.data.op });
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(key ? { authorization: `Bearer ${key}` } : {}),
        "x-request-id": id,
      },
      body: JSON.stringify({ query, variables: { last: parsed.data.last } }),
      // Studio GraphQL: short timeout, no caching of live data
      signal: AbortSignal.timeout(8_000),
    });
    const data = (await res.json()) as { errors?: unknown[] };
    if (!res.ok) {
      return NextResponse.json({ error: "upstream_error", status: res.status, data }, { status: 502 });
    }
    if (data.errors?.length) {
      return NextResponse.json({ error: "graphql_errors", errors: data.errors }, { status: 502 });
    }
    return NextResponse.json(data, {
      headers: { "cache-control": "no-store", "x-request-id": id },
    });
  } catch (e) {
    return NextResponse.json(
      { error: "upstream_unreachable", detail: e instanceof Error ? e.message : "unknown" },
      { status: 502 },
    );
  }
}
