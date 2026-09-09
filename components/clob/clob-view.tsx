"use client";

import { useState } from "react";
import { Panel } from "@/components/panel";
import { EthIcon } from "@/components/eth-icon";
import { useCadence } from "@/lib/cadence/provider";
import { useModuleProbe } from "@/lib/cadence/use-module-probe";
import { clobAbi } from "@/lib/cadence/abis";
import { fmtEth } from "@/lib/cadence/format";

/**
 * Secondary Cadence-slot CLOB (Extended §1): limit buy/sell of ERC-1155
 * epoch slots after primary mint. Order book for the current epoch,
 * place/cancel, my orders, fills. Slots are capacity tickets, not LP shares.
 */
export function ClobView() {
  const s = useCadence();
  const available = useModuleProbe(s.chain.chainId, (d) => d.clob ?? d.hook, clobAbi, "nextOrderId");

  return (
    <main className="flex-1">
      <div className="mx-auto w-full max-w-7xl px-4 py-10 md:px-6 lg:px-8">
        <p className="mb-1 font-mono text-xs uppercase tracking-[0.2em] text-accent">
          secondary market
        </p>
        <h1 className="font-serif text-4xl tracking-tight text-foreground md:text-5xl">
          Trade cadence slots — capacity tickets, not LP shares.
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted md:text-base md:leading-7">
          Post limit orders for the current epoch&apos;s ERC-1155 slots. Orders
          expire at epoch refresh — capacity is time-boxed, so the book resets
          with it.
        </p>

        <div className="mt-8 grid gap-6 lg:grid-cols-3">
          <OrderBookPanel className="lg:col-span-1" available={available} epochId={s.chain.epochId} />
          <PlaceOrderPanel className="lg:col-span-1" available={available} epochId={s.chain.epochId} />
          <MyOrdersPanel className="lg:col-span-1" available={available} />
          <FillsPanel className="lg:col-span-2" available={available} />
          <ClobFactsPanel className="lg:col-span-1" />
        </div>
      </div>
    </main>
  );
}

function Unwired({ label }: { label: string }) {
  return (
    <div className="flex flex-1 flex-col items-start justify-center gap-2 py-6">
      <p className="font-mono text-xs uppercase tracking-widest text-muted">{label}</p>
      <p className="max-w-sm text-sm leading-6 text-muted">
        The CLOB module (place / cancel / match with epoch-cancel) is not
        deployed on this chain yet. This panel activates when Clob.sol lands.
      </p>
    </div>
  );
}

const SIDES = [
  ["bid", "border-success/50 text-success"],
  ["ask", "border-danger/50 text-danger"],
] as const;

