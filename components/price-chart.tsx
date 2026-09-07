"use client";

import { useEffect, useRef, useState } from "react";
import { useCadence } from "@/lib/cadence/provider";
import { fmtEth, fmtUsdc } from "@/lib/cadence/format";
import { EthIcon } from "./eth-icon";
import { Panel } from "./panel";

const W = 800;
const H = 240;
const PAD = { top: 16, right: 14, bottom: 24, left: 14 };
const VISIBLE = 180;
const CANDLE_GROUP = 4;
const MIN_SPAN = 24;
const DEFAULT_SPAN = 120;

type ViewMode = "line" | "candles" | "depth";

const VIEWS: { key: ViewMode; label: string; hint: string }[] = [
  { key: "line", label: "line", hint: "per-block price" },
  { key: "candles", label: "candles", hint: "4-block OHLC" },
  { key: "depth", label: "depth", hint: "active reserve depth" },
];

export function PriceChart({ className = "" }: { className?: string }) {
  const s = useCadence();
  const [view, setView] = useState<ViewMode>("line");
  const [span, setSpan] = useState(DEFAULT_SPAN);
  const svgRef = useRef<SVGSVGElement | null>(null);

  // wheel zoom on the plot — native listener so preventDefault works
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.deltaY) return;
      e.preventDefault();
      setSpan((cur) => {
        const next = e.deltaY < 0 ? Math.round(cur / 1.4) : Math.round(cur * 1.4);
        return Math.min(VISIBLE, Math.max(MIN_SPAN, next));
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const zoom = (dir: "in" | "out") =>
    setSpan((cur) => {
      const next = dir === "in" ? Math.round(cur / 1.4) : Math.round(cur * 1.4);
      return Math.min(VISIBLE, Math.max(MIN_SPAN, next));
    });

  const all = s.priceHistory.slice(-VISIBLE);
  // right-anchored zoom window: newest blocks always visible
  const points = all.slice(Math.max(0, all.length - span));

  const actives = points.map((p) => p.activeUsd);
  const passives = points.map((p) => p.passiveUsd);

  // 4-block OHLC candles of the active-side price
  const candles: { o: number; h: number; l: number; c: number }[] = [];
  for (let i = 0; i < points.length; i += CANDLE_GROUP) {
    const g = points.slice(i, i + CANDLE_GROUP).map((p) => p.activeUsd);
    if (g.length === 0) continue;
    candles.push({
      o: g[0],
      c: g[g.length - 1],
      h: Math.max(...g),
      l: Math.min(...g),
    });
  }

  const values =
    view === "depth"
      ? [...points.map((p) => p.activeEth), ...points.map((p) => p.passiveEth)]
      : [...actives, ...passives, ...(view === "candles" ? candles.flatMap((c) => [c.h, c.l]) : [])];
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (max - min < 1e-6) {
    min -= 1;
    max += 1;
  }
  const padY = (max - min) * 0.08;
  min -= padY;
  max += padY;

  const plotL = PAD.left;
  const plotR = W - PAD.right;
  const plotW = plotR - plotL;
  const base = H - PAD.bottom;

  const x = (i: number) =>
    plotL + (i / Math.max(1, points.length - 1)) * plotW;
  const y = (v: number) =>
    PAD.top + (1 - (v - min) / (max - min)) * (base - PAD.top);

  const line = (vals: number[]) =>
    vals
      .map(
        (v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(2)} ${y(v).toFixed(2)}`,
      )
      .join(" ");

  const activePath = line(actives);
  const passivePath = line(passives);
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

  // candle geometry
  const cw = plotW / Math.max(1, candles.length);
  const bodyW = Math.max(2, cw * 0.5);

  // depth bars: passive sits flat per epoch — dashed reference segments
  const depthRuns: { start: number; end: number }[] = [];
  points.forEach((p, i) => {
    const prev = depthRuns[depthRuns.length - 1];
    if (prev && points[prev.start].epochId === p.epochId) {
      prev.end = i;
    } else {
      depthRuns.push({ start: i, end: i });
    }
  });

  const ariaLabel =
    view === "depth"
      ? `Active reserve depth ${fmtEth(last?.activeEth ?? 0, 1)} ETH per block, passive locked per epoch`
      : `Active-side price ${fmtUsdc(last?.activeUsd ?? 0, 2)} USDC per ETH, passive-side price ${fmtUsdc(last?.passiveUsd ?? 0, 2)} USDC per ETH, per block`;

  return (
    <Panel
      className={className}
      title="Price tape"
      caption={
        view === "depth"
          ? "Active depth drains with flow and resets at refresh — passive never moves mid-epoch."
          : "Per-block active-side price. Passive depth never moves mid-epoch — that's the point."
      }
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
          <div className="mb-3 flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
            {view === "depth" ? (
              <p className="font-mono text-2xl font-medium tabular-nums text-accent-strong">
                {fmtEth(last.activeEth, 1)} <EthIcon />
                <span className="ml-2 text-sm font-normal text-muted">
                  active depth
                </span>
              </p>
            ) : (
              <>
                <p className="font-mono text-2xl font-medium tabular-nums text-accent-strong">
                  ${fmtUsdc(last.activeUsd, 2)}
                  <span className="ml-1 text-sm font-normal text-muted">
                    / <EthIcon /> ETH
                  </span>
                </p>
                <p
                  className={`font-mono text-sm tabular-nums ${delta >= 0 ? "text-success" : "text-danger"}`}
                >
                  {delta >= 0 ? "▲" : "▼"} {fmtUsdc(Math.abs(delta), 2)} (
                  {(deltaPct * 100).toFixed(2)}%)
                  <span className="ml-1.5 text-muted">window</span>
                </p>
              </>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <div
                role="group"
                aria-label="Tape view mode"
                className="flex rounded-md border border-border bg-surface-raised p-0.5"
              >
                {VIEWS.map((v) => (
                  <button
                    key={v.key}
                    type="button"
                    aria-pressed={view === v.key}
                    title={v.hint}
                    onClick={() => setView(v.key)}
                    className={`h-9 rounded-[5px] px-3.5 font-mono text-xs uppercase tracking-widest transition-colors duration-100 ${
                      view === v.key
                        ? "bg-accent text-accent-foreground"
                        : "text-muted hover:text-foreground"
                    }`}
                  >
                    {v.label}
                  </button>
                ))}
              </div>

              <div
                role="group"
                aria-label="Tape zoom"
                className="flex items-center rounded-md border border-border bg-surface-raised p-0.5"
              >
                <button
                  type="button"
                  title="Zoom out — more blocks"
                  aria-label="Zoom out"
                  onClick={() => zoom("out")}
                  disabled={span >= VISIBLE}
                  className="inline-flex h-9 w-10 items-center justify-center rounded-[5px] font-mono text-sm text-muted transition-colors duration-100 hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
                >
                  −
                </button>
                <button
                  type="button"
                  title="Reset zoom"
                  aria-label={`Zoom window: last ${span} blocks. Click to reset`}
                  onClick={() => setSpan(DEFAULT_SPAN)}
                  className="inline-flex h-9 min-w-14 items-center justify-center rounded-[5px] px-2 font-mono text-xs tabular-nums text-foreground transition-colors duration-100 hover:bg-surface hover:text-accent"
                >
                  {span}b
                </button>
                <button
                  type="button"
                  title="Zoom in — fewer blocks"
                  aria-label="Zoom in"
                  onClick={() => zoom("in")}
                  disabled={span <= MIN_SPAN}
                  className="inline-flex h-9 w-10 items-center justify-center rounded-[5px] font-mono text-base text-muted transition-colors duration-100 hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
                >
                  +
                </button>
              </div>
            </div>
          </div>

          <svg
            ref={svgRef}
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            className="h-44 w-full flex-1"
            role="img"
            aria-label={ariaLabel}
          >
            {[0.25, 0.5, 0.75].map((f) => (
              <line
                key={f}
                x1={plotL}
                x2={plotR}
                y1={PAD.top + f * (base - PAD.top)}
                y2={PAD.top + f * (base - PAD.top)}
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

            {view === "line" ? (
              <>
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
              </>
            ) : null}

            {view === "candles" ? (
              <>
                <path
                  d={passivePath}
                  fill="none"
                  stroke="var(--muted)"
                  strokeWidth="1.5"
                  strokeDasharray="5 5"
                  opacity="0.55"
                  vectorEffect="non-scaling-stroke"
                />
                {candles.map((c, i) => {
                  const cx = plotL + (i + 0.5) * cw;
                  const up = c.c >= c.o;
                  const color = up ? "var(--success)" : "var(--danger)";
                  const top = y(Math.max(c.o, c.c));
                  const bot = y(Math.min(c.o, c.c));
                  return (
                    <g key={`c${i}`}>
                      <line
                        x1={cx}
                        x2={cx}
                        y1={y(c.h)}
                        y2={y(c.l)}
                        stroke={color}
                        strokeWidth="1"
                        opacity="0.7"
                        vectorEffect="non-scaling-stroke"
                      />
                      <rect
                        x={cx - bodyW / 2}
                        y={top}
                        width={bodyW}
                        height={Math.max(1.5, bot - top)}
                        fill={color}
                        opacity="0.85"
                      />
                    </g>
                  );
                })}
              </>
            ) : null}

            {view === "depth" ? (
              <>
                {depthRuns.map((r, ri) => (
                  <line
                    key={`pr${ri}`}
                    x1={x(r.start)}
                    x2={x(r.end)}
                    y1={y(points[r.start].passiveEth)}
                    y2={y(points[r.start].passiveEth)}
                    stroke="var(--muted)"
                    strokeWidth="1.5"
                    strokeDasharray="5 5"
                    opacity="0.55"
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
                {points.map((p, i) => {
                  const bw = plotW / points.length;
                  const bx = plotL + i * bw;
                  const by = y(p.activeEth);
                  return (
                    <rect
                      key={`d${i}`}
                      x={bx + bw * 0.15}
                      y={by}
                      width={Math.max(1, bw * 0.7)}
                      height={Math.max(1, base - by)}
                      fill="var(--accent)"
                      opacity={p.swap ? "0.95" : "0.45"}
                    />
                  );
                })}
              </>
            ) : null}
          </svg>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-x-6 gap-y-1 font-mono text-xs text-muted">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
              {view === "line" ? (
                <>
                  <span className="flex items-center gap-2">
                    <span aria-hidden className="h-0.5 w-6 rounded bg-accent" />
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
                </>
              ) : null}
              {view === "candles" ? (
                <>
                  <span className="flex items-center gap-2">
                    <span aria-hidden className="h-0.5 w-6 rounded bg-accent" />
                    active px
                  </span>
                  <span className="flex items-center gap-2">
                    <span aria-hidden className="h-2 w-3 rounded-sm bg-success" />
                    up · 4 blk
                  </span>
                  <span className="flex items-center gap-2">
                    <span aria-hidden className="h-2 w-3 rounded-sm bg-danger" />
                    down · 4 blk
                  </span>
                </>
              ) : null}
              {view === "depth" ? (
                <>
                  <span className="flex items-center gap-2">
                    <span aria-hidden className="h-2 w-3 rounded-sm bg-accent/45" />
                    active depth · drains with flow
                  </span>
                  <span className="flex items-center gap-2">
                    <span
                      aria-hidden
                      className="h-px w-6 border-t border-dashed border-muted"
                    />
                    passive · locked
                  </span>
                </>
              ) : null}
            </div>
            <span className="text-muted/70">
              scroll to zoom · newest right · {span}/{VISIBLE} blk
            </span>
            <span>
              {view === "depth" ? (
                <>
                  passive depth{" "}
                  <span className="tabular-nums text-foreground">
                    {fmtEth(last.passiveEth, 1)} <EthIcon />
                  </span>
                </>
              ) : (
                <>
                  passive now{" "}
                  <span className="tabular-nums text-foreground">
                    ${fmtUsdc(last.passiveUsd, 2)}
                  </span>
                </>
              )}
            </span>
          </div>
        </>
      )}
    </Panel>
  );
}
