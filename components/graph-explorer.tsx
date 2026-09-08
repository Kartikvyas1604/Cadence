"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { GraphPanel } from "./graph-panel";
import { LvrPanel } from "./lvr-panel";
import { EthIcon } from "./eth-icon";
import { useCadence } from "@/lib/cadence/provider";
import { fmtEth } from "@/lib/cadence/format";

const ENTITIES = [
  ["CadenceMint", "buyer, epochId, size, pricePaid, ts"],
  ["CadenceConsume", "trader, epochId, sizeBurned, swapTx, ts"],
  ["CadenceBurn", "epochId, size (expired un-consumed capacity)"],
] as const;

export function GraphExplorer() {
  const s = useCadence();
  const totals = s.graph.reduce(
    (acc, e) => {
      if (e.kind === "mint") acc.minted += e.size;
      if (e.kind === "consume") acc.consumed += e.size;
      if (e.kind === "burn") acc.burned += e.size;
      return acc;
    },
    { minted: 0, consumed: 0, burned: 0 },
  );

  return (
    <main className="flex-1">
      <div className="mx-auto w-full max-w-7xl px-4 py-12 md:px-6 lg:px-8">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-accent">
          the index
        </p>
        <h1 className="mt-2 max-w-3xl font-serif text-4xl leading-tight tracking-tight text-foreground md:text-5xl">
          Every slot, minted and spent — on the record.
        </h1>
        <p className="mt-4 max-w-prose text-sm leading-7 text-muted md:text-base md:leading-8">
          The Graph Studio subgraph indexes the three events that make the
          capacity economy legible. This panel mirrors it live. If a mint,
          burn, or consume happened, it is here — no mocks.
        </p>

        <dl className="mt-8 grid gap-px overflow-hidden rounded-lg border border-border bg-border font-mono sm:grid-cols-3">
          {(
            [
              ["minted notional", totals.minted, "text-accent-strong"],
              ["consumed notional", totals.consumed, "text-success"],
              ["burned at expiry", totals.burned, "text-danger"],
            ] as const
          ).map(([label, value, cls]) => (
            <div key={label} className="bg-surface px-5 py-4">
              <dt className="text-[11px] uppercase tracking-widest text-muted">
                {label}
              </dt>
              <dd className={`mt-1 text-2xl tabular-nums ${cls}`}>
                {fmtEth(value, 2)} <EthIcon />
              </dd>
            </div>
          ))}
        </dl>

        <div className="mt-8 grid gap-6 lg:grid-cols-3">
          <GraphPanel className="lg:col-span-2" />
          <LvrPanel className="lg:col-span-1" />
          <section
            aria-label="Subgraph entities"
            className="rounded-lg border border-border bg-surface p-5 lg:col-span-2"
          >
            <h2 className="font-serif text-xl text-foreground">Entities</h2>
            <dl className="mt-4 space-y-4">
              {ENTITIES.map(([name, fields]) => (
                <div key={name}>
                  <dt className="font-mono text-sm text-accent-strong">
                    {name}
                  </dt>
                  <dd className="mt-1 break-words font-mono text-[11px] leading-5 text-muted">
                    {fields}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="mt-6 border-t border-border pt-4 text-xs leading-5 text-muted">
              Consumes feed the LVR / markout proxy: consumed notional vs price
              drift per epoch.
            </p>
            <Link
              href="/console"
              className="mt-4 inline-flex items-center gap-1.5 font-mono text-xs text-accent-strong transition-colors duration-100 hover:text-foreground"
            >
              generate events in the console{" "}
              <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          </section>
        </div>
      </div>
    </main>
  );
}
