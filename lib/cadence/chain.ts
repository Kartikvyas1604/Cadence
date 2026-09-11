"use client";

import { useEffect, useState } from "react";

/**
 * Public RPC endpoints per chain — reads real chain state (eth_chainId,
 * eth_blockNumber) over JSON-RPC. Override with NEXT_PUBLIC_RPC_URL.
 * Only chains where Cadence has a deployment (plus local anvil) are listed —
 * every other network is answered with an honest "unsupported network" state
 * instead of firing fetches a strict CSP would block.
 */
const PUBLIC_RPC: Record<number, string> = {
  11155111: "https://ethereum-sepolia-rpc.publicnode.com",
  84532: "https://base-sepolia-rpc.publicnode.com",
  31337: "http://localhost:8545",
};

export function rpcForChain(chainId: number | null): string | null {
  const env = process.env.NEXT_PUBLIC_RPC_URL;
  if (env) return env;
  if (chainId != null && PUBLIC_RPC[chainId]) return PUBLIC_RPC[chainId];
  return null;
}

const POLL_MS = 2000;

function hexToNumber(hex: unknown): number | null {
  if (typeof hex !== "string") return null;
  try {
    const n = Number.parseInt(hex, 16);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

/**
 * Live chain state for the connected wallet's network. The wallet's chainId
 * picks the endpoint; block number is polled from a real RPC.
 */
export function useChainState(walletChainId: number | null) {
  const [chainId, setChainId] = useState<number | null>(null);
  const [blockNumber, setBlockNumber] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const rpc = rpcForChain(walletChainId);

  useEffect(() => {
    // no venue chain picked (wallet not connected / on an unlisted chain) —
    // hold the honest waiting state instead of fetching a blocked endpoint
    if (!rpc) {
      queueMicrotask(() => {
        setChainId(null);
        setBlockNumber(null);
        setError(
          walletChainId == null
            ? "connect a wallet"
            : "unsupported network — switch to Sepolia or Base Sepolia",
        );
      });
      return;
    }
    let alive = true;
    const endpoint = rpc;
    const controller = new AbortController();

    async function rpcCall(method: string, params: unknown[] = []) {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`rpc http ${res.status}`);
      const body = (await res.json()) as {
        result?: unknown;
        error?: { message?: string };
      };
      if (body.error) throw new Error(body.error.message ?? "rpc error");
      return body.result;
    }

    (async () => {
      try {
        const cid = hexToNumber(await rpcCall("eth_chainId"));
        const bn = hexToNumber(await rpcCall("eth_blockNumber"));
        if (!alive) return;
        setChainId(cid);
        setBlockNumber(bn);
        setError(bn === null ? "chain unreachable" : null);
      } catch (e) {
        if (!alive) return;
        setBlockNumber(null);
        setError(e instanceof Error ? e.message : "chain unreachable");
      }
    })();

    const t = setInterval(() => {
      (async () => {
        try {
          const bn = hexToNumber(await rpcCall("eth_blockNumber"));
          if (!alive || bn === null) return;
          setBlockNumber(bn);
          setError(null);
        } catch {
          /* transient — keep the last real block */
        }
      })();
    }, POLL_MS);

    return () => {
      alive = false;
      controller.abort();
      clearInterval(t);
    };
  }, [rpc]);

  return { chainId, blockNumber, error };
}
