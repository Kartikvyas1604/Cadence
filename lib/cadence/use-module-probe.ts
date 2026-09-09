"use client";

import { useEffect, useState } from "react";
import type { Abi } from "viem";
import { publicClientFor } from "./contract";
import type { CadenceDeployment } from "./abis";
import { loadDeployment } from "./abis";

/**
 * Probe whether a module's view function exists on-chain. Modules that the
 * backend has not deployed yet render their honest "waiting" states; the
 * moment the contract answers, the UI lights up — no UI changes needed.
 */
export function useModuleProbe(
  chainId: number | null,
  pickAddress: (d: CadenceDeployment) => `0x${string}`,
  abi: Abi,
  functionName: string,
): boolean | null {
  // diagnostics surface on-panel via useProbeDiag(reason)
  return useModuleProbeDetailed(chainId, pickAddress, abi, functionName).available;
}

/** Detailed probe: availability + the exact failure reason for the panel. */
export function useModuleProbeDetailed(
  chainId: number | null,
  pickAddress: (d: CadenceDeployment) => `0x${string}`,
  abi: Abi,
  functionName: string,
): { available: boolean | null; reason: string | null } {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [reason, setReason] = useState<string | null>(null);

  useEffect(() => {
    if (chainId == null) {
      setAvailable(null);
      setReason(null);
      return;
    }
    let alive = true;
    (async () => {
      const d = await loadDeployment(chainId);
      if (!alive) return;
      if (!d) {
        setAvailable(false);
        setReason(`no deployment manifest served for chain ${chainId}`);
        return;
      }
      try {
        await publicClientFor(chainId).readContract({
          address: pickAddress(d),
          abi,
          functionName,
          args: [] as never,
        });
        if (alive) {
          setAvailable(true);
          setReason(null);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message.slice(0, 120) : "unknown probe error";
        if (alive) {
          setAvailable(false);
          setReason(`${functionName} on ${pickAddress(d)} failed: ${msg}`);
          console.error("[cadence] probe failed:", msg);
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [chainId, pickAddress, abi, functionName]);

  return { available, reason };
}
