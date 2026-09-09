"use client";

import { useEffect, useRef, useState } from "react";

import { AlertTriangle, Check, ChevronDown, Globe } from "lucide-react";
import { useInjectedWallet } from "@/lib/wallet/use-injected-wallet";

interface NetworkOption {
  name: string;
  chainId: number;
  rpc: string;
  explorer: string;
  currency: string;
  venue: boolean;
  hue: string; // dot color
}

const CHAIN_KEY = "cadence:chain";
// per-PAGE-LOAD flag (module scope): sessionStorage survives hard refreshes,
// which would permanently disable the auto-restore after the first run
let autoSwitchTried = false;

const NETWORKS: NetworkOption[] = [
  {
    name: "Ethereum Sepolia",
    chainId: 11155111,
    rpc: "https://ethereum-sepolia-rpc.publicnode.com",
    explorer: "https://sepolia.etherscan.io",
    currency: "ETH",
    venue: true,
    hue: "bg-info",
  },
  {
    name: "Base Sepolia",
    chainId: 84532,
    rpc: "https://base-sepolia-rpc.publicnode.com",
    explorer: "https://sepolia.basescan.org",
    currency: "ETH",
    venue: true,
    hue: "bg-accent",
  },
  {
    name: "Ethereum",
    chainId: 1,
    rpc: "https://eth.llamarpc.com",
    explorer: "https://etherscan.io",
    currency: "ETH",
    venue: false,
    hue: "bg-border-strong",
  },
  {
    name: "Base",
    chainId: 8453,
    rpc: "https://base.llamarpc.com",
    explorer: "https://basescan.org",
    currency: "ETH",
    venue: false,
    hue: "bg-border-strong",
  },
];

function getProvider():
  | { request: (args: object) => Promise<unknown> }
  | null {
  return (
    (window as unknown as {
      ethereum?: { request: (args: object) => Promise<unknown> };
    }).ethereum ?? null
  );
}

/**
 * First-class network switcher for the header: a pill that shows the current
 * chain, opening a keyboard-navigable menu of networks. Chains without a
 * Cadence deployment are marked; unknown chains show a switch prompt.
 */
