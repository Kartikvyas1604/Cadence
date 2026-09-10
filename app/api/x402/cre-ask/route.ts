import { NextResponse } from "next/server";
import { z } from "zod";
import { logRequest, rateLimit } from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const AskSchema = z.object({
  suggestedAsk: z.coerce.number().positive().max(1e6),
  attestation: z.string().min(8).max(512),
  workflowId: z.string().max(200).optional(),
});

/**
 * CRE TEE confidential ask (Extended §6). The toxicity/capacity model runs
 * inside a Chainlink CRE confidential workflow; only the public ask plus a
 * verifiable attestation leave the TEE. x402 still pays for the request.
 *
 * Requires CRE_WORKFLOW_URL + CRE_API_KEY (server-only env). Without them
 * the route returns an honest 503 — no fabricated ask is ever served.
 */
export async function GET(req: Request) {
  const limited = rateLimit(req, "cre-ask", 5, 60_000);
  if (limited) return limited;

  if (!process.env.CRE_WORKFLOW_URL || !process.env.CRE_API_KEY) {
    return NextResponse.json(
      {
        error: "cre_not_configured",
        detail:
          "CRE_WORKFLOW_URL and CRE_API_KEY are not set — the confidential workflow cannot be invoked. No fabricated ask is served.",
      },
      { status: 503 },
    );
  }

  const id = logRequest(req, "cre-ask");
  try {
    const res = await fetch(process.env.CRE_WORKFLOW_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${process.env.CRE_API_KEY}`,
        "x-request-id": id,
      },
      // private inputs stay inside the workflow; we only request the public ask
      body: JSON.stringify({ request: "capacity-ask", requestId: id }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      return NextResponse.json({ error: "cre_upstream_error", status: res.status }, { status: 502 });
    }
    const raw = await res.json();
    const ask = AskSchema.safeParse(raw);
    if (!ask.success) {
      return NextResponse.json(
        { error: "cre_invalid_payload", detail: ask.error.issues.slice(0, 3) },
        { status: 502 },
      );
    }
    return NextResponse.json(
      {
        suggestedAsk: ask.data.suggestedAsk,
        attestation: ask.data.attestation,
        workflowId: ask.data.workflowId ?? "cre",
        source: "chainlink-cre",
        asOf: Date.now(),
        paid: false, // H13: only CRE_API_KEY used — no x402 settlement performed
      },
      { headers: { "cache-control": "no-store", "x-request-id": id } },
    );
  } catch (e) {
    return NextResponse.json(
      { error: "cre_call_failed", detail: e instanceof Error ? e.message : "unknown" },
      { status: 502 },
    );
  }
}
