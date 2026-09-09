"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Copy, LogOut, Wallet } from "lucide-react";
import {
  chainLabel,
  shortAddress,
  useInjectedWallet,
} from "@/lib/wallet/use-injected-wallet";

interface NetworkOption {
  name: string;
  chainId: number;
  rpc: string;
  explorer: string;
  currency: string;
}

const NETWORKS: NetworkOption[] = [
  { name: "Ethereum Sepolia", chainId: 11155111, rpc: "https://ethereum-sepolia-rpc.publicnode.com", explorer: "https://sepolia.etherscan.io", currency: "ETH" },
  { name: "Base Sepolia", chainId: 84532, rpc: "https://base-sepolia-rpc.publicnode.com", explorer: "https://sepolia.basescan.org", currency: "ETH" },
  { name: "Ethereum", chainId: 1, rpc: "https://eth.llamarpc.com", explorer: "https://etherscan.io", currency: "ETH" },
  { name: "Base", chainId: 8453, rpc: "https://base.llamarpc.com", explorer: "https://basescan.org", currency: "ETH" },
];

/** EIP-1193 switch with add-network fallback; returns an error message or null. */
async function switchOrAdd(
  provider: { request: (args: object) => Promise<unknown> } | null,
  net: NetworkOption,
): Promise<string | null> {
  if (!provider) return "No injected wallet found.";
  const hex = `0x${net.chainId.toString(16)}`;
  try {
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hex }] });
    return null;
  } catch {
    try {
      await provider.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: hex,
            chainName: net.name,
            rpcUrls: [net.rpc],
            blockExplorerUrls: [net.explorer],
            nativeCurrency: { name: net.currency, symbol: net.currency, decimals: 18 },
          },
        ],
      });
      await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hex }] });
      return null;
    } catch (e) {
      return e instanceof Error ? e.message.slice(0, 140) : "switch rejected";
    }
  }
}

function getProvider() {
  return (window as unknown as { ethereum?: { request: (args: object) => Promise<unknown> } }).ethereum ?? null;
}

export function WalletButton() {
  const wallet = useInjectedWallet();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [busyChain, setBusyChain] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function pick(net: NetworkOption) {
    if (wallet.chainId === net.chainId) {
      setOpen(false);
      return;
    }
    setBusyChain(net.chainId);
    setError(null);
    const err = await switchOrAdd(getProvider(), net);
    setBusyChain(null);
    if (err) {
      setError(err);
      return;
    }
    setOpen(false);
  }

  if (!wallet.available) {
    return (
      <a
        href="https://metamask.io/download/"
        target="_blank"
        rel="noreferrer"
        className="hidden h-10 items-center gap-2 rounded-md border border-border px-3.5 text-sm text-muted transition-colors duration-100 hover:border-border-strong hover:text-foreground md:inline-flex"
      >
        <Wallet className="size-4" aria-hidden />
        Install a wallet
      </a>
    );
  }

  if (!wallet.address) {
    return (
      <button
        type="button"
        onClick={() => void wallet.connect()}
        disabled={wallet.connecting}
        aria-busy={wallet.connecting}
        className="inline-flex h-10 items-center gap-2 rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground transition-colors duration-100 hover:bg-accent-strong active:translate-y-px disabled:pointer-events-none disabled:opacity-60"
      >
        <Wallet className="size-4" aria-hidden />
        {wallet.connecting ? "Connecting…" : "Connect wallet"}
      </button>
    );
  }

  const address = wallet.address;
  const liveDeployments = NETWORKS.slice(0, 2); // Sepolia + Base Sepolia

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="inline-flex h-10 items-center gap-2.5 rounded-md border border-border bg-surface px-3.5 transition-colors duration-100 hover:border-border-strong"
      >
        <span className="flex items-center gap-1.5 font-mono text-xs tabular-nums text-muted">
          <span
            aria-hidden
            className={`size-1.5 rounded-full ${
              wallet.chainId === 11155111 || wallet.chainId === 84532 ? "bg-success" : "bg-danger"
            }`}
          />
          {wallet.ethBalance !== null ? `${wallet.ethBalance.toFixed(4)} ETH` : "—"}
        </span>
        <span className="hidden font-mono text-[10px] uppercase tracking-widest text-muted sm:inline">
          {chainLabel(wallet.chainId)}
        </span>
        <span className="font-mono text-xs tabular-nums text-foreground">
          {shortAddress(address)}
        </span>
        <ChevronDown className="size-3.5 text-muted" aria-hidden />
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-12 z-50 w-64 rounded-lg border border-border bg-surface p-1.5 shadow-xl shadow-black/40"
        >
          <div className="px-3 py-2">
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted">
              {chainLabel(wallet.chainId)} · chain {wallet.chainId ?? "—"}
            </p>
            <p className="mt-0.5 break-all font-mono text-[11px] leading-5 text-foreground">
              {address}
            </p>
          </div>

          <p className="px-3 pb-1 pt-1 font-mono text-[10px] uppercase tracking-widest text-accent">
            networks
          </p>
          {NETWORKS.map((net) => {
            const current = wallet.chainId === net.chainId;
            const hasVenue = net.chainId === 11155111 || net.chainId === 84532;
            return (
              <button
                key={net.chainId}
                type="button"
                role="menuitem"
                onClick={() => void pick(net)}
                className="flex h-10 w-full items-center justify-between gap-2 rounded-md px-3 text-sm text-muted transition-colors duration-100 hover:bg-surface-raised hover:text-foreground"
              >
                <span className="flex items-center gap-2">
                  <span
                    aria-hidden
                    className={`size-1.5 rounded-full ${current ? "bg-success" : hasVenue ? "bg-accent" : "bg-border-strong"}`}
                  />
                  {net.name}
                  {hasVenue ? (
                    <span className="rounded border border-accent/50 px-1 font-mono text-[9px] uppercase text-accent-strong">
                      cadence live
                    </span>
                  ) : null}
                </span>
                <span className="font-mono text-[10px] tabular-nums text-muted">
                  {current ? "✓ on" : `#${net.chainId}`}
                </span>
              </button>
            );
          })}
          {error ? (
            <p
              role="status"
              className="mx-1 my-1 rounded-md border border-danger/50 bg-danger/5 px-2.5 py-1.5 text-[11px] leading-5 text-danger"
            >
              {error}
            </p>
          ) : null}

          <div className="my-1 border-t border-border" />
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              void navigator.clipboard
                .writeText(address)
                .then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                });
            }}
            className="flex h-10 w-full items-center gap-2.5 rounded-md px-3 text-sm text-muted transition-colors duration-100 hover:bg-surface-raised hover:text-foreground"
          >
            {copied ? (
              <Check className="size-4 text-success" aria-hidden />
            ) : (
              <Copy className="size-4" aria-hidden />
            )}
            {copied ? "Copied" : "Copy address"}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              wallet.disconnect();
            }}
            className="flex h-10 w-full items-center gap-2.5 rounded-md px-3 text-sm text-muted transition-colors duration-100 hover:bg-surface-raised hover:text-danger"
          >
            <LogOut className="size-4" aria-hidden />
            Disconnect
          </button>
        </div>
      ) : null}
    </div>
  );
}
