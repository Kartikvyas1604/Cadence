"use client";

import { useCadence } from "@/lib/cadence/provider";
import { fmtUsdc } from "@/lib/cadence/format";
import { EthIcon } from "./eth-icon";
import { Panel } from "./panel";

const W = 800;
const H = 240;
const PAD = { top: 16, right: 14, bottom: 24, left: 14 };
const VISIBLE = 180;

export function PriceChart({ className = "" }: { className?: string }) {
  const s = useCadence();
  const points = s.priceHistory.slice(-VISIBLE);

  const actives = points.map((p) => p.activeUsd);
  const passives = points.map((p) => p.passiveUsd);
  const values = [...actives, ...passives];
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (max - min < 1e-6) {
    min -= 1;
    max += 1;
  }
  const padY = (max - min) * 0.08;
  min -= padY;
  max += padY;

  const x = (i: number) =>
    PAD.left +
    (i / Math.max(1, points.length - 1)) * (W - PAD.left - PAD.right);
  const y = (v: number) =>
    PAD.top + (1 - (v - min) / (max - min)) * (H - PAD.top - PAD.bottom);

  const line = (vals: number[]) =>
    vals
      .map(
        (v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(2)} ${y(v).toFixed(2)}`,
      )
      .join(" ");

  const activePath = line(actives);
  const passivePath = line(passives);
  const base = H - PAD.bottom;
  const areaPath =
    points.length > 1
      ? `${activePath} L${x(points.length - 1).toFixed(2)} ${base} L${x(0).toFixed(2)} ${base} Z`
      : "";

  // Epoch refreshes: vertical seam where the reserve split resets
  const epochSeams = points
    .map((p, i) => (i > 0 && p.epochId !== points[i - 1].epochId ? i : -1))
    .filter((i) => i > 0);

  const last = points[points.length - 1];
  const first = points[0];
  const delta = last && first ? last.activeUsd - first.activeUsd : 0;
  const deltaPct = first && first.activeUsd > 0 ? delta / first.activeUsd : 0;

  return (
    <Panel
      className={className}
      title="Price tape"
      caption="Per-block active-side price. Passive depth never moves mid-epoch — that's the point."
    >
      {points.length < 2 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border-strong px-4 py-12 text-center">
          <p className="text-sm font-medium text-foreground">
            Waiting for the next block
          </p>
          <p className="max-w-[30ch] text-xs leading-5 text-muted">
            The tape starts as soon as the second block lands.
          </p>
        </div>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-baseline gap-x-6 gap-y-1">
            <p className="font-mono text-2xl font-medium tabular-nums text-accent-strong">
              ${fmtUsdc(last.activeUsd, 2)}
              <span className="ml-1 text-sm text-muted">/ <EthIcon /> ETH</span>
            </p>
            <p
              className={`font-mono text-sm tabular-nums ${delta >= 0 ? "text-success" : "text-danger"}`}
            >
              {delta >= 0 ? "▲" : "▼"} {fmtUsdc(Math.abs(delta), 2)} (
              {(deltaPct * 100).toFixed(2)}%)
              <span className="ml-1.5 text-muted">window</span>
            </p>
          </div>

          <svg
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            className="h-44 w-full flex-1"
            role="img"
            aria-label={`Active-side price ${fmtUsdc(last.activeUsd, 2)} USDC per ETH, passive-side price ${fmtUsdc(last.passiveUsd, 2)} USDC per ETH, per block`}
          >
            {[0.25, 0.5, 0.75].map((f) => (
              <line
                key={f}
                x1={PAD.left}
                x2={W - PAD.right}
                y1={PAD.top + f * (H - PAD.top - PAD.bottom)}
                y2={PAD.top + f * (H - PAD.top - PAD.bottom)}
                stroke="var(--border)"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
            ))}

            {epochSeams.map((i) => (
              <line
                key={`e${i}`}
                x1={x(i)}
                x2={x(i)}
                y1={PAD.top}
                y2={base}
                stroke="var(--border-strong)"
                strokeWidth="1"
                strokeDasharray="2 6"
                vectorEffect="non-scaling-stroke"
              />
            ))}

            {areaPath ? (
              <path d={areaPath} fill="var(--accent)" opacity="0.07" />
            ) : null}

            <path
              d={passivePath}
              fill="none"
              stroke="var(--muted)"
              strokeWidth="1.5"
              strokeDasharray="5 5"
              opacity="0.55"
              vectorEffect="non-scaling-stroke"
            />

            <path
              d={activePath}
              fill="none"
              stroke="var(--accent)"
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />

            {points.map(
              (p, i) =>
                p.swap ? (
                  <circle
                    key={`s${p.block}-${i}`}
                    cx={x(i)}
                    cy={y(p.activeUsd)}
                    r="4"
                    fill="var(--accent)"
                    stroke="var(--surface)"
                    strokeWidth="1.5"
                    vectorEffect="non-scaling-stroke"
                  />
                ) : null,
            )}

            <circle
              cx={x(points.length - 1)}
              cy={y(last.activeUsd)}
              r="3.5"
              fill="var(--accent-strong)"
            />
          </svg>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-x-6 gap-y-1 font-mono text-xs text-muted">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
              <span className="flex items-center gap-2">
                <span
                  aria-hidden
                  className="h-0.5 w-6 rounded bg-accent"
                />
                active px
              </span>
              <span className="flex items-center gap-2">
                <span
                  aria-hidden
                  className="h-px w-6 border-t border-dashed border-muted"
                />
                passive px · locked
              </span>
              <span className="flex items-center gap-2">
                <span aria-hidden className="size-2 rounded-full bg-accent" />
                your fill
              </span>
            </div>
            <span>
              passive now{" "}
              <span className="tabular-nums text-foreground">
                ${fmtUsdc(last.passiveUsd, 2)}
              </span>
            </span>
          </div>
        </>
      )}
    </Panel>
  );
}
