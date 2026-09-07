"use client";

import { useState } from "react";
import { Ticket, TriangleAlert } from "lucide-react";
import { Panel } from "./panel";
import { useApron, useApronActions } from "@/lib/apron/provider";
import { fmtEth, fmtPricePerEth } from "@/lib/apron/format";

const PRESETS = [1, 2, 5];

export function BuyApronPanel() {
  const s = useApron();
  const { buySlot } = useApronActions();
  const [size, setSize] = useState<number>(2);
  const [pending, setPending] = useState(false);

  const ask = s.slotPricePerEth;
  const cost = size * ask;
  const insufficient = cost > s.wallet.eth;
  const slot = s.wallet.slot && s.wallet.slot.epochId === s.epochId ? s.wallet.slot : null;

  async function handleBuy() {
    if (pending || insufficient) return;
    setPending(true);
    try {
      await buySlot(size);
    } finally {
      setPending(false);
    }
  }

  return (
    <Panel
      id="buy"
      step="1 · buy"
      title="Buy an apron slot"
      caption="ERC-1155, current epoch only. Fixed primary price. Unused slots expire worthless."
      className="lg:col-span-1"
    >
      {slot ? (
        <div className="flex flex-1 flex-col">
          <div className="rounded-md border border-accent/40 bg-accent/5 p-4">
            <div className="flex items-center gap-2 text-accent-strong">
              <Ticket className="size-4" aria-hidden />
              <p className="font-mono text-xs uppercase tracking-widest">
                apron slot held
              </p>
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-y-2 font-mono text-sm">
              <dt className="text-muted">token id</dt>
              <dd className="tabular-nums text-foreground">#{slot.epochId}</dd>
              <dt className="text-muted">capacity</dt>
              <dd className="tabular-nums text-foreground">
                {fmtEth(slot.capacity, 2)} Ξ
              </dd>
              <dt className="text-muted">expires</dt>
              <dd className="tabular-nums text-foreground">
                end of epoch #{s.epochId} ({s.blocksUntilEpochEnd} blocks)
              </dd>
            </dl>
          </div>
          <p className="mt-3 text-xs leading-5 text-muted">
            Buying again replaces nothing — capacity stacks until the epoch
            refresh burns what you haven&apos;t consumed.
          </p>
          <div className="mt-5 border-t border-border pt-4" aria-hidden />
          <p className="mt-2 text-center font-mono text-xs uppercase tracking-widest text-muted">
            or buy more capacity below
          </p>
        </div>
      ) : (
        <div className="flex flex-1 flex-col justify-center rounded-md border border-dashed border-border-strong p-4 text-center">
          <Ticket className="mx-auto size-6 text-muted" aria-hidden />
          <p className="mt-2 text-sm font-medium text-foreground">
            No apron slot for epoch #{s.epochId}
          </p>
          <p className="mt-1 text-xs text-muted">
            Swaps will revert at beforeSwap until you mint one.
          </p>
        </div>
      )}

      <fieldset className="mt-6">
        <legend className="mb-2 font-mono text-xs uppercase tracking-widest text-muted">
          capacity (trade size you may fill)
        </legend>
        <div className="grid grid-cols-4 gap-2">
          {PRESETS.map((p) => (
            <button
              key={p}
              type="button"
              aria-pressed={size === p}
              onClick={() => setSize(p)}
              className={`h-11 rounded-md border font-mono text-sm tabular-nums transition-colors duration-100 ${
                size === p
                  ? "border-accent bg-accent/10 text-accent-strong"
                  : "border-border text-muted hover:border-border-strong hover:text-foreground"
              }`}
            >
              {p} Ξ
            </button>
          ))}
          <button
            type="button"
            aria-pressed={size === 10}
            onClick={() => setSize(10)}
            className={`h-11 rounded-md border font-mono text-sm tabular-nums transition-colors duration-100 ${
              size === 10
                ? "border-accent bg-accent/10 text-accent-strong"
                : "border-border text-muted hover:border-border-strong hover:text-foreground"
            }`}
          >
            10 Ξ
          </button>
        </div>
      </fieldset>

      <div className="mt-5 space-y-1.5 font-mono text-sm">
        <div className="flex items-baseline justify-between">
          <span className="text-muted">ask</span>
          <span className="tabular-nums text-foreground">
            {fmtPricePerEth(ask)} Ξ / 1 Ξ cap
          </span>
        </div>
        <div className="flex items-baseline justify-between">
          <span className="text-muted">total</span>
          <span className="text-lg font-medium tabular-nums text-accent-strong">
            {fmtEth(cost, 4)} Ξ
          </span>
        </div>
      </div>

      {insufficient ? (
        <p className="mt-4 flex items-start gap-1.5 text-xs leading-5 text-danger">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          Wallet holds {fmtEth(s.wallet.eth, 3)} Ξ — not enough for this slot.
          Pick smaller capacity.
        </p>
      ) : null}

      <button
        type="button"
        onClick={handleBuy}
        disabled={pending || insufficient}
        aria-busy={pending}
        className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-md bg-accent font-medium text-accent-foreground transition-colors duration-100 hover:bg-accent-strong active:translate-y-px disabled:pointer-events-none disabled:opacity-50"
      >
        {pending ? "Minting…" : `Mint apron slot · ${fmtEth(cost, 4)} Ξ`}
      </button>
      <p className="mt-3 text-center font-mono text-[11px] text-muted">
        balance {fmtEth(s.wallet.eth, 3)} Ξ · slot ≠ LP equity
      </p>
    </Panel>
  );
}
