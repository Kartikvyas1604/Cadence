"use client";

import { useState } from "react";
import { Ticket, TriangleAlert, Unplug } from "lucide-react";
import { EthIcon } from "./eth-icon";
import { Panel } from "./panel";
import { useCadence, useCadenceActions } from "@/lib/cadence/provider";
import { fmtEth, fmtPricePerEth } from "@/lib/cadence/format";

const PRESETS = [1, 2, 5];

export function BuyCadencePanel({ className = "" }: { className?: string }) {
  const s = useCadence();
  const { buySlot } = useCadenceActions();
  const [size, setSize] = useState<number>(2);
  const [pending, setPending] = useState(false);

  const ask = s.slotPricePerEth;
  const cost = ask !== null ? size * ask : null;
  const insufficient =
    cost !== null && s.wallet.eth !== null && cost > s.wallet.eth;
  const slot =
    s.wallet.slot && s.chain.epochId !== null && s.wallet.slot.epochId === s.chain.epochId
      ? s.wallet.slot
      : null;
  const connected = s.wallet.address !== null;
  const contractsReady = s.pool !== null;

  async function handleBuy() {
    if (pending || !connected || ask === null || !contractsReady || insufficient) return;
    setPending(true);
    try {
      await buySlot(size);
    } finally {
      setPending(false);
    }
  }

  const blocked =
    !connected
      ? "Connect your wallet to mint a cadence slot."
      : !contractsReady
        ? "Cadence slot contracts are not connected yet — minting activates once the hook is wired."
        : ask === null
          ? "No ask written yet — fetch paid intel to write the slot ask."
          : null;

  return (
    <Panel
      className={className}
      id="buy"
      step="1 · buy"
      title="Buy a cadence slot"
      caption="ERC-1155, current epoch only. Fixed primary price. Unused slots expire worthless."
    >
      {slot ? (
        <div className="flex flex-1 flex-col">
          <div className="enter rounded-md border border-accent/40 bg-accent/5 p-4">
            <div className="flex items-center gap-2 text-accent-strong">
              <Ticket className="size-4" aria-hidden />
              <p className="font-mono text-xs uppercase tracking-widest">
                cadence slot held
              </p>
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-y-2 font-mono text-sm">
              <dt className="text-muted">token id</dt>
              <dd className="tabular-nums text-foreground">#{slot.epochId}</dd>
              <dt className="text-muted">capacity</dt>
              <dd className="tabular-nums text-foreground">
                {fmtEth(slot.capacity, 2)} <EthIcon />
              </dd>
              <dt className="text-muted">expires</dt>
              <dd className="tabular-nums text-foreground">
                end of epoch #{s.chain.epochId} ({s.chain.blocksUntilEpochEnd}{" "}
                blocks)
              </dd>
            </dl>
            {slot.commitmentId != null ? (
              <p className="mt-3 font-mono text-[11px] leading-5 text-info">
                private intent — size reveals at beforeSwap, not before
              </p>
            ) : null}
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
            {s.chain.epochId !== null
              ? `No cadence slot for epoch #${s.chain.epochId}`
              : "No cadence slot"}
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
              {p} <EthIcon />
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
            10 <EthIcon />
          </button>
        </div>
      </fieldset>

      <div className="mt-5 space-y-1.5 font-mono text-sm">
        <div className="flex items-baseline justify-between">
          <span className="text-muted">ask</span>
          <span className="tabular-nums text-foreground">
            {ask !== null ? (
              <>
                {fmtPricePerEth(ask)} <EthIcon /> / 1 <EthIcon /> cap
              </>
            ) : (
              "—"
            )}
          </span>
        </div>
        <div className="flex items-baseline justify-between">
          <span className="text-muted">total</span>
          <span className="text-lg font-medium tabular-nums text-accent-strong">
            {cost !== null ? (
              <>
                {fmtEth(cost, 4)} <EthIcon />
              </>
            ) : (
              "—"
            )}
          </span>
        </div>
      </div>

      {insufficient ? (
        <p className="mt-4 flex items-start gap-1.5 text-xs leading-5 text-danger">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          Wallet holds {s.wallet.eth !== null ? `${fmtEth(s.wallet.eth, 4)} ` : ""}
          <EthIcon /> — not enough for this slot. Pick smaller capacity.
        </p>
      ) : null}

      {blocked ? (
        <p className="mt-4 flex items-start gap-1.5 text-xs leading-5 text-muted">
          <Unplug className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {blocked}
        </p>
      ) : null}

      <button
        type="button"
        onClick={handleBuy}
        disabled={pending || blocked !== null || insufficient}
        aria-busy={pending}
        className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-md bg-accent font-medium text-accent-foreground transition-colors duration-100 hover:bg-accent-strong active:translate-y-px disabled:pointer-events-none disabled:opacity-50"
      >
        {pending ? (
          "Minting…"
        ) : cost !== null ? (
          <>Mint cadence slot · {fmtEth(cost, 4)} <EthIcon /></>
        ) : (
          "Mint cadence slot"
        )}
      </button>
      <p className="mt-3 text-center font-mono text-[11px] text-muted">
        balance{" "}
        {s.wallet.eth !== null ? (
          <>
            {fmtEth(s.wallet.eth, 4)} <EthIcon />
          </>
        ) : (
          "—"
        )}{" "}
        · slot ≠ LP equity
      </p>
    </Panel>
  );
}
