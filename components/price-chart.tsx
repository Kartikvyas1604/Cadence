"use client";

import { useEffect, useRef, useState } from "react";
import { useCadence } from "@/lib/cadence/provider";
import { fmtUsdc } from "@/lib/cadence/format";
import { EthIcon } from "./eth-icon";
import { Panel } from "./panel";

const W = 800;
const H = 240;
const PAD = { top: 16, right: 14, bottom: 24, left: 14 };
const VISIBLE = 180;
const MIN_SPAN = 12;
const DEFAULT_SPAN = 120;
const TWEEN_MS = 720;

export function PriceChart({ className = "" }: { className?: string }) {
  const s = useCadence();
  const all = s.priceHistory.slice(-VISIBLE);
  const [span, setSpan] = useState(DEFAULT_SPAN);
  const [offset, setOffset] = useState(0);
  const [sel, setSel] = useState<{ a: number; b: number } | null>(null);
  const draggingRef = useRef(false);

  const end = Math.max(2, all.length - offset);
  const start = Math.max(0, end - span);
  const points = all.slice(start, end);
  const newest = all[all.length - 1];
  const live = offset === 0;

  // ——— butter tween ———
  // A single mount-scoped rAF loop owns the animation. It only calls
  // setState while a tween is in flight, reads the latest data through a
  // ref, and is never restarted by unrelated renders — so unrelated
  // provider updates can't stutter or cancel it.
  const dataRef = useRef(all);
  useEffect(() => {
    dataRef.current = all;
  }, [all]);

  const [tween, setTween] = useState<{ len: number; p: number }>({
    len: -1,
    p: 1,
  });

  useEffect(() => {
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let lastLen = -1;
    let animating = false;
    let tweenStart = 0;
    const loop = (now: number) => {
      const cur = dataRef.current;
      if (cur.length !== lastLen) {
        const n = cur[cur.length - 1];
        const prev = cur[cur.length - 2];
        const changed = !!(n && prev && prev.activeUsd !== n.activeUsd);
        lastLen = cur.length;
        if (reduced) {
          animating = false;
          setTween({ len: cur.length, p: 1 });
        } else {
          animating = changed;
          tweenStart = now;
          setTween({ len: cur.length, p: changed ? 0.0001 : 1 });
        }
      }
      if (animating) {
        const prog = Math.min(1, (now - tweenStart) / TWEEN_MS);
        setTween({ len: lastLen, p: prog });
        if (prog >= 1) animating = false;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  // eased progress for the newest segment; `len` guards against a stale
  // tween leaking into freshly appended data
  const fromV =
    all.length >= 2 ? all[all.length - 2].activeUsd : (newest?.activeUsd ?? 0);
  const toV = newest?.activeUsd ?? 0;
  const moving = !!newest && fromV !== toV;
  const easedRaw = tween.p < 1 ? 1 - Math.pow(1 - tween.p, 3) : 1;
  const easedUsed = !moving
    ? 1
    : tween.len === all.length
      ? easedRaw
      : tween.p < 1
        ? easedRaw
        : 0;

  // rendered points: only the live newest point is interpolated
  const displayPoints = (() => {
    if (!points.length || !live || !newest) return points;
    const lastVisible = points[points.length - 1];
    if (lastVisible.block !== newest.block) return points;
    const pts = points.slice();
    pts[pts.length - 1] = {
      ...lastVisible,
      activeUsd: fromV + (toV - fromV) * easedUsed,
    };
    return pts;
  })();

  const actives = displayPoints.map((p) => p.activeUsd);
  const passives = displayPoints.map((p) => p.passiveUsd);

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

  const plotL = PAD.left;
  const plotR = W - PAD.right;
  const plotW = plotR - plotL;
  const base = H - PAD.bottom;

  // ——— smooth scroll ———
  // While the newest point tweens in, the whole tape slides left by one
  // slot (phase -1 → 0) so appends glide instead of teleporting.
  const headMatchesLive =
    live && !!newest && points[points.length - 1]?.block === newest.block;
  const phase = headMatchesLive ? easedUsed - 1 : 0;
  const step = plotW / Math.max(1, span - 1);
  const x = (i: number) => plotL + (i + phase) * step;
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

  const epochSeams = points
    .map((p, i) => (i > 0 && p.epochId !== points[i - 1].epochId ? i : -1))
    .filter((i) => i > 0);

  const last = points[points.length - 1];
  const first = points[0];
  const delta = last && first ? last.activeUsd - first.activeUsd : 0;
  const deltaPct = first && first.activeUsd > 0 ? delta / first.activeUsd : 0;

  const zoomOut = () => {
    setSpan((sp) => Math.min(VISIBLE, Math.round(sp * 1.6)));
    setOffset((off) => Math.max(0, Math.round(off * 0.6)));
  };

  const resetToLive = () => {
    setSpan(DEFAULT_SPAN);
    setOffset(0);
  };

  const fracFromEvent = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const fx = ((e.clientX - rect.left) / rect.width) * W;
    return Math.min(1, Math.max(0, (fx - PAD.left) / plotW));
  };

  const idxFromFrac = (f: number) =>
    Math.round(f * Math.max(0, points.length - 1));

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
          <div className="mb-3 flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
            <p className="font-mono text-2xl font-medium tabular-nums text-accent-strong">
              ${fmtUsdc(last.activeUsd, 2)}
              <span className="ml-1 text-sm font-normal text-muted">
                / <EthIcon /> ETH
              </span>
            </p>
            <div className="flex items-center gap-4">
              <p
                className={`font-mono text-sm tabular-nums ${delta >= 0 ? "text-success" : "text-danger"}`}
              >
                {delta >= 0 ? "▲" : "▼"} {fmtUsdc(Math.abs(delta), 2)} (
                {(deltaPct * 100).toFixed(2)}%)
                <span className="ml-1.5 text-muted">window</span>
              </p>
              {live ? (
                <span className="font-mono text-[11px] uppercase tracking-widest text-muted">
                  live · {points.length} blk
                </span>
              ) : (
                <button
                  type="button"
                  onClick={resetToLive}
                  className="inline-flex h-9 items-center rounded-full border border-accent/50 px-3 font-mono text-[11px] uppercase tracking-widest text-accent transition-colors duration-100 hover:bg-accent/10"
                >
                  jump to live
                </button>
              )}
            </div>
          </div>

          <svg
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            className="h-44 w-full flex-1 cursor-crosshair select-none"
            style={{ touchAction: "none" }}
            role="img"
            aria-label={`Active-side price ${fmtUsdc(last.activeUsd, 2)} USDC per ETH, passive-side price ${fmtUsdc(last.passiveUsd, 2)} USDC per ETH, per block`}
            onPointerDown={(e) => {
              if (points.length < 2) return;
              e.currentTarget.setPointerCapture(e.pointerId);
              draggingRef.current = true;
              const f = fracFromEvent(e);
              setSel({ a: f, b: f });
            }}
            onPointerMove={(e) => {
              if (!draggingRef.current) return;
              const f = fracFromEvent(e);
              setSel((prev) => (prev ? { ...prev, b: f } : prev));
            }}
            onPointerUp={(e) => {
              if (!draggingRef.current) return;
              draggingRef.current = false;
              e.currentTarget.releasePointerCapture?.(e.pointerId);
              const cur = sel;
              setSel(null);
              if (!cur) return;
              const i0 = idxFromFrac(Math.min(cur.a, cur.b));
              const i1 = idxFromFrac(Math.max(cur.a, cur.b));
              if (i1 - i0 < 2) {
                zoomOut();
                return;
              }
              setSpan(Math.max(MIN_SPAN, i1 - i0 + 1));
              setOffset(Math.max(0, all.length - (start + i1 + 1)));
            }}
            onPointerCancel={() => {
              draggingRef.current = false;
              setSel(null);
            }}
            onDoubleClick={resetToLive}
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
              cy={y(displayPoints[displayPoints.length - 1].activeUsd)}
              r="3.5"
              fill="var(--accent-strong)"
            />

            {sel ? (
              <rect
                x={plotL + Math.min(sel.a, sel.b) * plotW}
                width={Math.max(1, Math.abs(sel.b - sel.a) * plotW)}
                y={PAD.top}
                height={base - PAD.top}
                fill="var(--accent)"
                opacity="0.12"
                stroke="var(--accent)"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
            ) : null}
          </svg>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-x-6 gap-y-1 font-mono text-xs text-muted">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
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
            </div>
            <span>
              passive now{" "}
              <span className="tabular-nums text-foreground">
                ${fmtUsdc(last.passiveUsd, 2)}
              </span>
            </span>
          </div>
          <p className="mt-1 text-right font-mono text-[11px] text-muted/70">
            drag a range to zoom · click to zoom out · double-click resets to
            live
          </p>
        </>
      )}
    </Panel>
  );
}
