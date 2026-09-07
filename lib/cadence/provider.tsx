"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useTransition,
} from "react";
import {
  BLOCK_INTERVAL_MS,
  createWorld,
  reducer,
} from "./machine";
import type { IntelQuote, RejectReason, WorldState } from "./types";
import { REJECT_REASONS } from "./types";

const IntelContext = createContext<WorldState | null>(null);
const ActionsContext = createContext<{
  buySlot: (sizeEth: number) => Promise<void>;
  attemptSwap: (
    sizeEth: number,
    opts?: { withoutSlot?: boolean; oversize?: boolean; reachPassive?: boolean },
  ) => Promise<"filled" | RejectReason>;
  refreshIntel: () => Promise<boolean>;
} | null>(null);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function ApronProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, createWorld);
  const [, startTransition] = useTransition();
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    const t = setInterval(() => {
      startTransition(() => dispatch({ type: "TICK" }));
      // ambient solver flow eats active depth during the epoch
      if (Math.random() < 0.3) dispatch({ type: "OTHERS_CONSUME" });
    }, BLOCK_INTERVAL_MS);
    return () => clearInterval(t);
  }, []);

  const buySlot = useCallback(async (sizeEth: number) => {
    await sleep(600); // simulated tx round-trip (Anvil fill)
    const s = stateRef.current;
    dispatch({ type: "BUY_SLOT", sizeEth, pricePerEth: s.intel?.suggestedAskPerEth ?? s.slotPricePerEth });
  }, []);

  const attemptSwap = useCallback(
    async (
      sizeEth: number,
      opts: { withoutSlot?: boolean; oversize?: boolean; reachPassive?: boolean } = {},
    ): Promise<"filled" | RejectReason> => {
      await sleep(500);
      const s = stateRef.current;
      if (opts.withoutSlot || !s.wallet.slot || s.wallet.slot.epochId !== s.epochId) {
        dispatch({
          type: "SWAP_REJECTED",
          reason: "no-slot",
          tradeSize: sizeEth,
          detail: REJECT_REASONS["no-slot"].detail,
        });
        return "no-slot";
      }
      if (opts.oversize || sizeEth > s.wallet.slot.capacity) {
        dispatch({
          type: "SWAP_REJECTED",
          reason: "oversize",
          tradeSize: sizeEth,
          detail: REJECT_REASONS["oversize"].detail,
        });
        return "oversize";
      }
      if (opts.reachPassive || sizeEth > s.pool.activeReserveEth * 0.95) {
        dispatch({
          type: "SWAP_REJECTED",
          reason: "same-block-passive-unlock",
          tradeSize: sizeEth,
          detail: REJECT_REASONS["same-block-passive-unlock"].detail,
        });
        return "same-block-passive-unlock";
      }
      const outUsdc = s.pool.activeReserveUsdc -
        (s.pool.activeReserveEth * s.pool.activeReserveUsdc) /
          (s.pool.activeReserveEth + sizeEth);
      dispatch({ type: "SWAP_SUCCEEDED", sizeEth, outUsdc, capacityUsed: sizeEth });
      return "filled";
    },
    [],
  );

  const refreshIntel = useCallback(async (): Promise<boolean> => {
    await sleep(1400); // x402 round-trip: pay on Hedera, receive signed quote
    if (Math.random() < 0.12) {
      dispatch({ type: "INTEL_ERROR", message: "x402 settlement timed out. No charge made — try again." });
      return false;
    }
    const s = stateRef.current;
    const utilization =
      1 -
      s.pool.activeReserveEth /
        (s.pool.lambdaBps / 10_000) /
        (s.pool.activeReserveEth + s.pool.passiveReserveEth);
    const toxicFlow = Math.min(1, s.rejects.length / 8);
    const base = 0.0016;
    const suggested = Number(
      (base * (1 + utilization * 1.4 + toxicFlow * 0.8) * (1 + (Math.random() - 0.3) * 0.15)).toFixed(5),
    );
    const quote: IntelQuote = {
      suggestedAskPerEth: suggested,
      asOf: Date.now(),
      rationale: `Active utilization ${(utilization * 100).toFixed(0)}% · toxicity proxy from ${s.rejects.length} rejects this session. Capacity is ${utilization > 0.5 ? "scarce — raise the ask" : "ample — hold the ask"}.`,
      source: "hedera:x402 · blocky402 intel node",
      costUsd: 0.05,
    };
    dispatch({ type: "INTEL_QUOTE", quote });
    return true;
  }, []);

  const value = state;
  const actions = useMemo(
    () => ({ buySlot, attemptSwap, refreshIntel }),
    [buySlot, attemptSwap, refreshIntel],
  );

  return (
    <IntelContext.Provider value={value}>
      <ActionsContext.Provider value={actions}>{children}</ActionsContext.Provider>
    </IntelContext.Provider>
  );
}

export function useApron(): WorldState {
  const ctx = useContext(IntelContext);
  if (!ctx) throw new Error("useApron must be used within ApronProvider");
  return ctx;
}

export function useApronActions() {
  const ctx = useContext(ActionsContext);
  if (!ctx) throw new Error("useApronActions must be used within ApronProvider");
  return ctx;
}