export function NetworkSwitcher() {
  const wallet = useInjectedWallet();
  const [open, setOpen] = useState(false);
  const [busyChain, setBusyChain] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [cursor, setCursor] = useState(0);

  // restore the user's previously chosen network after a hard refresh:
  // wallets auto-reconnect to their default chain, so re-request the pick
  // once per session (never loops — only fires when stored ≠ current)
  useEffect(() => {
    if (wallet.chainId == null || !wallet.address) return;
    const stored = Number(window.localStorage.getItem(CHAIN_KEY) ?? 0);
    if (!stored || stored === wallet.chainId || autoSwitchTried) return;
    autoSwitchTried = true;
    const net = NETWORKS.find((n) => n.chainId === stored);
    if (net) void pick(net);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet.chainId, wallet.address]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        return;
      }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        setCursor((c) => (c + (e.key === "ArrowDown" ? 1 : NETWORKS.length - 1)) % NETWORKS.length);
      }
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        void pick(NETWORKS[cursor]);
      }
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, cursor]);

  const wrongChain =
    wallet.address !== null &&
    wallet.chainId !== null &&
    !NETWORKS.some((n) => n.chainId === wallet.chainId && n.venue);

  async function pick(net: NetworkOption) {
    if (wallet.chainId === net.chainId) {
      setOpen(false);
      return;
    }
    setBusyChain(net.chainId);
    setError(null);
    const provider = getProvider();
    if (!provider) {
      setError("No injected wallet found — install MetaMask or Rabby.");
      setBusyChain(null);
      return;
    }
    const hex = `0x${net.chainId.toString(16)}`;
    try {
      try {
        await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hex }] });
      } catch {
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
      }
      window.localStorage.setItem(CHAIN_KEY, String(net.chainId));
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message.slice(0, 140) : "switch rejected");
    } finally {
      setBusyChain(null);
    }
  }

  const label =
    wallet.chainId === null
      ? wallet.address ? "unknown network" : "not connected"
      : NETWORKS.find((n) => n.chainId === wallet.chainId)?.name ?? `chain ${wallet.chainId}`;

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => {
          const idx = NETWORKS.findIndex((n) => n.chainId === wallet.chainId);
          queueMicrotask(() => setCursor(idx >= 0 ? idx : 0));
          setOpen((v) => !v);
        }}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`Network: ${label}. Change network`}
        className="inline-flex h-10 items-center gap-2 rounded-md border border-border bg-surface px-3 transition-colors duration-100 hover:border-border-strong"
      >
        <span
          aria-hidden
          className={`size-1.5 rounded-full ${
            wallet.chainId === null ? "bg-border-strong" : NETWORKS.find((n) => n.chainId === wallet.chainId)?.venue ? "bg-success" : "bg-danger"
          }`}
        />
        <span className="max-w-24 truncate font-mono text-[11px] uppercase tracking-widest text-foreground">
          {wallet.address ? label : "network"}
        </span>
        <ChevronDown className="size-3.5 text-muted" aria-hidden />
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-12 z-50 w-72 overflow-hidden rounded-lg border border-border bg-surface shadow-2xl shadow-black/50"
        >
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted">
              network
            </p>
            <p className="font-mono text-[10px] tabular-nums text-muted">
              chain {wallet.chainId ?? "—"}
            </p>
          </div>

          {wrongChain ? (
            <div className="flex items-start gap-2 border-b border-danger/30 bg-danger/5 px-4 py-2.5">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-danger" aria-hidden />
              <p className="text-[11px] leading-5 text-danger">
                No Cadence venue on this chain — switch to a live network below.
              </p>
            </div>
          ) : null}

          <ul role="menu" className="p-1.5">
            {NETWORKS.map((net, i) => {
              const current = wallet.chainId === net.chainId;
              return (
                <li key={net.chainId}>
                  <button
                    type="button"
                    role="menuitem"
                    aria-current={current ? "true" : undefined}
                    onFocus={() => setCursor(i)}
                    onClick={() => void pick(net)}
                    className={`group flex h-12 w-full items-center justify-between gap-3 rounded-md px-3 transition-colors duration-100 ${
                      current
                        ? "bg-accent/10"
                        : cursor === i
                          ? "bg-surface-raised"
                          : "hover:bg-surface-raised"
                    }`}
                  >
                    <span className="flex min-w-0 items-center gap-2.5">
                      <span aria-hidden className={`size-2 rounded-full ${current ? net.hue : "bg-border-strong group-hover:bg-accent/60"}`} />
                      <span className={`truncate text-sm ${current ? "text-accent-strong" : "text-foreground"}`}>
                        {net.name}
                      </span>
                      {net.venue ? (
                        <span className="shrink-0 rounded border border-accent/50 px-1 font-mono text-[9px] uppercase tracking-widest text-accent-strong">
                          venue live
                        </span>
                      ) : null}
                    </span>
                    {current ? (
                      <Check className="size-4 shrink-0 text-success" aria-hidden />
                    ) : busyChain === net.chainId ? (
                      <span
                        aria-hidden
                        className="size-3.5 shrink-0 animate-spin rounded-full border border-accent border-t-transparent motion-reduce:animate-none"
                      />
                    ) : (
                      <Globe className="size-3.5 shrink-0 text-muted opacity-0 transition-opacity duration-100 group-hover:opacity-100" aria-hidden />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>

          {error ? (
            <p
              role="status"
              className="mx-1.5 mb-1.5 rounded-md border border-danger/50 bg-danger/5 px-3 py-2 text-[11px] leading-5 text-danger"
            >
              {error}
            </p>
          ) : null}
          <div className="border-t border-border bg-surface-raised/50 px-4 py-2">
            <p className="text-[10px] leading-5 text-muted">
              Arrow keys to move · Enter to switch · Esc to close
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
