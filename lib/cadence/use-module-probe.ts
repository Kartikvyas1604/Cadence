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
  const [available, setAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    if (chainId == null) {
      setAvailable(null);
      return;
    }
    let alive = true;
    (async () => {
      const d = await loadDeployment(chainId);
      if (!alive) return;
      if (!d) {
        setAvailable(false);
        return;
      }
      try {
        await publicClientFor(chainId).readContract({
          address: pickAddress(d),
          abi,
          functionName,
          args: [] as never,
        });
        if (alive) setAvailable(true);
      } catch {
        if (alive) setAvailable(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [chainId, pickAddress, abi, functionName]);

  return available;
}
