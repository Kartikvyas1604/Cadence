"use client";

import { Unplug } from "lucide-react";
import { useCadence } from "@/lib/cadence/provider";
import { fmtBlock, fmtEth, fmtPct, fmtPricePerEth, fmtUsdc } from "@/lib/cadence/format";
import { EthIcon } from "./eth-icon";

export function EpochBar() {
  const s = useCadence();
  const price = s.pool
    ? s.pool.activeReserveUsdc / s.pool.activeReserveEth
    : null;
  const totalEth = s.pool
    ? s.pool.activeReserveEth + s.pool.passiveReserveEth
    : null;
  const activeShare =
    totalEth !== null ? s.pool!.activeReserveEth / totalEth : null;
  const progress =
    s.pool && s.chain.blocksUntilEpochEnd !== null
      ? 1 - s.chain.blocksUntilEpochEnd / s.pool.epochLengthBlocks
      : null;

  return (
    <div className="rounded-lg border border-border bg-surface">
      <div className="flex flex-wrap items-center gap-x-8 gap-y-4 px-5 py-4">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-xs uppercase tracking-widest text-muted">
            epoch
          </span>
          <span className="font-mono text-xl font-medium tabular-nums text-accent-strong">
            {s.chain.epochId !== null ? `#${s.chain.epochId}` : "—"}
          </span>
        </div>

        <div className="flex items-baseline gap-2">
          <span className="font-mono text-xs uppercase tracking-widest text-muted">
            block
          </span>
          <span className="font-mono text-xl font-medium tabular-nums text-foreground">
            {s.chain.blockNumber !== null ? fmtBlock(s.chain.blockNumber) : "—"}
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
            {price !== null ? `$${fmtUsdc(price, 2)}` : "—"}
          </span>
        </div>

        <div className="flex items-baseline gap-2">
          <span className="font-mono text-xs uppercase tracking-widest text-muted">
            slot ask
          </span>
          <span className="font-mono text-xl font-medium tabular-nums text-accent-strong">
            {s.slotPricePerEth !== null ? (
              <>
                {fmtPricePerEth(s.slotPricePerEth)} <EthIcon /> / 1 <EthIcon />{" "}
                cap
              </>
            ) : (
              "not written"
            )}
          </span>
        </div>

        <p
          className="ml-auto font-mono text-sm tabular-nums text-muted"
          aria-live="off"
        >
          refresh in{" "}
          <span className="text-foreground">
            {s.chain.blocksUntilEpochEnd ?? "—"}
          </span>{" "}
          blocks
        </p>
      </div>

      {s.pool && totalEth !== null && activeShare !== null ? (
        <>
          {/* active / passive split — live pool reserves */}
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
          {progress !== null ? (
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
          ) : null}
        </>
      ) : (
        <div className="flex items-start gap-3 border-t border-border px-5 py-4">
          <Unplug className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
          <p className="text-xs leading-5 text-muted">
            Cadence pool not connected — reserves, the active/passive split,
            and the epoch progress appear once the hook contract is wired.
            Epoch and block are live from the chain.
          </p>
        </div>
      )}
    </div>
  );
}