function OrderBookPanel({
  className,
  available,
  epochId,
}: {
  className?: string;
  available: boolean | null;
  epochId: number | null;
}) {
  return (
    <Panel
      id="clob-book"
      step="live"
      title="Order book"
      caption={`Current epoch — ${epochId != null ? `#${epochId}` : "—"}. Open orders only.`}
      className={className}
    >
      {available === true ? (
        <div className="flex flex-1 flex-col gap-3">
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-border bg-border">
            {SIDES.map(([side, cls]) => (
              <div key={side} className="bg-surface px-3 py-2">
                <p className={`font-mono text-[11px] uppercase ${cls}`}>{side}s</p>
                <p className="mt-1 font-mono text-sm tabular-nums text-muted">—</p>
              </div>
            ))}
          </div>
          <ul className="flex flex-1 flex-col justify-center gap-2 rounded-md border border-border bg-surface-raised p-4">
            <li className="text-center font-mono text-xs uppercase tracking-widest text-muted">
              no open orders this epoch
            </li>
          </ul>
        </div>
      ) : (
        <Unwired label={available === false ? "CLOB not deployed yet" : "checking chain…"} />
      )}
    </Panel>
  );
}

function PlaceOrderPanel({
  className,
  available,
  epochId,
}: {
  className?: string;
  available: boolean | null;
  epochId: number | null;
}) {
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [size, setSize] = useState("5");
  const [price, setPrice] = useState("0.001");
  const [pending, setPending] = useState(false);

  return (
    <Panel
      id="clob-place"
      step="1 · order"
      title="Place a limit order"
      caption="Buy side escrows quote. Sell side escrows slots. Expired with the epoch."
      className={className}
    >
      {available === true ? (
        <div className="flex flex-1 flex-col gap-4">
          <fieldset>
            <legend className="mb-2 font-mono text-xs uppercase tracking-widest text-muted">
              side
            </legend>
            <div className="grid grid-cols-2 gap-2">
              {(["buy", "sell"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={side === v}
                  onClick={() => setSide(v)}
                  className={`h-10 rounded-md border font-mono text-xs uppercase tracking-widest transition-colors duration-100 ${
                    side === v
                      ? v === "buy"
                        ? "border-success/60 bg-success/10 text-success"
                        : "border-danger/60 bg-danger/10 text-danger"
                      : "border-border text-muted hover:border-border-strong"
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
          </fieldset>

          <div>
            <label
              htmlFor="clob-size"
              className="mb-2 block font-mono text-xs uppercase tracking-widest text-muted"
            >
              size (capacity, ETH)
            </label>
            <div className="flex items-center gap-2 rounded-md border border-border-strong bg-surface-raised px-3 focus-within:border-accent">
              <input
                id="clob-size"
                type="number"
                inputMode="decimal"
                min="0"
                step="1"
                autoComplete="off"
                value={size}
                onChange={(e) => setSize(e.target.value)}
                className="h-11 w-full bg-transparent font-mono tabular-nums text-foreground outline-none"
              />
              <EthIcon className="inline size-3 shrink-0 text-muted" />
            </div>
          </div>

          <div>
            <label
              htmlFor="clob-price"
              className="mb-2 block font-mono text-xs uppercase tracking-widest text-muted"
            >
              limit price (ETH per ETH capacity)
            </label>
            <input
              id="clob-price"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.0001"
              autoComplete="off"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="h-11 w-full rounded-md border border-border-strong bg-surface-raised px-3 font-mono tabular-nums text-foreground outline-none focus:border-accent"
            />
          </div>

          <button
            type="button"
            disabled
            className="inline-flex h-11 min-w-28 items-center justify-center rounded-md bg-accent px-5 text-sm font-medium text-accent-foreground opacity-40"
          >
            place order
          </button>
          <p className="text-xs leading-5 text-muted">
            Orders for epoch{" "}
            <span className="font-mono tabular-nums">{epochId != null ? `#${epochId}` : "—"}</span>{" "}
            only — the book expires at refresh.
          </p>
        </div>
      ) : (
        <Unwired label={available === false ? "CLOB not deployed yet" : "checking chain…"} />
      )}
    </Panel>
  );
}

function MyOrdersPanel({
  className,
  available,
}: {
  className?: string;
  available: boolean | null;
}) {
  return (
    <Panel
      id="clob-mine"
      step="2 · mine"
      title="My orders"
      caption="Cancel anytime before fill; everything expires at epoch refresh."
      className={className}
    >
      {available === true ? (
        <p className="flex flex-1 items-center justify-center py-6 text-sm text-muted">
          No orders yet — place one to see it here.
        </p>
      ) : (
        <Unwired label={available === false ? "CLOB not deployed yet" : "checking chain…"} />
      )}
    </Panel>
  );
}

function FillsPanel({
  className,
  available,
}: {
  className?: string;
  available: boolean | null;
}) {
  return (
    <Panel
      id="clob-fills"
      step="live"
      title="Fills"
      caption="Matched trades settle ERC-1155 slots + quote escrow atomically."
      className={className}
    >
      {available === true ? (
        <p className="flex flex-1 items-center justify-center py-6 text-sm text-muted">
          No fills yet this epoch.
        </p>
      ) : (
        <Unwired label={available === false ? "CLOB not deployed yet" : "checking chain…"} />
      )}
    </Panel>
  );
}

function ClobFactsPanel({ className = "" }: { className?: string }) {
  const FACTS = [
    ["Expiring book", "Open orders die at epoch refresh — capacity has a clock."],
    ["Atomic settle", "Slots and quote escrow swap in one transaction."],
    ["Not equity", "A slot on the book is a capacity ticket, not an LP share."],
    ["Primary first", "Mint on /buy, then trade — the book wraps the primary market."],
  ] as const;
  return (
    <Panel id="clob-facts" title="How the CLOB works" className={className}>
      <div className="grid flex-1 gap-5 sm:grid-cols-2">
        {FACTS.map(([t, b]) => (
          <div key={t}>
            <p className="font-mono text-[11px] uppercase tracking-widest text-accent">{t}</p>
            <p className="mt-1.5 text-sm leading-6 text-muted">{b}</p>
          </div>
        ))}
      </div>
    </Panel>
  );
}
