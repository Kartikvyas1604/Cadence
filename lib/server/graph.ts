/**
 * Server-side Graph Studio access — allowlisted operations only. The Studio
 * endpoint + API key never leave the server; route handlers and the health
 * canary share this module so there is exactly one probe path.
 */
export const OPERATIONS: Record<string, string> = {
  mints: `{ cadenceMints(first: $last, orderBy: blockNumber, orderDirection: desc) { id epochId buyer size pricePaid blockNumber timestamp } }`,
  commits: `{ cadenceCommits(first: $last, orderBy: blockNumber, orderDirection: desc) { id epochId H payer escrow } }`,
  reveals: `{ cadenceReveals(first: $last, orderBy: blockNumber, orderDirection: desc) { id epochId H trader size } }`,
  consumes: `{ cadenceConsumes(first: $last, orderBy: blockNumber, orderDirection: desc) { id epochId trader size } }`,
  swaps: `{ cadenceSwaps(first: $last, orderBy: blockNumber, orderDirection: desc) { id epochId trader sizeInEth outAmount fromCommitment } }`,
};

export const SWAPS_QUERY = `{
  cadenceSwaps(first: 1000, orderBy: blockNumber, orderDirection: asc) {
    epochId
    sizeInEth
    outAmount
    blockNumber
    timestamp
  }
}`;

export type GraphResult =
  | { ok: true; body: Record<string, unknown>; empty?: boolean }
  | { ok: false; error: string; status?: number; detail?: unknown };

export function isGraphConfigured(): boolean {
  return Boolean(process.env.GRAPH_ENDPOINT);
}

/** POST one query to Studio with a bounded timeout. Never logs the key. */
export async function queryStudioGraph(query: string, timeoutMs = 8_000, requestId?: string): Promise<GraphResult> {
  const endpoint = process.env.GRAPH_ENDPOINT;
  if (!endpoint) return { ok: false, error: "graph_not_configured" };
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(process.env.GRAPH_API_KEY ? { authorization: `Bearer ${process.env.GRAPH_API_KEY}` } : {}),
        ...(requestId ? { "x-request-id": requestId } : {}),
      },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return { ok: false, error: "upstream_error", status: res.status };
    const body = (await res.json()) as { data?: Record<string, unknown>; errors?: unknown[] };
    if (body.errors?.length) return { ok: false, error: "graphql_errors", detail: body.errors };
    const entities = body.data ? (Object.values(body.data)[0] as unknown[] | undefined) : undefined;
    if (Array.isArray(entities) && entities.length === 0) return { ok: true, body, empty: true };
    return { ok: true, body };
  } catch (e) {
    return { ok: false, error: "upstream_unreachable", detail: e instanceof Error ? e.message : "unknown" };
  }
}
