"use client";

import { useState } from "react";
import {
  CheckCircle2,
  RadioTower,
  RefreshCw,
  TriangleAlert,
} from "lucide-react";
import { Panel } from "./panel";
import { useApron, useApronActions } from "@/lib/apron/provider";
import { fmtPricePerEth, timeAgo } from "@/lib/apron/format";

export function IntelPanel({ className = "" }: { className?: string }) {
  const s = useApron();
  const { refreshIntel } = useApronActions();
  const [pending, setPending] = useState(false);

  async function handleFetch() {
    if (pending) return;
    setPending(true);
    try {
      await refreshIntel();
    } finally {
      setPending(false);
    }
  }

  return (
    <Panel
      className={className}
      id="intel"
      step="5 · intel"
      title="Pay for the ask"
      caption="Hedera x402 paid capacity/toxicity intel writes the apron-slot ask. One call, real payment."
    >
      <div className="flex flex-1 flex-col">
        <div className="rounded-md border border-border bg-surface-raised/50 p-4">
          <p className="font-mono text-[11px] uppercase tracking-widest text-muted">
            current ask
          </p>
          <p className="mt-1 font-mono text-2xl font-medium tabular-nums text-accent-strong">
            {fmtPricePerEth(s.slotPricePerEth)}{" "}
            <span className="text-sm text-muted">Ξ / 1 Ξ capacity</span>
          </p>
          <p className="mt-1 font-mono text-[11px] text-muted">
            {s.intel
              ? `written by intel · ${timeAgo(s.intel.asOf)}`
              : "primary default · no intel call yet"}
          </p>
        </div>

        {s.intel ? (
          <div
            role="status"
            className="enter mt-4 rounded-md border border-info/40 bg-info/5 p-4"
          >
            <div className="flex items-center gap-2 text-info">
              <CheckCircle2 className="size-4 shrink-0" aria-hidden />
              <p className="font-mono text-xs uppercase tracking-widest">
                x402 quote received
              </p>
            </div>
            <p className="mt-2 text-sm leading-6 text-foreground/90">
              {s.intel.rationale}
            </p>
            <dl className="mt-3 space-y-1 font-mono text-xs text-muted">
              <div className="flex justify-between gap-3">
                <dt>source</dt>
                <dd className="text-right text-foreground/85">
                  {s.intel.source}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>paid</dt>
                <dd className="tabular-nums text-foreground/85">
                  ${s.intel.costUsd.toFixed(2)} on Hedera
                </dd>
              </div>
            </dl>
          </div>
        ) : (
          <div className="mt-4 flex flex-1 flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border-strong px-4 py-8 text-center">
            <RadioTower className="size-6 text-muted" aria-hidden />
            <p className="text-sm font-medium text-foreground">
              No paid call yet
            </p>
            <p className="max-w-[30ch] text-xs leading-5 text-muted">
              Pay once to pull a capacity/toxicity quote and set the ask.
            </p>
          </div>
        )}

        {s.lastIntelError ? (
          <div
            role="alert"
            className="mt-4 flex items-start gap-2 rounded-md border border-danger/40 bg-danger/5 p-3 text-sm leading-6 text-danger"
          >
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>{s.lastIntelError}</span>
          </div>
        ) : null}

        <button
          type="button"
          onClick={handleFetch}
          disabled={pending}
          aria-busy={pending}
          className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-md border border-accent/50 bg-accent/10 font-medium text-accent-strong transition-colors duration-100 hover:bg-accent/20 active:translate-y-px disabled:pointer-events-none disabled:opacity-50"
        >
          <RefreshCw
            className={`size-4 ${pending ? "animate-spin motion-reduce:animate-none" : ""}`}
            aria-hidden
          />
          {pending
            ? "Paying $0.05 on Hedera…"
            : s.intel
              ? "Pay $0.05 · refresh quote"
              : "Pay $0.05 · fetch quote"}
        </button>
        <p className="mt-3 text-center font-mono text-[11px] text-muted">
          {s.intelCalls} paid call{s.intelCalls === 1 ? "" : "s"} this session ·
          ask written to buy panel
        </p>
      </div>
    </Panel>
  );
}
