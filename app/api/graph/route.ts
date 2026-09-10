import { NextResponse } from "next/server";
import { z } from "zod";
import { logRequest, rateLimit } from "../../../lib/server/rate-limit";
import { OPERATIONS, isGraphConfigured, queryStudioGraph } from "../../../lib/server/graph";
import { trackError } from "../../../lib/server/observe";

export const dynamic = "force-dynamic";

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

  if (!isGraphConfigured()) {
    return NextResponse.json(
      {
        error: "graph_not_configured",
        detail: "GRAPH_ENDPOINT is not set — subgraph endpoint required for live Studio data.",
      },
      { status: 503 },
    );
  }

  const id = logRequest(req, "graph", { op: parsed.data.op });
  const res = await queryStudioGraph(query, 8_000, id);
  if (!res.ok) {
    if (res.error === "upstream_unreachable") {
      return NextResponse.json(
        { error: res.error, detail: res.detail },
        { status: 502, headers: { "x-request-id": id } },
      );
    }
    if (res.error === "graphql_errors") {
      return NextResponse.json(
        { error: res.error, errors: res.detail },
        { status: 502, headers: { "x-request-id": id } },
      );
    }
    return NextResponse.json(
      { error: res.error, status: res.status, data: res.detail },
      { status: 502, headers: { "x-request-id": id } },
    );
  }
  return NextResponse.json(res.body, {
    headers: {
      "cache-control": "no-store",
      "x-request-id": id,
      ...(res.empty ? { "x-graph-empty": "synced-but-empty" } : {}),
    },
  });
}
