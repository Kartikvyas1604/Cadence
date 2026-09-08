"use client";

import { useEffect, useState } from "react";
import { Panel } from "@/components/panel";
import { EthIcon } from "@/components/eth-icon";
import { useCadence } from "@/lib/cadence/provider";
import { fmtEth } from "@/lib/cadence/format";

/**
 * LVR / markout panel (Extended §3). Charts per-epoch markout proxy and
 * capacity sold vs budget. Markout samples come from /api/lvr (Graph-composed
 * proxy, documented as HYPOTHESIS quality); capacity numbers are real reads.
 */
export function LvrPanel({ className = "" }: { className?: string }) {
  const s = useCadence();
  const [markout, setMarkout] = useState<{ epochs: number[]; bps: number[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/lvr", { cache: "no-store" });
        if (!res.ok) {
          if (alive) setError(res.status === 404 ? "not-wired" : `upstream ${res.status}`);
          return;
        }
        const body = (await res.json()) as { epochs?: number[]; markoutBps?: number[] };
        if (!alive) return;
        setMarkout({ epochs: body.epochs ?? [], bps: body.markoutBps ?? [] });
        setError(null);
      } catch {
        if (alive) setError("unreachable");
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const budget = s.lp.budgetEth;
  const sold = s.lp.soldCapacityEth;
  const soldPct = budget != null && budget > 0 && sold != null ? Math.min(1, sold / budget) : null;

  return (
    <Panel
      id="lvr"
      step="proxy"
      title="LVR / markout tracking"
      caption="Estimated markout vs an unprotected CFMM — a proxy from Graph DEX compose + Cadence consume events. FACT: bounded depth cuts LVR; HYPOTHESIS: the exact bps."
      className={className}
    >
      <div className="grid flex-1 gap-5 md:grid-cols-2">
        {/* capacity sold vs budget — real contract reads */}
        <div className="rounded-md border border-border bg-surface-raised p-4">
          <p className="font-mono text-[11px] uppercase tracking-widest text-accent">
            capacity sold vs budget
          </p>
          <div
            className="mt-3 h-3 w-full overflow-hidden rounded-full border border-border bg-surface"
            role="img"
            aria-label={
              soldPct != null
                ? `${Math.round(soldPct * 100)} percent of epoch capacity sold`
                : "Capacity sold unknown"
            }
          >
            <div
              className="h-full bg-accent transition-[width] duration-500 motion-reduce:transition-none"
              style={{ width: `${(soldPct ?? 0) * 100}%` }}
            />
          </div>
          <div className="mt-2 flex justify-between font-mono text-xs tabular-nums text-muted">
            <span className="text-accent-strong">
              sold {sold != null ? fmtEth(sold) : "—"} <EthIcon className="inline size-3" />
            </span>
            <span>
              budget {budget != null ? fmtEth(budget) : "—"} <EthIcon className="inline size-3" />
            </span>
          </div>
        </div>

        {/* markout per epoch — from /api/lvr when the indexer is wired */}
        <div className="rounded-md border border-border bg-surface-raised p-4">
          <p className="font-mono text-[11px] uppercase tracking-widest text-info">
            markout per epoch (bps)
          </p>
          {markout ? (
            <MarkoutBars epochs={markout.epochs} bps={markout.bps} />
          ) : (
            <p className="mt-4 flex h-24 items-center justify-center text-center text-xs leading-5 text-muted">
              {error === "not-wired"
                ? "The LVR indexer (/api/lvr) is not wired yet — markout samples land when the Graph compose ships."
                : error
                  ? `Markout feed unavailable (${error}) — retry shortly.`
                  : "loading markout samples…"}
            </p>
          )}
        </div>
      </div>
      <p className="mt-4 border-t border-border pt-3 text-xs leading-5 text-muted">
        Markout proxy: compare each Cadence fill price with the pool price one
        block later, in bps. Negative is better for the LP (adverse selection
        flowing out of the pool).
      </p>
    </Panel>
  );
}

function MarkoutBars({ epochs, bps }: { epochs: number[]; bps: number[] }) {
  const max = Math.max(1, ...bps.map((b) => Math.abs(b)));
  return (
    <ul className="mt-3 flex h-24 items-end gap-2" aria-label="Markout per epoch in basis points">
      {epochs.map((e, i) => (
        <li key={e} className="flex flex-1 flex-col items-center gap-1">
          <div className="flex h-20 w-full items-end">
            <div
              className={`w-full rounded-t-sm ${bps[i] >= 0 ? "bg-danger/70" : "bg-success/70"}`}
              style={{ height: `${Math.max(4, (Math.abs(bps[i]) / max) * 100)}%` }}
            />
          </div>
          <span className="font-mono text-[10px] tabular-nums text-muted">#{e}</span>
        </li>
      ))}
    </ul>
  );
}
