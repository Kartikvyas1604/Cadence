"use client";

import { useCadence } from "@/lib/cadence/provider";
import { fmtBlock, fmtEth, fmtPct, fmtPricePerEth, fmtUsdc } from "@/lib/cadence/format";
import { activePriceUsd } from "@/lib/cadence/types";
import { EthIcon } from "./eth-icon";

export function EpochBar() {
  const s = useCadence();
  const price = activePriceUsd(s.pool);
  const totalEth = s.pool.activeReserveEth + s.pool.passiveReserveEth;
  const activeShare = s.pool.activeReserveEth / totalEth;
  const progress =
    1 - s.blocksUntilEpochEnd / s.pool.epochLengthBlocks;

  return (
    <div className="rounded-lg border border-border bg-surface">
      <div className="flex flex-wrap items-center gap-x-8 gap-y-4 px-5 py-4">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-xs uppercase tracking-widest text-muted">
            epoch
          </span>
          <span className="font-mono text-xl font-medium tabular-nums text-accent-strong">
            #{s.epochId}
          </span>
        </div>

        <div className="flex items-baseline gap-2">
          <span className="font-mono text-xs uppercase tracking-widest text-muted">
            block
          </span>
          <span className="font-mono text-xl font-medium tabular-nums text-foreground">
            {fmtBlock(s.blockNumber)}
            <span className="blink text-accent" aria-hidden>
              _
            </span>
          </span>
        </div>

        <div className="flex items-baseline gap-2">
          <span className="font-mono text-xs uppercase tracking-widest text-muted">
            active px
          </span>
          <span className="font-mono text-xl font-medium tabular-nums text-foreground">
            ${fmtUsdc(price, 2)}
          </span>
        </div>

        <div className="flex items-baseline gap-2">
          <span className="font-mono text-xs uppercase tracking-widest text-muted">
            slot ask
          </span>
          <span className="font-mono text-xl font-medium tabular-nums text-accent-strong">
            {fmtPricePerEth(s.slotPricePerEth)} <EthIcon /> / 1 <EthIcon /> cap
          </span>
        </div>

        <p
          className="ml-auto font-mono text-sm tabular-nums text-muted"
          aria-live="off"
        >
          refresh in{" "}
          <span className="text-foreground">
            {s.blocksUntilEpochEnd}
          </span>{" "}
          blocks
        </p>
      </div>

      {/* active / passive split */}
      <div className="px-5 pb-2">
        <div
          className="flex h-2 w-full overflow-hidden rounded-full bg-surface-raised"
          role="img"
          aria-label={`Active reserves ${fmtPct(activeShare, 0)}, passive reserves ${fmtPct(1 - activeShare, 0)}`}
        >
          <div
            className="h-full bg-accent transition-[width] duration-300 ease-out"
            style={{ width: `${activeShare * 100}%` }}
          />
        </div>
        <div className="mt-2 flex justify-between font-mono text-xs text-muted">
          <span>
            active{" "}
            <span className="tabular-nums text-accent-strong">
              {fmtEth(s.pool.activeReserveEth, 1)} <EthIcon />
            </span>{" "}
            · tradable this epoch
          </span>
          <span>
            passive{" "}
            <span className="tabular-nums text-foreground">
              {fmtEth(s.pool.passiveReserveEth, 1)} <EthIcon />
            </span>{" "}
            · locked until refresh
          </span>
        </div>
      </div>

      {/* epoch progress */}
      <div className="px-5 pb-4">
        <div
          className="h-0.5 w-full bg-border"
          role="progressbar"
          aria-label="Epoch progress"
          aria-valuenow={Math.round(progress * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="h-full bg-muted transition-[width] duration-300 ease-out"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}
