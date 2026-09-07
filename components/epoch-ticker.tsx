"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useApron } from "@/lib/apron/provider";
import { fmtBlock, fmtEth, fmtPricePerEth, fmtUsdc } from "@/lib/apron/format";
import { activePriceUsd } from "@/lib/apron/types";

export function EpochTicker() {
  const s = useApron();
  const pathname = usePathname();
  if (pathname === "/console") return null;

  return (
    <div className="border-b border-border bg-surface/60">
      <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center gap-x-6 gap-y-1 px-4 py-2 font-mono text-xs md:px-6 lg:px-8">
        <span className="tabular-nums text-muted">
          epoch{" "}
          <span className="font-medium text-accent-strong">#{s.epochId}</span>
        </span>
        <span className="tabular-nums text-muted">
          blk{" "}
          <span className="text-foreground">
            {fmtBlock(s.blockNumber)}
            <span className="blink text-accent" aria-hidden>
              _
            </span>
          </span>
        </span>
        <span className="tabular-nums text-muted">
          active px{" "}
          <span className="text-foreground">
            ${fmtUsdc(activePriceUsd(s.pool), 2)}
          </span>
        </span>
        <span className="hidden tabular-nums text-muted sm:inline">
          slot ask{" "}
          <span className="text-accent-strong">
            {fmtPricePerEth(s.slotPricePerEth)} Ξ
          </span>
        </span>
        <span className="hidden tabular-nums text-muted md:inline">
          depth {fmtEth(s.pool.activeReserveEth, 1)} Ξ active ·{" "}
          {fmtEth(s.pool.passiveReserveEth, 0)} Ξ locked
        </span>
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
