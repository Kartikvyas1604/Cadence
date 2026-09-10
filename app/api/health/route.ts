import { NextResponse } from "next/server";
import { readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { OPERATIONS, isGraphConfigured, queryStudioGraph } from "../../../lib/server/graph";
import { resolveHookAddress } from "../../../lib/server/manifest";
import { createPublicClient, http } from "viem";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

type Integration = { configured: boolean; healthy: boolean; detail?: string };

/**
 * Health check — per-integration `{ configured, healthy, detail? }` (M-HEALTH:
 * backend-1 + qa-4). `configured` = env/manifest presence only. `healthy` = a
 * real probe: graph → canary allowlisted Studio op; intel → unpaid merchant
 * probe expecting the 402 challenge; contracts → live RPC reads the manifest
 * hook. Top-level `ok` stays process liveness. Never exposes secret values.
 */
export async function GET() {
  const [graph, intel, contracts] = await Promise.all([probeGraph(), probeIntel(), probeContracts()]);
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
      graph,
      intel,
      contracts,
      deploymentChains: deployments,
      x402: { mode: "intel-inline", routes: ["/api/intel", "/api/intel-service/ask"] },
    },
  });
}

async function probeGraph(): Promise<Integration> {
  const configured = isGraphConfigured();
  if (!configured) return { configured, healthy: false, detail: "GRAPH_ENDPOINT not set" };
  const res = await queryStudioGraph(OPERATIONS.mints, 3_000);
  if (!res.ok) return { configured, healthy: false, detail: res.error };
  return {
    configured,
    healthy: true,
    ...(res.empty ? { detail: "synced-but-empty — no Cadence entities indexed yet" } : {}),
  };
}

async function probeIntel(): Promise<Integration> {
  const configured = Boolean(
    process.env.X402_INTEL_URL && (process.env.X402_PRIVATE_KEY || process.env.HEDERA_PRIVATE_KEY),
  );
  if (!configured) return { configured, healthy: false, detail: "X402_INTEL_URL or payer key not set" };
  // unpaid probe: the merchant must answer 402 PAYMENT-REQUIRED (challenge up)
  try {
    const res = await fetch(process.env.X402_INTEL_URL as string, {
      method: "GET",
      signal: AbortSignal.timeout(3_000),
    });
    if (res.status === 402) return { configured, healthy: true };
    return { configured, healthy: false, detail: `unexpected_status_${res.status}` };
  } catch {
    return { configured, healthy: false, detail: "merchant_unreachable" };
  }
}

async function probeContracts(): Promise<Integration> {
  let deployments: string[] = [];
  try {
    const dir = path.join(process.cwd(), "public", "deployments");
    if (existsSync(dir)) deployments = readdirSync(dir).filter((f) => f.endsWith(".json"));
  } catch {
    /* report empty */
  }
  if (deployments.length === 0) return { configured: false, healthy: false, detail: "no deployment manifest published" };
  const hook = await resolveHookAddress();
  if (!hook) return { configured: true, healthy: false, detail: "hook address missing from manifest" };
  try {
    const pc = createPublicClient({ transport: http(process.env.RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com") });
    await pc.readContract({
      address: hook as `0x${string}`,
      abi: [{ type: "function", name: "currentEpoch", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] }],
      functionName: "currentEpoch",
    });
    return { configured: true, healthy: true };
  } catch {
    return { configured: true, healthy: false, detail: "hook unreadable on RPC" };
  }
}
