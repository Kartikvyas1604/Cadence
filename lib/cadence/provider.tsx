"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
} from "react";
import {
  BLOCK_INTERVAL_MS,
  createWorld,
  quoteSwapOutUsdc,
  reducer,
} from "./machine";
import type { IntelQuote, RejectReason, WorldState } from "./types";
import { REJECT_REASONS } from "./types";
import { randomSalt } from "./hash";

const IntelContext = createContext<WorldState | null>(null);
const ActionsContext = createContext<{
  buySlot: (sizeEth: number) => Promise<void>;
  commitMint: (sizeEth: number) => Promise<void>;
  attemptSwap: (
    sizeEth: number,
    opts?: { withoutSlot?: boolean; oversize?: boolean; reachPassive?: boolean },
  ) => Promise<"filled" | RejectReason>;
  attemptBadReveal: (sizeEth: number) => Promise<"filled" | RejectReason>;
  refreshIntel: () => Promise<boolean>;
} | null>(null);

export function CadenceProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, createWorld);
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    const t = setInterval(() => dispatch({ type: "TICK" }), BLOCK_INTERVAL_MS);
    return () => clearInterval(t);
  }, []);

  const buySlot = useCallback(async (sizeEth: number) => {
    const s = stateRef.current;
    dispatch({ type: "BUY_SLOT", sizeEth, pricePerEth: s.intel?.suggestedAskPerEth ?? s.slotPricePerEth });
  }, []);

  // B2: commit-mint — H lands public, size stays client-side until reveal
  const commitMint = useCallback(async (sizeEth: number) => {
    const s = stateRef.current;
    dispatch({
      type: "COMMIT_MINT",
      sizeEth,
      pricePerEth: s.intel?.suggestedAskPerEth ?? s.slotPricePerEth,
      salt: randomSalt(),
    });
  }, []);

  const checkPreSwap = (
    s: WorldState,
    sizeEth: number,
    opts: { withoutSlot?: boolean; oversize?: boolean; reachPassive?: boolean },
  ): RejectReason | null => {
    if (opts.withoutSlot || !s.wallet.slot || s.wallet.slot.epochId !== s.epochId) {
      return "no-slot";
    }
    if (opts.oversize || sizeEth > s.wallet.slot.capacity) {
      return "oversize";
    }
    if (opts.reachPassive || sizeEth > s.pool.activeReserveEth * 0.95) {
      return "same-block-passive-unlock";
    }
    return null;
  };

  const attemptSwap = useCallback(
    async (
      sizeEth: number,
      opts: { withoutSlot?: boolean; oversize?: boolean; reachPassive?: boolean } = {},
    ): Promise<"filled" | RejectReason> => {
      const s = stateRef.current;
      const blocked = checkPreSwap(s, sizeEth, opts);
      if (blocked) {
        dispatch({
          type: "SWAP_REJECTED",
          reason: blocked,
          tradeSize: sizeEth,
          detail: REJECT_REASONS[blocked].detail,
        });
        return blocked;
      }
      // C1: held slot is a Private Cadence Intent — reveal(size, salt) then consume
      const slot = s.wallet.slot!;
      if (slot.commitmentId != null) {
        const c = s.commitments.find((x) => x.id === slot.commitmentId);
        if (!c || c.status !== "committed") {
          return "no-slot";
        }
        dispatch({ type: "REVEAL_SWAP", sizeEth, salt: c.salt });
        return "filled";
      }
      const outUsdc = quoteSwapOutUsdc(s.pool, sizeEth);
      dispatch({ type: "SWAP_SUCCEEDED", sizeEth, outUsdc, capacityUsed: sizeEth });
      return "filled";
    },
    [],
  );

  // D4 demo: reveal with a wrong salt — hook must revert
  const attemptBadReveal = useCallback(
    async (sizeEth: number): Promise<"filled" | RejectReason> => {
      const s = stateRef.current;
      const slot = s.wallet.slot;
      const c =
        slot && slot.commitmentId != null
          ? s.commitments.find((x) => x.id === slot.commitmentId)
          : null;
      if (!slot || !c || c.epochId !== s.epochId || c.status !== "committed") {
        return "no-slot";
      }
      dispatch({ type: "REVEAL_SWAP", sizeEth, salt: `${c.salt}ff` });
      return "filled";
    },
    [],
  );

  const refreshIntel = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch("/api/intel", { method: "POST" });
      if (!res.ok) {
        dispatch({
          type: "INTEL_ERROR",
          message: `intel endpoint returned ${res.status} — paid x402 intel is not configured yet`,
        });
        return false;
      }
      const body = (await res.json()) as IntelQuote;
      dispatch({ type: "INTEL_QUOTE", quote: body });
      return true;
    } catch {
      dispatch({
        type: "INTEL_ERROR",
        message: "intel endpoint unreachable — paid x402 intel is not configured yet",
      });
      return false;
    }
  }, []);

  const value = state;
  const actions = useMemo(
    () => ({ buySlot, commitMint, attemptSwap, attemptBadReveal, refreshIntel }),
    [buySlot, commitMint, attemptSwap, attemptBadReveal, refreshIntel],
  );

  return (
    <IntelContext.Provider value={value}>
      <ActionsContext.Provider value={actions}>{children}</ActionsContext.Provider>
    </IntelContext.Provider>
  );
}

export function useCadence(): WorldState {
  const ctx = useContext(IntelContext);
  if (!ctx) throw new Error("useCadence must be used within CadenceProvider");
  return ctx;
}

export function useCadenceActions() {
  const ctx = useContext(ActionsContext);
  if (!ctx) throw new Error("useCadenceActions must be used within CadenceProvider");
  return ctx;
}
