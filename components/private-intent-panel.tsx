"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, Eye, Lock, TriangleAlert } from "lucide-react";
import { EthIcon } from "./eth-icon";
import { Panel } from "./panel";
import { useCadence, useCadenceActions } from "@/lib/cadence/provider";
import { commitHash, shortHash } from "@/lib/cadence/hash";
import { fmtEth, fmtPricePerEth, timeAgo } from "@/lib/cadence/format";
import type { CommitmentStatus } from "@/lib/cadence/types";

const PRESETS = [1, 1.5, 2, 5];

const STATUS_STYLE: Record<CommitmentStatus, { label: string; cls: string }> = {
  committed: { label: "committed", cls: "border-info/50 text-info" },
  revealed: { label: "revealed", cls: "border-success/50 text-success" },
  expired: { label: "expired", cls: "border-danger/50 text-danger" },
};

export function PrivateIntentPanel({ className = "" }: { className?: string }) {
  const s = useCadence();
  const { commitMint, attemptSwap, attemptBadReveal } = useCadenceActions();
  const [size, setSize] = useState<number>(1.5);
  const [pending, setPending] = useState<null | "commit" | "reveal" | "bad">(null);

  // deterministic preview only — the commit itself gets a fresh random salt
  // inside the provider, so nothing random is rendered during SSR/hydration
  const H = useMemo(
    () => commitHash(size, s.epochId, "preview"),
    [size, s.epochId],
  );

  const cost = size * s.slotPricePerEth;
  const insufficient = cost > s.wallet.eth;
  const liveCommitment =
    s.wallet.slot && s.wallet.slot.epochId === s.epochId && s.wallet.slot.commitmentId != null
      ? s.commitments.find((c) => c.id === s.wallet.slot!.commitmentId) ?? null
      : null;

  async function handleCommit() {
    if (pending || insufficient) return;
    setPending("commit");
    try {
      await commitMint(size);
    } finally {
      setPending(null);
    }
  }

  async function handleReveal() {
    if (pending || !liveCommitment) return;
    setPending("reveal");
    try {
      await attemptSwap(liveCommitment.size);
    } finally {
      setPending(null);
    }
  }

  async function handleBadReveal() {
    if (pending || !liveCommitment) return;
    setPending("bad");
    try {
      await attemptBadReveal(liveCommitment.size);
    } finally {
      setPending(null);
    }
  }

  return (
    <Panel
      className={className}
      id="intent"
      step="2b · private"
      title="Private cadence intent"
      caption="Commit H = hash(size, epoch, salt). Size lands public only at reveal-on-consume — not a dark AMM."
    >
      <div className="rounded-md border border-border bg-surface-raised/50 p-4">
        <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-muted">
          <Lock className="size-3.5 text-info" aria-hidden />
          commitment H — the only thing that lands public
        </div>
        <p className="mt-2 truncate font-mono text-xs tabular-nums text-info">
          {shortHash(H)}
        </p>
        <p className="mt-1 font-mono text-[11px] text-muted">
          salt · generated fresh at commit · revealed at consume
        </p>
      </div>

      <fieldset className="mt-5">
        <legend className="mb-2 font-mono text-xs uppercase tracking-widest text-muted">
          capacity (hidden until reveal)
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
                  ? "border-info bg-info/10 text-info"
                  : "border-border text-muted hover:border-border-strong hover:text-foreground"
              }`}
            >
              {p} <EthIcon />
            </button>
          ))}
        </div>
      </fieldset>

      <button
        type="button"
        onClick={handleCommit}
        disabled={pending !== null || insufficient}
        aria-busy={pending === "commit"}
        className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-md bg-info font-medium text-background transition-colors duration-100 hover:opacity-90 active:translate-y-px disabled:pointer-events-none disabled:opacity-50"
      >
        {pending === "commit" ? (
          "Committing…"
        ) : (
          <>
            <Eye className="size-4" aria-hidden />
            Commit-mint · only H goes onchain
          </>
        )}
      </button>
      <p className="mt-3 text-center font-mono text-[11px] text-muted">
        ask {fmtPricePerEth(s.slotPricePerEth)} <EthIcon /> / 1 <EthIcon /> cap ·
        total {fmtEth(cost, 4)} <EthIcon />
      </p>

      {liveCommitment ? (
        <div className="mt-5 rounded-md border border-info/40 bg-info/5 p-4">
          <p className="font-mono text-[11px] uppercase tracking-widest text-info">
            intent held · epoch #{s.epochId}
          </p>
          <div className="mt-3 grid grid-cols-2 gap-y-2 font-mono text-sm">
            <span className="text-muted">H</span>
            <span className="truncate tabular-nums text-foreground">
              {shortHash(liveCommitment.H)}
            </span>
            <span className="text-muted">size</span>
            <span className="tabular-nums text-info">hidden until reveal</span>
          </div>
          <div className="mt-4 flex flex-col gap-2">
            <button
              type="button"
              onClick={handleReveal}
              disabled={pending !== null}
              aria-busy={pending === "reveal"}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-accent font-medium text-accent-foreground transition-colors duration-100 hover:bg-accent-strong active:translate-y-px disabled:pointer-events-none disabled:opacity-50"
            >
              {pending === "reveal" ? (
                "Revealing…"
              ) : (
                <>
                  <CheckCircle2 className="size-4" aria-hidden />
                  Reveal &amp; swap at beforeSwap
                </>
              )}
            </button>
            <button
              type="button"
              onClick={handleBadReveal}
              disabled={pending !== null}
              aria-busy={pending === "bad"}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md border border-danger/50 font-medium text-danger transition-colors duration-100 hover:bg-danger/10 active:translate-y-px disabled:pointer-events-none disabled:opacity-50"
            >
              {pending === "bad" ? (
                "Attempting…"
              ) : (
                <>
                  <TriangleAlert className="size-4" aria-hidden />
                  Reveal with wrong salt (expect revert)
                </>
              )}
            </button>
          </div>
        </div>
      ) : null}

      <div className="mt-5 flex-1">
        <p className="mb-2 font-mono text-xs uppercase tracking-widest text-muted">
          commitments
        </p>
        {s.commitments.length === 0 ? (
          <div className="rounded-md border border-dashed border-border-strong px-4 py-6 text-center">
            <p className="text-xs leading-5 text-muted">
              No commitments yet. Commit-mint and only H appears in the Graph
              feed — size reveals at consume.
            </p>
          </div>
        ) : (
          <ol
            className="max-h-56 space-y-2 overflow-y-auto pr-1"
            aria-label="Cadence commitments, newest first"
          >
            {s.commitments.map((c) => (
              <li
                key={c.id}
                className="enter rounded-md border border-border bg-surface-raised/60 p-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`rounded-full border px-2 py-0.5 font-mono text-[11px] ${STATUS_STYLE[c.status].cls}`}
                  >
                    {STATUS_STYLE[c.status].label}
                  </span>
                  <span className="font-mono text-[11px] text-muted">
                    {timeAgo(c.ts)}
                  </span>
                </div>
                <p className="mt-2 truncate font-mono text-xs tabular-nums text-muted">
                  H {shortHash(c.H)} · epoch #{c.epochId}
                </p>
                <p className="mt-1 font-mono text-xs tabular-nums">
                  {c.status === "committed" ? (
                    <span className="text-info">size ••• hidden</span>
                  ) : (
                    <span className="text-foreground">
                      size {fmtEth(c.revealedSize ?? c.size)} <EthIcon />
                      {c.status === "expired" ? " (expired worthless)" : null}
                    </span>
                  )}
                </p>
              </li>
            ))}
          </ol>
        )}
      </div>
    </Panel>
  );
}
