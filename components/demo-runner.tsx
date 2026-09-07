"use client";

import { useCallback, useState } from "react";
import { Play, Square } from "lucide-react";
import { useCadenceActions } from "@/lib/cadence/provider";

const STEPS = [
  "Minting a 2 ETH cadence slot for this epoch…",
  "Swapping 2 ETH with the slot — expect a fill…",
  "Swapping again without a slot — expect a revert…",
  "Swapping oversize — expect a revert…",
  "Commit-mint 1.5 ETH private intent — only H lands public…",
  "Reveal (size, salt) at beforeSwap — expect a fill…",
  "Paying $0.05 on Hedera for the capacity ask…",
] as const;

export function DemoRunner() {
  const { buySlot, commitMint, attemptSwap, refreshIntel } = useCadenceActions();
  const [running, setRunning] = useState(false);
  const [step, setStep] = useState(-1);

  const run = useCallback(async () => {
    if (running) return;
    setRunning(true);
    setStep(0);
    const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
    try {
      await buySlot(2);
      await pause(1100);

      setStep(1);
      await attemptSwap(2);
      await pause(1100);

      setStep(2);
      await attemptSwap(2, { withoutSlot: true });
      await pause(1100);

      setStep(3);
      await attemptSwap(2);
      await pause(1100);

      setStep(4);
      await commitMint(1.5);
      await pause(1200);

      setStep(5);
      await attemptSwap(1.5);
      await pause(1100);

      setStep(6);
      await refreshIntel();
      await pause(900);
    } finally {
      setStep(-1);
      setRunning(false);
    }
  }, [running, buySlot, commitMint, attemptSwap, refreshIntel]);

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-accent/30 bg-accent/5 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="font-mono text-xs uppercase tracking-widest text-accent-strong">
          judge demo
        </p>
        <p
          className="mt-1 text-sm leading-6 text-muted"
          role="status"
          aria-live="polite"
        >
          {step >= 0 ? (
            <>
              <span className="text-foreground">
                Step {step + 1}/{STEPS.length}:
              </span>{" "}
              {STEPS[step]}
            </>
          ) : (
            "Plays the whole loop: buy slot → fill → reject without → reject oversize → commit-mint → reveal fill → paid intel."
          )}
        </p>
      </div>
      <button
        type="button"
        onClick={run}
        disabled={running}
        aria-busy={running}
        className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-md bg-accent px-5 font-medium text-accent-foreground transition-colors duration-100 hover:bg-accent-strong active:translate-y-px disabled:pointer-events-none disabled:opacity-60"
      >
        {running ? (
          <>
            <Square className="size-4" aria-hidden />
            Running…
          </>
        ) : (
          <>
            <Play className="size-4" aria-hidden />
            Run demo
          </>
        )}
      </button>
    </div>
  );
}
