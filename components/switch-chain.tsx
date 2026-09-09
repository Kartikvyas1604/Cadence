"use client";

import { useState } from "react";
import { useCadence } from "@/lib/cadence/provider";

const NETWORKS = [
  {
    name: "Sepolia",
    chainId: 11155111,
    rpc: "https://ethereum-sepolia-rpc.publicnode.com",
    explorer: "https://sepolia.etherscan.io",
    currency: "ETH",
  },
  {
    name: "Base Sepolia",
    chainId: 84532,
    rpc: "https://base-sepolia-rpc.publicnode.com",
    explorer: "https://sepolia.basescan.org",
    currency: "ETH",
  },
] as const;

/**
 * One-click network switch (EIP-1193 wallet_switchEthereumChain with
 * wallet_addEthereumChain fallback). Rendered wherever the connected chain
 * has no Cadence deployment.
 */
export function SwitchChainRow() {
  const s = useCadence();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function switchTo(net: (typeof NETWORKS)[number]) {
    setBusy(net.name);
    setError(null);
    try {
      const provider = (window as unknown as { ethereum?: { request: (args: object) => Promise<unknown> } })
        .ethereum;
      if (!provider) {
        setError("No injected wallet found — install MetaMask or Rabby.");
        return;
      }
      try {
        await provider.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: `0x${net.chainId.toString(16)}` }],
        });
      } catch {
        // unknown chain — add it, then switch
        await provider.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: `0x${net.chainId.toString(16)}`,
              chainName: net.name,
              rpcUrls: [net.rpc],
              blockExplorerUrls: [net.explorer],
              nativeCurrency: { name: net.currency, symbol: net.currency, decimals: 18 },
            },
          ],
        });
        await provider.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: `0x${net.chainId.toString(16)}` }],
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message.slice(0, 140) : "switch rejected");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-3">
      <div className="grid gap-2 sm:grid-cols-2">
        {NETWORKS.map((net) => (
          <button
            key={net.name}
            type="button"
            onClick={() => void switchTo(net)}
            className={`inline-flex h-11 min-w-36 items-center justify-center rounded-md border px-4 font-mono text-xs uppercase tracking-widest transition-colors duration-100 ${
              s.chain.chainId === net.chainId
                ? "border-success/60 bg-success/10 text-success"
                : "border-accent/50 bg-accent/5 text-accent-strong hover:bg-accent/15 active:translate-y-px"
            }`}
          >
            {busy === net.name ? "switching…" : s.chain.chainId === net.chainId ? `on ${net.name} ✓` : `switch to ${net.name}`}
          </button>
        ))}
      </div>
      {error ? (
        <p role="status" className="rounded-md border border-danger/50 bg-danger/5 px-3 py-2 text-xs leading-5 text-danger">
          {error}
        </p>
      ) : null}
      <p className="font-mono text-[10px] uppercase tracking-widest text-muted">
        wallet chain id detected: {s.chain.chainId ?? "—"}
      </p>
    </div>
  );
}
