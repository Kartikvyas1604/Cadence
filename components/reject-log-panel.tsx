"use client";

import { ShieldBan } from "lucide-react";
import { Panel } from "./panel";
import { useApron } from "@/lib/apron/provider";
import { fmtBlock, fmtEth, timeAgo } from "@/lib/apron/format";
import { REJECT_REASONS } from "@/lib/apron/types";
import type { RejectReason } from "@/lib/apron/types";

const REASON_STYLE: Record<RejectReason, string> = {
  "no-slot": "border-danger/50 text-danger",
  oversize: "border-danger/50 text-danger",
  "same-block-passive-unlock": "border-info/50 text-info",
};

export function RejectLogPanel() {
  const s = useApron();

  return (
    <Panel
      id="rejects"
      step="3 · reject"
      title="Reject log"
      caption="Every revert at beforeSwap, on-chain and public. This is the product."
      className="lg:col-span-1"
    >
      <ul className="mb-4 space-y-1.5 font-mono text-[11px] leading-5 text-muted">
        {(Object.keys(REJECT_REASONS) as RejectReason[]).map((code) => (
          <li key={code} className="flex items-start gap-2">
            <span
              aria-hidden
              className="mt-1.5 size-1 shrink-0 rounded-full bg-border-strong"
            />
            <span>
              <span className="text-foreground/85">{REJECT_REASONS[code].title}</span>{" "}
              — {code}
            </span>
          </li>
        ))}
      </ul>

      {s.rejects.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border-strong px-4 py-10 text-center">
          <ShieldBan className="size-6 text-muted" aria-hidden />
          <p className="text-sm font-medium text-foreground">No rejects yet</p>
          <p className="max-w-[26ch] text-xs leading-5 text-muted">
            Attempt a swap without a slot — the hook will refuse it here.
          </p>
        </div>
      ) : (
        <ol
          className="max-h-80 flex-1 space-y-2 overflow-y-auto pr-1"
          aria-label="Rejected swaps, newest first"
        >
          {s.rejects.map((r) => (
            <li
              key={r.id}
              className="rounded-md border border-border bg-surface-raised/60 p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <span
                  className={`rounded-full border px-2 py-0.5 font-mono text-[11px] ${REASON_STYLE[r.reason]}`}
                >
                  {r.reason}
                </span>
                <span className="font-mono text-[11px] text-muted">
                  {timeAgo(r.ts)}
                </span>
              </div>
              <p className="mt-2 font-mono text-xs leading-5 text-muted">
                blk {fmtBlock(r.blockNumber)} · epoch #{r.epochId} · size{" "}
                <span className="tabular-nums text-foreground">
                  {fmtEth(r.tradeSize)} Ξ
                </span>
              </p>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}
