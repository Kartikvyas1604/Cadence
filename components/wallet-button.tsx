"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Copy, LogOut, Wallet } from "lucide-react";
import {
  chainLabel,
  shortAddress,
  useInjectedWallet,
} from "@/lib/wallet/use-injected-wallet";

function getProvider() {
  return (window as unknown as { ethereum?: { request: (args: object) => Promise<unknown> } }).ethereum ?? null;
}

export function WalletButton() {
  const wallet = useInjectedWallet();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
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
