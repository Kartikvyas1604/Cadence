"use client";

import { Activity } from "lucide-react";
import { Panel } from "./panel";
import { useApron } from "@/lib/apron/provider";
import { fmtBlock, fmtEth, fmtPricePerEth, timeAgo } from "@/lib/apron/format";
import type { GraphEventKind } from "@/lib/apron/types";

const KIND_STYLE: Record<GraphEventKind, { label: string; cls: string }> = {
  mint: { label: "mint", cls: "border-accent/50 text-accent-strong" },
  burn: { label: "burn", cls: "border-danger/50 text-danger" },
  consume: { label: "consume", cls: "border-success/50 text-success" },
};

export function GraphPanel() {
  const s = useApron();

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
    <Panel
      id="graph"
      step="4 · index"
      title="Graph panel"
      caption="Live Studio subgraph — apron slot mint / burn / consume, indexed per epoch."
      className="lg:col-span-2"
    >
      <dl className="mb-4 grid grid-cols-3 gap-px overflow-hidden rounded-md border border-border bg-border font-mono text-sm">
        {(
          [
            ["minted", totals.minted, "text-accent-strong"],
            ["consumed", totals.consumed, "text-success"],
            ["burned (expired)", totals.burned, "text-danger"],
          ] as const
        ).map(([label, value, cls]) => (
          <div key={label} className="bg-surface px-3 py-2.5">
            <dt className="text-[11px] uppercase tracking-widest text-muted">
              {label}
            </dt>
            <dd className={`mt-0.5 tabular-nums ${cls}`}>
              {fmtEth(value, 2)} Ξ
            </dd>
          </div>
        ))}
      </dl>

      {s.graph.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border-strong px-4 py-10 text-center">
          <Activity className="size-6 text-muted" aria-hidden />
          <p className="text-sm font-medium text-foreground">
            Nothing indexed yet
          </p>
          <p className="max-w-[30ch] text-xs leading-5 text-muted">
            Mint an apron slot and it appears here the moment the block lands.
          </p>
        </div>
      ) : (
        <ol
          className="max-h-96 flex-1 overflow-y-auto pr-1"
          aria-label="Subgraph events, newest first"
        >
          {s.graph.map((e) => (
            <li
              key={e.id}
              className="flex items-center justify-between gap-3 border-b border-border/60 py-2.5 last:border-b-0"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span
                  className={`w-16 shrink-0 rounded-full border px-1.5 py-0.5 text-center font-mono text-[11px] ${KIND_STYLE[e.kind].cls}`}
                >
                  {KIND_STYLE[e.kind].label}
                </span>
                <span className="min-w-0 truncate font-mono text-xs text-muted">
                  {e.trader} · blk {fmtBlock(e.blockNumber)}
                </span>
              </div>
              <div className="shrink-0 text-right font-mono text-xs tabular-nums">
                <span className="text-foreground">{fmtEth(e.size)} Ξ</span>
                <span className="ml-2 text-muted">{timeAgo(e.ts)}</span>
                {e.kind === "mint" && e.pricePaid ? (
                  <span className="ml-2 text-accent">
                    @ {fmtPricePerEth(e.pricePaid / e.size)} Ξ
                  </span>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}
