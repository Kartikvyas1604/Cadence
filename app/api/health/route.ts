import { NextResponse } from "next/server";
import { readdirSync, existsSync } from "node:fs";
import path from "node:path";

export const dynamic = "force-dynamic";

/**
 * Health check — reports which server-side integrations are configured.
 * Never exposes secret values, only presence. Contract deployment is
 * detected from the public deployment manifests (committed per chain).
 */
export async function GET() {
  let deployments: string[] = [];
  try {
    const dir = path.join(process.cwd(), "public", "deployments");
    if (existsSync(dir)) deployments = readdirSync(dir).filter((f) => f.endsWith(".json"));
  } catch {
    /* report empty */
  }
  return NextResponse.json({
    ok: true,
    ts: Date.now(),
    integrations: {
      graph: Boolean(process.env.GRAPH_ENDPOINT),
      intel: Boolean(
        process.env.X402_INTEL_URL &&
          (process.env.X402_PRIVATE_KEY || process.env.HEDERA_PRIVATE_KEY),
      ),
      contracts: deployments.length > 0,
      deploymentChains: deployments,
    },
  });
}
