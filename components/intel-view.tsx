"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Lock } from "lucide-react";
import { IntelPanel } from "./intel-panel";
import { EthIcon } from "./eth-icon";
import { Panel } from "./panel";
import { useCadence, useCadenceActions } from "@/lib/cadence/provider";
import { useModuleProbe } from "@/lib/cadence/use-module-probe";
import { adminAbi } from "@/lib/cadence/abis";
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
  const [mode, setMode] = useState<"public" | "cre">("public");
  const priceWired = useModuleProbe(s.chain.chainId, (d) => d.slots, adminAbi, "slotPriceMin");
  return (
    <div className="flex-1">
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

        <div className="mt-10 grid gap-6 lg:grid-cols-3">
          <ConfidentialAskPanel
            className="lg:col-span-2"
            mode={mode}
            setMode={setMode}
          />
          <DynamicPricePanel className="lg:col-span-1" wired={priceWired} />
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
    </div>
  );
}

/** Extended §6 — CRE TEE confidential ask vs the public x402 model. */
function ConfidentialAskPanel({
  className = "",
  mode,
  setMode,
}: {
  className?: string;
  mode: "public" | "cre";
  setMode: (m: "public" | "cre") => void;
}) {
  return (
    <Panel
      id="intel-confidential"
      step="ask model"
      title="Who computes the ask"
      caption="Public x402 model by default. CRE runs the toxicity model inside a TEE — only the ask and an attestation come out."
      className={className}
    >
      <div className="flex flex-1 flex-col gap-4">
        <fieldset>
          <legend className="sr-only">Ask model</legend>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ["public", "Public x402 model"],
                ["cre", "Confidential ask (CRE)"],
              ] as const
            ).map(([v, label]) => (
              <button
                key={v}
                type="button"
                aria-pressed={mode === v}
                onClick={() => setMode(v)}
                className={`inline-flex h-10 min-w-28 items-center justify-center gap-1.5 rounded-md border font-mono text-xs uppercase tracking-widest transition-colors duration-100 ${
                  mode === v
                    ? "border-accent/60 bg-accent/10 text-accent-strong"
                    : "border-border text-muted hover:border-border-strong"
                }`}
              >
                {v === "cre" ? <Lock className="size-3.5" aria-hidden /> : null}
                {v}
              </button>
            ))}
          </div>
        </fieldset>

        {mode === "public" ? (
          <dl className="grid gap-3 font-mono text-sm sm:grid-cols-2">
            {(
              [
                ["model", "blocky402 intel node (public)"],
                ["inputs", "utilization · toxicity proxy"],
                ["output", "suggestedAsk + rationale"],
                ["payment", "x402 per call — no subscription"],
              ] as const
            ).map(([k, v]) => (
              <div key={k} className="rounded-md border border-border bg-surface-raised p-3">
                <dt className="text-[11px] uppercase tracking-widest text-muted">{k}</dt>
                <dd className="mt-1 text-xs leading-5 text-foreground">{v}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <dl className="grid gap-3 font-mono text-sm sm:grid-cols-2">
            {(
              [
                ["model", "Chainlink CRE confidential workflow (TEE)"],
                ["inputs", "stays private inside the workflow"],
                ["output", "ask + attestation only"],
                ["payment", "x402 still pays for the request"],
              ] as const
            ).map(([k, v]) => (
              <div key={k} className="rounded-md border border-border bg-surface-raised p-3">
                <dt className="text-[11px] uppercase tracking-widest text-muted">{k}</dt>
                <dd className="mt-1 text-xs leading-5 text-foreground">{v}</dd>
              </div>
            ))}
          </dl>
        )}

        <p className="text-xs leading-5 text-muted">
          {mode === "cre"
            ? "The toxicity model never leaves the TEE — Cadence sees the ask and a verifiable attestation, nothing else."
            : "The public model explains its quote. Switch to CRE when the toxicity inputs must stay private."}
        </p>
      </div>
    </Panel>
  );
}

/** Extended §4 — dynamic onchain slot price, bounded by intel. */
function DynamicPricePanel({
  className = "",
  wired,
}: {
  className?: string;
  wired: boolean | null;
}) {
  const s = useCadence();
  const { applyAsk } = useCadenceActions();
  const [pending, setPending] = useState(false);
  const suggested = s.intel?.suggestedAskPerEth ?? null;
  const onchain = s.slotPricePerEth;

  return (
    <Panel
      id="intel-price"
      step="apply ask"
      title="Onchain price"
      caption="Suggested ask → setSlotPriceFromIntel(ask, receiptHash) inside 50%–200% bounds."
      className={className}
    >
      <dl className="grid flex-1 content-start gap-4">
        <div>
          <dt className="font-mono text-[11px] uppercase tracking-widest text-muted">suggested ask</dt>
          <dd className="mt-1 font-mono text-2xl tabular-nums text-info">
            {suggested != null ? fmtPricePerEth(suggested) : "—"}{" "}
            <span className="text-sm text-muted"><EthIcon /> ETH</span>
          </dd>
        </div>
        <div>
          <dt className="font-mono text-[11px] uppercase tracking-widest text-muted">onchain ask</dt>
          <dd className="mt-1 font-mono text-2xl tabular-nums text-accent-strong">
            {onchain != null ? fmtPricePerEth(onchain) : "—"}{" "}
            <span className="text-sm text-muted"><EthIcon /> ETH</span>
          </dd>
        </div>
      </dl>
      <button
        type="button"
        disabled={!suggested || !s.wallet.address || pending}
        onClick={async () => {
          if (suggested == null) return;
          setPending(true);
          try {
            await applyAsk(suggested);
          } finally {
            setPending(false);
          }
        }}
        className="mt-4 inline-flex h-11 min-w-32 items-center justify-center rounded-md border border-border-strong bg-surface-raised px-5 text-sm font-medium text-foreground transition-colors duration-100 hover:bg-accent/10 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-40"
      >
        {pending ? "applying…" : "apply ask"}
      </button>
      <p className="mt-3 text-xs leading-5 text-muted">
        {wired === false
          ? "setSlotPriceFromIntel is not on this deployment yet — the ask stays at the deploy default until it lands."
          : !s.wallet.address
            ? "Connect the authorized keeper/deployer wallet to apply."
            : "Apply is keeper/authorized and bounded 50–200%. Intel never silently mutates pool config."}
      </p>
    </Panel>
  );
}
