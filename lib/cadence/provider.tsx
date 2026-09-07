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
import { initialWorld, reducer } from "./machine";
import type { IntelQuote, RejectReason, WorldState } from "./types";
import { REJECT_REASONS } from "./types";
import { epochFromBlock, blocksUntilEpochEnd } from "./types";
import { useInjectedWallet } from "@/lib/wallet/use-injected-wallet";
import { useChainState } from "./chain";
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
  const [state, dispatch] = useReducer(reducer, undefined, initialWorld);
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // real sources: connected wallet, live chain, paid intel
  const wallet = useInjectedWallet();
  const chain = useChainState(wallet.chainId);

  const world: WorldState = useMemo(
    () => ({
      chain: {
        chainId: chain.chainId,
        blockNumber: chain.blockNumber,
        epochId:
          chain.blockNumber != null ? epochFromBlock(chain.blockNumber) : null,
        blocksUntilEpochEnd:
          chain.blockNumber != null
            ? blocksUntilEpochEnd(chain.blockNumber)
            : null,
      },
      pool: null,
      wallet: {
        address: wallet.address,
        eth: wallet.ethBalance,
        slot: null,
      },
      slotPricePerEth: state.intel?.suggestedAskPerEth ?? null,
      askPerEth: state.intel?.suggestedAskPerEth ?? null,
      intel: state.intel,
      intelCalls: state.intelCalls,
      graph: state.graph,
      rejects: state.rejects,
      commitments: state.commitments,
      swaps: state.swaps,
      priceHistory: state.priceHistory,
      lastIntelError: state.lastIntelError,
    }),
    [chain.chainId, chain.blockNumber, wallet.address, wallet.ethBalance, state],
  );

  const requireContracts = useCallback((): WorldState | null => {
    const s = stateRef.current;
    if (!s.pool || s.slotPricePerEth === null || !s.wallet.address) return null;
    return s;
  }, []);

  // Actions activate only when a real pool, a written ask, and a connected
  // wallet all exist — until then the panels show their honest states.
  const buySlot = useCallback(async (sizeEth: number) => {
    const s = requireContracts();
    if (!s) return;
    dispatch({ type: "BUY_SLOT", sizeEth, pricePerEth: s.slotPricePerEth! });
  }, [requireContracts]);

  const commitMint = useCallback(async (sizeEth: number) => {
    const s = requireContracts();
    if (!s) return;
    dispatch({
      type: "COMMIT_MINT",
      sizeEth,
      pricePerEth: s.slotPricePerEth!,
      salt: randomSalt(),
    });
  }, [requireContracts]);

  const checkPreSwap = (
    s: WorldState,
    sizeEth: number,
    opts: { withoutSlot?: boolean; oversize?: boolean; reachPassive?: boolean },
  ): RejectReason | null => {
    if (!s.pool) return "no-slot";
    if (opts.withoutSlot || !s.wallet.slot || s.wallet.slot.epochId !== s.chain.epochId) {
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
      const s = requireContracts();
      if (!s) return "no-slot";
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
      const outUsdc = requireContracts() && s.pool
        ? (s.pool.activeReserveUsdc -
            (s.pool.activeReserveEth * s.pool.activeReserveUsdc) /
              (s.pool.activeReserveEth + sizeEth))
        : 0;
      dispatch({ type: "SWAP_SUCCEEDED", sizeEth, outUsdc, capacityUsed: sizeEth });
      return "filled";
    },
    [requireContracts],
  );

  // D4: reveal with a wrong salt — the hook must revert
  const attemptBadReveal = useCallback(
    async (sizeEth: number): Promise<"filled" | RejectReason> => {
      const s = requireContracts();
      if (!s) return "no-slot";
      const slot = s.wallet.slot;
      const c =
        slot && slot.commitmentId != null
          ? s.commitments.find((x) => x.id === slot.commitmentId)
          : null;
      if (!slot || !c || c.epochId !== s.chain.epochId || c.status !== "committed") {
        return "no-slot";
      }
      dispatch({ type: "REVEAL_SWAP", sizeEth, salt: `${c.salt}ff` });
      return "filled";
    },
    [requireContracts],
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

  const actions = useMemo(
    () => ({ buySlot, commitMint, attemptSwap, attemptBadReveal, refreshIntel }),
    [buySlot, commitMint, attemptSwap, attemptBadReveal, refreshIntel],
  );

  return (
    <IntelContext.Provider value={world}>
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
