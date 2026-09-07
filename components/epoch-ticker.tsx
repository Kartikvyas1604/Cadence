"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCadence } from "@/lib/cadence/provider";
import { fmtBlock, fmtEth, fmtPricePerEth, fmtUsdc } from "@/lib/cadence/format";
import { EthIcon } from "./eth-icon";

export function EpochTicker() {
  const s = useCadence();
  const pathname = usePathname();
  if (pathname === "/console") return null;

  const price = s.pool
    ? s.pool.activeReserveUsdc / s.pool.activeReserveEth
    : null;

  return (
    <div className="border-b border-border bg-surface/60">
      <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center gap-x-6 gap-y-1 px-4 py-2 font-mono text-xs md:px-6 lg:px-8">
        <span className="tabular-nums text-muted">
          epoch{" "}
          <span className="font-medium text-accent-strong">
            {s.chain.epochId !== null ? `#${s.chain.epochId}` : "—"}
          </span>
        </span>
        <span className="tabular-nums text-muted">
          blk{" "}
          <span className="text-foreground">
            {s.chain.blockNumber !== null ? fmtBlock(s.chain.blockNumber) : "—"}
            <span className="blink text-accent" aria-hidden>
              _
            </span>
          </span>
        </span>
        {price !== null ? (
          <span className="tabular-nums text-muted">
            active px{" "}
            <span className="text-foreground">${fmtUsdc(price, 2)}</span>
          </span>
        ) : null}
        {s.slotPricePerEth !== null ? (
          <span className="hidden tabular-nums text-muted sm:inline">
            slot ask{" "}
            <span className="text-accent-strong">
              {fmtPricePerEth(s.slotPricePerEth)} <EthIcon />
            </span>
          </span>
        ) : null}
        {s.pool ? (
          <span className="hidden tabular-nums text-muted md:inline">
            depth {fmtEth(s.pool.activeReserveEth, 1)} <EthIcon /> active ·{" "}
            {fmtEth(s.pool.passiveReserveEth, 0)} <EthIcon /> locked
          </span>
        ) : null}
        <Link
          href="/console"
          className="ml-auto text-accent-strong transition-colors duration-100 hover:text-foreground"
        >
          Open console →
        </Link>
      </div>
    </div>
  );
}
