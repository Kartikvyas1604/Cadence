import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * Deployment manifest loader — single source of truth for live contract
 * addresses. `public/deployments/<chainId>.json` is regenerated on every
 * contract deploy; routes must read addresses from here (or required env)
 * instead of hardcoding — a stale hardcoded address reads the wrong pool
 * and sells intel against an empty venue (H3).
 */
export type DeploymentManifest = {
  hook: string;
  slots: string;
  router: string;
  clob: string;
  poolManager: string;
  epochLengthBlocks?: number;
  lambdaBps?: number;
  pricePerEth?: number;
  protocolTakeBps?: number;
  swapFeeBps?: number;
  usdc?: string;
  seedBlock?: number;
};

export function activeChainId(): number {
  return Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? process.env.CHAIN_ID ?? 11155111);
}

export async function loadDeploymentManifest(chainId = activeChainId()): Promise<DeploymentManifest | null> {
  try {
    const file = path.join(process.cwd(), "public", "deployments", `${chainId}.json`);
    const raw = await readFile(file, "utf8");
    return JSON.parse(raw) as DeploymentManifest;
  } catch {
    return null;
  }
}

/**
 * Resolve the live hook address: HOOK_ADDRESS env wins (operators may pin it),
 * otherwise the deployment manifest for the active chain. No hardcoded
 * fallback — an unresolved hook must fail closed (503), never quote.
 */
export async function resolveHookAddress(): Promise<string | null> {
  const env = process.env.HOOK_ADDRESS;
  if (env && /^0x[0-9a-fA-F]{40}$/.test(env)) return env;
  const manifest = await loadDeploymentManifest();
  if (manifest?.hook && /^0x[0-9a-fA-F]{40}$/.test(manifest.hook)) return manifest.hook;
  return null;
}
