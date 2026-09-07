"use client";

import { useMemo, useState } from "react";
import { ArrowRight, CheckCircle2, Unplug, XCircle } from "lucide-react";
import { EthIcon } from "./eth-icon";
import { Panel } from "./panel";
import { useCadence, useCadenceActions } from "@/lib/cadence/provider";
import { quoteSwapOutUsdc } from "@/lib/cadence/machine";
import { fmtEth, fmtUsdc } from "@/lib/cadence/format";
import type { RejectReason } from "@/lib/cadence/types";

const DEMO_TOGGLES = [
  { key: "withoutSlot", label: "without slot", hint: "no cadence slot held" },
  { key: "oversize", label: "oversize", hint: "size > slot capacity" },
  { key: "reachPassive", label: "reach passive", hint: "same-block split" },
] as const;

type ToggleKey = (typeof DEMO_TOGGLES)[number]["key"];

export function SwapPanel({ className = "" }: { className?: string }) {
  const s = useCadence();
  const { attemptSwap } = useCadenceActions();
  const [size, setSize] = useState("2");
  const [toggles, setToggles] = useState<Record<ToggleKey, boolean>>({
    withoutSlot: false,
    oversize: false,
    reachPassive: false,
  });
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<
    | { kind: "filled"; outUsdc: number; sizeEth: number }
    | { kind: "rejected"; reason: RejectReason }
    | null
  >(null);

  const pool = s.pool;
  const sizeNum = useMemo(() => Number.parseFloat(size) || 0, [size]);
  const slot =
    s.wallet.slot && s.chain.epochId !== null && s.wallet.slot.epochId === s.chain.epochId
      ? s.wallet.slot
      : null;
  const outUsdc = pool ? quoteSwapOutUsdc(pool, sizeNum) : null;
  const impact =
    pool && outUsdc !== null && sizeNum > 0
      ? Math.abs(outUsdc / pool.activeReserveUsdc)
      : null;
  const spot = pool ? pool.activeReserveUsdc / pool.activeReserveEth : null;
  const execPrice =
    pool && outUsdc !== null && sizeNum > 0 ? outUsdc / sizeNum : null;

  const hasSlot = !!slot;
  const enoughCapacity = !!slot && sizeNum <= slot.capacity;
  const enoughDepth = !!pool && sizeNum <= pool.activeReserveEth * 0.95;
  const toggledAny =
    toggles.withoutSlot || toggles.oversize || toggles.reachPassive;

  const rejectionPreview = !hasSlot
    ? "no-slot"
    : !enoughCapacity
      ? "oversize"
      : !enoughDepth
        ? "same-block-passive-unlock"
        : null;
  const willFill =
    pool !== null && !toggledAny && !rejectionPreview && sizeNum > 0;

  async function handleSwap() {
    if (pending || !pool || sizeNum <= 0) return;
    setPending(true);
    setResult(null);
    try {
      const outcome = await attemptSwap(sizeNum, {
        withoutSlot: toggles.withoutSlot,
        oversize: toggles.oversize,
        reachPassive: toggles.reachPassive,
      });
      if (outcome === "filled") {
        const out = quoteSwapOutUsdc(pool, sizeNum);
        setResult({ kind: "filled", outUsdc: out, sizeEth: sizeNum });
      } else {
        setResult({ kind: "rejected", reason: outcome });
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <Panel
      className={className}
      id="swap"
      step="2 · swap"
      title="Swap against active depth"
      caption="beforeSwap checks slot ≥ size, burns the notional, fills against active reserves only."
    >
      {pool ? (
        <div className="flex flex-1 flex-col gap-4">
          <div>
            <label
              htmlFor="swap-size"
              className="mb-2 block font-mono text-xs uppercase tracking-widest text-muted"
            >
              size (ETH in)
            </label>
            <div className="relative">
              <input
                id="swap-size"
                type="number"
                inputMode="decimal"
                min={0}
                step={0.5}
                autoComplete="off"
                value={size}
                onChange={(e) => {
                  setSize(e.target.value);
                  setResult(null);
                }}
                className="h-12 w-full rounded-md border border-border-strong bg-surface-raised px-4 pr-12 font-mono text-lg tabular-nums text-foreground transition-colors duration-100 placeholder:text-muted/60 hover:border-muted focus-visible:border-accent"
                placeholder="0.0"
              />
              <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 font-mono text-sm text-muted">
                <EthIcon />
              </span>
            </div>
          </div>

          <dl className="space-y-1.5 rounded-md border border-border bg-surface-raised/50 p-4 font-mono text-sm">
            <div className="flex items-baseline justify-between">
              <dt className="text-muted">you receive</dt>
              <dd className="text-lg font-medium tabular-nums text-foreground">
                {outUsdc !== null && sizeNum > 0
                  ? `${fmtUsdc(outUsdc)} USDC`
                  : "—"}
              </dd>
            </div>
            <div className="flex items-baseline justify-between">
              <dt className="text-muted">exec price</dt>
              <dd className="tabular-nums text-foreground">
                {execPrice !== null
                  ? `$${fmtUsdc(execPrice, 2)}`
                  : "—"}{" "}
                <span className="text-muted">
                  / spot {spot !== null ? `$${fmtUsdc(spot, 2)}` : "—"}
                </span>
              </dd>
            </div>
            <div className="flex items-baseline justify-between">
              <dt className="text-muted">price impact</dt>
              <dd className="tabular-nums text-foreground">
                {impact !== null && sizeNum > 0
                  ? `${(impact * 100).toFixed(2)}%`
                  : "—"}
              </dd>
            </div>
            <div className="flex items-baseline justify-between border-t border-border pt-1.5">
              <dt className="text-muted">slot capacity</dt>
              <dd className="tabular-nums text-foreground">
                {slot ? (
                  <>
                    {fmtEth(slot.capacity, 2)} <EthIcon />
                  </>
                ) : (
                  "none held"
                )}
              </dd>
            </div>
          </dl>

          <fieldset>
            <legend className="mb-2 font-mono text-xs uppercase tracking-widest text-muted">
              demo the reject paths
            </legend>
            <div className="flex flex-wrap gap-2">
              {DEMO_TOGGLES.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  aria-pressed={toggles[t.key]}
                  onClick={() =>
                    setToggles((prev) => ({ ...prev, [t.key]: !prev[t.key] }))
                  }
                  className={`inline-flex h-10 items-center gap-2 rounded-full border px-3.5 text-sm transition-colors duration-100 ${
                    toggles[t.key]
                      ? "border-danger/60 bg-danger/10 text-danger"
                      : "border-border text-muted hover:border-border-strong hover:text-foreground"
                  }`}
                >
                  <span
                    aria-hidden
                    className={`size-1.5 rounded-full ${toggles[t.key] ? "bg-danger" : "bg-border-strong"}`}
                  />
                  {t.label}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs leading-5 text-muted">
              {toggledAny
                ? "This attempt will revert at beforeSwap — exactly what a judge needs to see."
                : rejectionPreview
                  ? "Current size would revert on-chain — shrink it, or use a toggle to demo the revert on purpose."
                  : "Leave all off to attempt a legitimate fill."}
            </p>
          </fieldset>

          {result ? (
            <div
              role="status"
              className={`enter rounded-md border p-4 ${
                result.kind === "filled"
                  ? "border-success/40 bg-success/5"
                  : "border-danger/40 bg-danger/5"
              }`}
            >
              {result.kind === "filled" ? (
                <div className="flex items-start gap-2.5">
                  <CheckCircle2
                    className="mt-0.5 size-4 shrink-0 text-success"
                    aria-hidden
                  />
                  <div className="text-sm leading-6">
                    <p className="font-medium text-success">Filled</p>
                    <p className="font-mono text-xs tabular-nums text-muted">
                      swapped {fmtEth(result.sizeEth)} <EthIcon /> →{" "}
                      {fmtUsdc(result.outUsdc)} USDC · slot notional burned ·
                      epoch #{s.chain.epochId}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-2.5">
                  <XCircle
                    className="mt-0.5 size-4 shrink-0 text-danger"
                    aria-hidden
                  />
                  <div className="text-sm leading-6">
                    <p className="font-medium text-danger">
                      Reverted at beforeSwap
                    </p>
                    <p className="font-mono text-xs text-muted">
                      {result.reason}
                    </p>
                  </div>
                </div>
              )}
            </div>
          ) : null}

          <button
            type="button"
            onClick={handleSwap}
            disabled={pending || sizeNum <= 0}
            aria-busy={pending}
            className={`mt-auto inline-flex h-12 w-full items-center justify-center gap-2 rounded-md font-medium transition-colors duration-100 active:translate-y-px disabled:pointer-events-none disabled:opacity-50 ${
              willFill
                ? "bg-accent text-accent-foreground hover:bg-accent-strong"
                : "border border-border-strong bg-transparent text-foreground hover:bg-surface-raised"
            }`}
          >
            {pending ? (
              "Swapping…"
            ) : willFill ? (
              <>
                Swap {sizeNum > 0 ? fmtEth(sizeNum) : ""} <EthIcon />
                <ArrowRight className="size-4" aria-hidden />
              </>
            ) : (
              "Attempt swap (expect revert)"
            )}
          </button>
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border-strong px-4 py-12 text-center">
          <Unplug className="size-6 text-muted" aria-hidden />
          <p className="text-sm font-medium text-foreground">
            Cadence pool not connected
          </p>
          <p className="max-w-[36ch] text-xs leading-5 text-muted">
            The beforeSwap gate, active-only fills, and reject paths activate
            once the cadence hook contract is wired to this console.
          </p>
        </div>
      )}
    </Panel>
  );
}
