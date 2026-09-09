"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Panel } from "@/components/panel";
import { EthIcon } from "@/components/eth-icon";
import { useCadence } from "@/lib/cadence/provider";
import { useModuleProbe } from "@/lib/cadence/use-module-probe";
import { routerRegistryAbi } from "@/lib/cadence/abis";
import { fmtEth, fmtPricePerEth } from "@/lib/cadence/format";

/**
 * Multi-pool router (Extended §2): pick a size/epoch intent, compare
 * registered Cadence pools on remaining capacity + slot cost, execute.
 * Never routes silently — every row shows its pool.
 */
export function RouterView() {
  const s = useCadence();
  const available = useModuleProbe(
    s.chain.chainId,
    (d) => d.router,
    routerRegistryAbi,
    "poolCount",
  );

  return (
    <main className="flex-1">
      <div className="mx-auto w-full max-w-7xl px-4 py-10 md:px-6 lg:px-8">
        <p className="mb-1 font-mono text-xs uppercase tracking-[0.2em] text-accent">
          multi-pool router
        </p>
        <h1 className="font-serif text-4xl tracking-tight text-foreground md:text-5xl">
          One intent. Every cadence pool competes for it.
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted md:text-base md:leading-7">
          The router quotes registered pools on remaining capacity and slot
          price, then routes your fill — and shows you the pool every time.
        </p>

        <div className="mt-8 grid gap-6 lg:grid-cols-3">
          <IntentPanel className="lg:col-span-1" available={available} />
          <QuoteTablePanel className="lg:col-span-2" available={available} />
          <RouterFactsPanel className="lg:col-span-1" />
          <ExecutePanel className="lg:col-span-2" available={available} />
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
        No Cadence deployment for this wallet&apos;s network. The registry is
        live on <span className="font-mono text-foreground">Sepolia</span> and{" "}
        <span className="font-mono text-foreground">Base Sepolia</span> —
        switch chains in your wallet to route across pools.
      </p>
    </div>
  );
}

function IntentPanel({
  className,
  available,
}: {
  className?: string;
  available: boolean | null;
}) {
  const [size, setSize] = useState("10");
  const [direction, setDirection] = useState<"sell" | "buy">("sell");

  return (
    <Panel
      id="router-intent"
      step="1 · intent"
      title="Your intent"
      caption="Size and direction — the router finds capacity for it."
      className={className}
    >
      <div className="flex flex-1 flex-col gap-4">
        <fieldset>
          <legend className="mb-2 font-mono text-xs uppercase tracking-widest text-muted">
            direction
          </legend>
          <div className="grid grid-cols-2 gap-2">
            {(["sell", "buy"] as const).map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={direction === v}
                onClick={() => setDirection(v)}
                className={`h-10 rounded-md border font-mono text-xs uppercase tracking-widest transition-colors duration-100 ${
                  direction === v
                    ? "border-accent/60 bg-accent/10 text-accent-strong"
                    : "border-border text-muted hover:border-border-strong"
                }`}
              >
                {v === "sell" ? "sell ETH" : "buy ETH"}
              </button>
            ))}
          </div>
        </fieldset>
        <div>
          <label
            htmlFor="router-size"
            className="mb-2 block font-mono text-xs uppercase tracking-widest text-muted"
          >
            size (ETH)
          </label>
          <div className="flex items-center gap-2 rounded-md border border-border-strong bg-surface-raised px-3 focus-within:border-accent">
            <input
              id="router-size"
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
        {available === true ? null : (
          <p className="text-xs leading-5 text-muted">
            Quotes light up when the registry lands on this chain.
          </p>
        )}
      </div>
    </Panel>
  );
}

function QuoteTablePanel({
  className,
  available,
}: {
  className?: string;
  available: boolean | null;
}) {
  return (
    <Panel
      id="router-quotes"
      step="2 · quotes"
      title="Route comparison"
      caption="Every registered pool, its remaining capacity and slot cost — sorted best first."
      className={className}
    >
      {available === true ? (
        <div className="flex-1 overflow-x-auto">
          <table className="w-full min-w-[480px] text-left font-mono text-sm">
            <thead>
              <tr className="border-b border-border text-[11px] uppercase tracking-widest text-muted">
                <th scope="col" className="py-2 pr-3 font-normal">pool</th>
                <th scope="col" className="py-2 pr-3 font-normal">pair</th>
                <th scope="col" className="py-2 pr-3 text-right font-normal">remaining</th>
                <th scope="col" className="py-2 pr-3 text-right font-normal">slot cost</th>
                <th scope="col" className="py-2 text-right font-normal">fill</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-border">
                <td colSpan={5} className="py-6 text-center text-xs uppercase tracking-widest text-muted">
                  no pools registered yet
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      ) : (
        <Unwired label={available === false ? "Router registry not deployed yet" : "checking chain…"} />
      )}
    </Panel>
  );
}

function ExecutePanel({
  className,
  available,
}: {
  className?: string;
  available: boolean | null;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <Panel
      id="router-execute"
      step="3 · execute"
      title="Execute a route"
      caption="Mints/buys the slot if needed, then routes the swap — one transaction."
      className={className}
    >
      {available === true ? (
        <div className="flex flex-1 flex-col items-start justify-center gap-3 py-4">
          <p className="font-mono text-xs uppercase tracking-widest text-muted">
            {selected ? `selected pool ${selected.slice(0, 10)}…` : "pick a pool from the table"}
          </p>
          <button
            type="button"
            disabled
            className="inline-flex h-11 min-w-32 items-center justify-center rounded-md bg-accent px-5 text-sm font-medium text-accent-foreground opacity-40"
          >
            execute route
          </button>
        </div>
      ) : (
        <Unwired label={available === false ? "Router registry not deployed yet" : "checking chain…"} />
      )}
    </Panel>
  );
}

function RouterFactsPanel({ className = "" }: { className?: string }) {
  const FACTS = [
    ["Registered pools only", "Deployers register pools; the router quotes those."],
    ["Capacity-aware", "Routes weigh remaining capacity, not just price."],
    ["Never silent", "The executed poolId is always shown to you."],
    ["Slots if needed", "The route mints/buys a cadence slot before the fill."],
  ] as const;
  return (
    <Panel id="router-facts" title="Routing rules" className={className}>
      <div className="grid flex-1 gap-5 sm:grid-cols-2">
        {FACTS.map(([t, b]) => (
          <div key={t}>
            <p className="font-mono text-[11px] uppercase tracking-widest text-accent">{t}</p>
            <p className="mt-1.5 text-sm leading-6 text-muted">{b}</p>
          </div>
        ))}
        <Link
          href="/console"
          className="mt-2 inline-flex items-center gap-1.5 font-mono text-xs text-accent-strong transition-colors duration-100 hover:text-foreground"
        >
          or route manually in the console <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      </div>
    </Panel>
  );
}
