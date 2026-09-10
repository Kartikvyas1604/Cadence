import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Read-safe x402 surface (sandbox-3): config/readiness only — no funds move,
 * no challenge is minted, nothing to pay. The payment surfaces are:
 *   - /api/intel               → POST-only client proxy (server pays)
 *   - /api/intel-service/ask   → GET-based merchant (402 challenge, client pays)
 * Documented here so monitors/audits never 404 on the documented entrypoints.
 */
export async function GET() {
  const merchantConfigured = Boolean(
    process.env.X402_PAY_TO || process.env.X402_FEE_PAYER || process.env.FACILITATOR_URL,
  );
  const payerConfigured = Boolean(
    process.env.X402_INTEL_URL &&
      (process.env.X402_PRIVATE_KEY || process.env.HEDERA_PRIVATE_KEY),
  );

  return NextResponse.json(
    {
      x402Version: 2,
      mode: "intel-inline",
      routes: {
        merchantChallenge: "/api/intel-service/ask",
        clientProxy: "/api/intel",
      },
      readiness: {
        merchant: { configured: merchantConfigured },
        payer: { configured: payerConfigured },
      },
      probe: {
        merchant: "GET /api/intel-service/ask → 402 PAYMENT-REQUIRED (challenge envelope)",
        clientProxy: "POST /api/intel + Idempotency-Key (server-side payment; GET → 405)",
      },
    },
    { headers: { "cache-control": "no-store" } },
  );
}
