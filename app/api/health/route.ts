import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Health check — reports which server-side integrations are configured.
 * Never exposes secret values, only presence.
 */
export async function GET() {
  return NextResponse.json({
    ok: true,
    ts: Date.now(),
    integrations: {
      graph: Boolean(process.env.GRAPH_ENDPOINT),
      intel: Boolean(process.env.X402_INTEL_URL && (process.env.X402_PRIVATE_KEY || process.env.HEDERA_PRIVATE_KEY)),
      contracts: Boolean(process.env.NEXT_PUBLIC_CADENCE_ADDRESSES),
    },
  });
}
