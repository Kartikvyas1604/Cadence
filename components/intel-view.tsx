"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { IntelPanel } from "./intel-panel";
import { EthIcon } from "./eth-icon";
import { useCadence } from "@/lib/cadence/provider";
import { fmtPricePerEth } from "@/lib/cadence/format";

const FLOW = [
  {
    n: "01",
    title: "Pay on Hedera",
    body: "The client sends an x402 payment — $0.05 to the intel node. One quote, one payment, no subscription.",
  },
  {
    n: "02",
    title: "Node computes scarcity",
    body: "Active utilization and a toxicity proxy from observed rejects feed a suggested ask per 1 ETH of capacity.",
  },
  {
    n: "03",
    title: "Quote writes the ask",
    body: "The signed quote lands in the buy panel. The next cadence slot mints at the intel price, not the default.",
  },
] as const;

export function IntelView() {
  const s = useCadence();
  return (
    <main className="flex-1">
      <div className="mx-auto w-full max-w-7xl px-4 py-12 md:px-6 lg:px-8">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-accent">
          agentic payments
        </p>
        <h1 className="mt-2 max-w-3xl font-serif text-4xl leading-tight tracking-tight text-foreground md:text-5xl">
          The ask is written by someone you{" "}
          <em className="italic text-accent-strong">paid.</em>
        </h1>
        <p className="mt-4 max-w-prose text-sm leading-7 text-muted md:text-base md:leading-8">
          Capacity pricing shouldn&apos;t be a hardcoded constant. One paid
          Hedera x402 call returns a capacity/toxicity quote that sets the
          cadence-slot ask — real payment, real intel, visible in the UI.
        </p>

        <ol className="mt-10 grid gap-px overflow-hidden rounded-lg border border-border bg-border md:grid-cols-3">
          {FLOW.map((f) => (
            <li key={f.n} className="bg-surface p-6">
              <p className="font-mono text-xs text-accent">{f.n}</p>
              <p className="mt-3 font-serif text-xl text-foreground">
                {f.title}
              </p>
              <p className="mt-2 text-sm leading-6 text-muted">{f.body}</p>
            </li>
          ))}
        </ol>

        <div className="mt-10 grid gap-6 lg:grid-cols-3">
          <IntelPanel className="lg:col-span-1" />
          <section
            aria-label="Intel data model"
            className="rounded-lg border border-border bg-surface p-5 lg:col-span-2"
          >
            <h2 className="font-serif text-xl text-foreground">
              What comes back
            </h2>
            <dl className="mt-4 space-y-3 font-mono text-sm">
              {[
                ["suggestedAskPerEth", "ETH per 1 ETH of slot capacity"],
                ["asOf", "timestamp of the quote"],
                ["rationale", "utilization + toxicity, in words"],
                ["source", "hedera:x402 · blocky402 intel node"],
                ["costUsd", "what the call paid"],
              ].map(([field, note]) => (
                <div
                  key={field}
                  className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border/60 pb-3 last:border-b-0"
                >
                  <dt className="text-accent-strong">{field}</dt>
                  <dd className="text-xs text-muted">{note}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-5 border-t border-border pt-4 text-xs leading-5 text-muted">
              Current ask on this session:{" "}
              <span className="font-mono tabular-nums text-accent-strong">
                {s.slotPricePerEth !== null
                  ? `${fmtPricePerEth(s.slotPricePerEth)}`
                  : "— not written"}{" "}
                {s.slotPricePerEth !== null ? <EthIcon /> : null}
              </span>{" "}
              ·{" "}
              <Link
                href="/console"
                className="text-accent-strong transition-colors duration-100 hover:text-foreground"
              >
                buy at this ask in the console
              </Link>
            </p>
          </section>
        </div>

        <div className="mt-10 flex flex-wrap items-center justify-between gap-4 rounded-lg border border-accent/30 bg-accent/5 px-5 py-4">
          <p className="text-sm leading-6 text-muted">
            <span className="font-medium text-foreground">
              Judges: the paid call is one click.
            </span>{" "}
            Run the guided demo or pay for a quote directly.
          </p>
          <Link
            href="/console"
            className="inline-flex h-11 shrink-0 items-center gap-2 rounded-md bg-accent px-5 font-medium text-accent-foreground transition-colors duration-100 hover:bg-accent-strong active:translate-y-px"
          >
            Open console <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
      </div>
    </main>
  );
}
