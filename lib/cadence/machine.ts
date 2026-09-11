import { keccak256, toHex } from "viem";
import type { IntelQuote, PricePoint, RejectEvent, WorldState } from "./types";
import { REJECT_REASONS } from "./types";
import { commitHash } from "./hash";

function saltToHex(salt: string): `0x${string}` {
  return (/^0x[0-9a-fA-F]{64}$/.test(salt)
    ? (salt as `0x${string}`)
    : (keccak256(toHex(salt)) as `0x${string}`));
}

const MAX_PRICE_POINTS = 180;

let nextEventId = 1;
export function takeEventId(): number {
  return nextEventId++;
}

let nextCommitmentId = 1;
function takeCommitmentId(): number {
  return nextCommitmentId++;
}

function appendPrice(
  pool: NonNullable<WorldState["pool"]>,
  priceHistory: PricePoint[],
  block: number,
  epochId: number,
  swap?: { sizeEth: number; outUsdc: number },
): PricePoint[] {
  return [
    ...priceHistory,
    {
      block,
      epochId,
      activeUsd: pool.activeReserveUsdc / pool.activeReserveEth,
      passiveUsd: pool.passiveReserveUsdc / pool.passiveReserveEth,
      activeEth: pool.activeReserveEth,
      passiveEth: pool.passiveReserveEth,
      ts: Date.now(),
      swap,
    },
  ].slice(-MAX_PRICE_POINTS);
}

/** Empty world — every value fills in from a real source (wallet, chain,
 *  intel, contracts). Nothing here is fabricated. */
export function initialWorld(): WorldState {
  return {
    chain: {
      chainId: null,
      blockNumber: null,
      epochId: null,
      blocksUntilEpochEnd: null,
    },
    pool: null,
    wallet: { address: null, eth: null, slot: null },
    lp: {
      available: null,
      position: null,
      swapFeeBps: null,
      slotRevenueShareBps: null,
      soldCapacityEth: null,
      budgetEth: null,
      remainingCapacity: null,
    },
    slotPricePerEth: null,
    askPerEth: null,
    buyCapacityEth: null,
    intel: null,
    intelCalls: 0,
    graph: [],
    rejects: [],
    commitments: [],
    swaps: [],
    priceHistory: [],
    lastIntelError: null,
  };
}

export type Action =
  | { type: "BUY_SLOT"; sizeEth: number; pricePerEth: number }
  | { type: "COMMIT_MINT"; sizeEth: number; pricePerEth: number; salt: string }
  | { type: "REVEAL_SWAP"; sizeEth: number; salt: string }
  | { type: "SWAP_SUCCEEDED"; sizeEth: number; outUsdc: number; capacityUsed: number }
  | { type: "SWAP_REJECTED"; reason: RejectEvent["reason"]; tradeSize: number; detail: string }
  | { type: "INTEL_QUOTE"; quote: IntelQuote }
  | { type: "INTEL_ERROR"; message: string }
  /** connected wallet lands in reducer state — writes read it via stateRef */
  | { type: "WALLET_CONNECT"; address: string; eth: number | null }
  | { type: "WALLET_DISCONNECT" }
  /** Deployment manifest found for this chain — pools/panels unlock. */
  | { type: "DEPLOYMENT_LOADED"; pool: NonNullable<WorldState["pool"]>; slotPricePerEth: number }
  /** Ground truth from the hook: reserves + written ask. */
  | { type: "POOL_SYNC"; pool: NonNullable<WorldState["pool"]>; slotPricePerEth: number }
  /** Live mintable capacity for the current epoch (λ × hook balance − sold). */
  | { type: "CAPACITY_SYNC"; buyCapacityEth: number }
  /** ERC-1155 slot balance of the connected wallet for the CURRENT epoch. */
  | {
      type: "WALLET_SLOT_SYNC";
      capacity: number;
      /** last epoch's still-unexpired-balance — shown as an honest expiry */
      expired?: { epochId: number; capacity: number } | null;
    }
  /** LP module availability probe result. */
  | { type: "LP_AVAILABLE"; available: boolean }
  /** LP position + protocol constants, all from contract reads. */
  | {
      type: "LP_SYNC";
      position: {
        depositedEth: number;
        shares: number;
        claimableRevenueEth: number;
        claimableSwapFeesUsdc: number;
        withdrawableEth: number;
      };
      swapFeeBps: number;
      slotRevenueShareBps: number;
      soldCapacityEth: number;
      budgetEth: number;
      remainingCapacity: number;
    }
  /** A slot sale landed — the LP revenue feed. */
  | { type: "LP_SALE"; sizeEth: number; pricePaidEth: number; buyer: string };

/** Quote output of swapping sizeEth into the ACTIVE side only (constant product). */
export function quoteSwapOutUsdc(
  pool: NonNullable<WorldState["pool"]>,
  sizeEth: number,
): number {
  const k = pool.activeReserveEth * pool.activeReserveUsdc;
  const newEth = pool.activeReserveEth + sizeEth;
  const newUsdc = k / newEth;
  return pool.activeReserveUsdc - newUsdc;
}

function addReject(
  state: WorldState,
  reason: RejectEvent["reason"],
  tradeSize: number,
  detail: string,
): WorldState {
  return {
    ...state,
    rejects: [
      {
        id: takeEventId(),
        reason,
        epochId: state.chain.epochId ?? 0,
        blockNumber: state.chain.blockNumber ?? 0,
        tradeSize,
        detail,
        ts: Date.now(),
      },
      ...state.rejects,
    ],
  };
}

/**
 * Fill event from a REAL transaction receipt. Local state only logs the
 * event — reserves, slot balance and price history come from the chain
 * (POOL_SYNC on the next block poll), never from local math.
 */
function recordFill(
  state: WorldState,
  sizeEth: number,
  outUsdc: number,
  capacityUsed: number,
  fromCommitment: boolean,
): WorldState {
  const pool = state.pool;
  const epochId = state.chain.epochId;
  const blockNumber = state.chain.blockNumber;
  if (!pool || epochId === null || blockNumber === null) return state;
  return {
    ...state,
    swaps: [
      {
        epochId,
        blockNumber,
        sizeEth,
        outUsdc,
        ts: Date.now(),
      },
      ...state.swaps,
    ],
    priceHistory: appendPrice(
      pool,
      state.priceHistory,
      blockNumber,
      epochId,
      { sizeEth, outUsdc },
    ),
    graph: [
      {
        id: takeEventId(),
        kind: "consume",
        epochId,
        blockNumber,
        size: capacityUsed,
        fromCommitment,
        trader: state.wallet.address ?? "unknown",
        ts: Date.now(),
      },
      ...state.graph,
    ],
  };
}

export function reducer(state: WorldState, action: Action): WorldState {
  switch (action.type) {
    case "BUY_SLOT": {
      // mints require the connected hook contract and a written ask
      if (!state.pool || state.slotPricePerEth === null) return state;
      const cost = action.sizeEth * action.pricePerEth;
      const epochId = state.chain.epochId;
      const blockNumber = state.chain.blockNumber;
      if (epochId === null || blockNumber === null) return state;
      return {
        ...state,
        wallet: {
          ...state.wallet,
          eth: state.wallet.eth === null ? null : state.wallet.eth - cost,
          slot: { epochId, capacity: action.sizeEth },
        },
        graph: [
          {
            id: takeEventId(),
            kind: "mint",
            epochId,
            blockNumber,
            size: action.sizeEth,
            pricePaid: cost,
            trader: state.wallet.address ?? "unknown",
            ts: Date.now(),
          },
          ...state.graph,
        ],
      };
    }

    case "COMMIT_MINT": {
      // B2: pay fixed price, mint against H — size never enters the public payload
      if (!state.pool || state.slotPricePerEth === null) return state;
      const cost = action.sizeEth * action.pricePerEth;
      const epochId = state.chain.epochId;
      const blockNumber = state.chain.blockNumber;
      if (epochId === null || blockNumber === null) return state;
      const H = commitHash(action.sizeEth, epochId, saltToHex(action.salt));
      const id = takeCommitmentId();
      return {
        ...state,
        wallet: {
          ...state.wallet,
          eth: state.wallet.eth === null ? null : state.wallet.eth - cost,
          slot: { epochId, capacity: action.sizeEth, commitmentId: id },
        },
        commitments: [
          {
            id,
            epochId,
            H,
            size: action.sizeEth,
            salt: action.salt,
            pricePaid: cost,
            status: "committed",
            ts: Date.now(),
          },
          ...state.commitments,
        ],
        graph: [
          {
            id: takeEventId(),
            kind: "commit",
            epochId,
            blockNumber,
            size: 0,
            pricePaid: cost,
            H,
            trader: state.wallet.address ?? "unknown",
            ts: Date.now(),
          },
          ...state.graph,
        ],
      };
    }

    case "REVEAL_SWAP": {
      // C1: revealAndConsume(size, salt) — verify hash, emit reveal, then fill
      const slot = state.wallet.slot;
      const epochId = state.chain.epochId;
      if (!slot || epochId === null || slot.epochId !== epochId) {
        return addReject(state, "no-slot", action.sizeEth, REJECT_REASONS["no-slot"].detail);
      }
      const c =
        slot.commitmentId != null
          ? state.commitments.find((x) => x.id === slot.commitmentId)
          : null;
      if (!c || c.status !== "committed") {
        return addReject(state, "no-slot", action.sizeEth, REJECT_REASONS["no-slot"].detail);
      }
      if (commitHash(action.sizeEth, epochId, saltToHex(action.salt)) !== c.H) {
        return addReject(state, "bad-reveal", action.sizeEth, REJECT_REASONS["bad-reveal"].detail);
      }
      const revealed = state.commitments.map((x) =>
        x.id === c.id ? { ...x, status: "revealed" as const, revealedSize: action.sizeEth } : x,
      );
      const withReveal: WorldState = {
        ...state,
        commitments: revealed,
        graph: [
          {
            id: takeEventId(),
            kind: "reveal",
            epochId,
            blockNumber: state.chain.blockNumber ?? 0,
            size: action.sizeEth,
            H: c.H,
            trader: state.wallet.address ?? "unknown",
            ts: Date.now(),
          },
          ...state.graph,
        ],
      };
      const outUsdc = state.pool
        ? quoteSwapOutUsdc(state.pool, action.sizeEth)
        : 0;
      return recordFill(withReveal, action.sizeEth, outUsdc, action.sizeEth, true);
    }

    case "SWAP_SUCCEEDED": {
      return recordFill(state, action.sizeEth, action.outUsdc, action.capacityUsed, false);
    }

    case "SWAP_REJECTED": {
      return addReject(state, action.reason, action.tradeSize, action.detail);
    }

    case "WALLET_CONNECT": {
      return {
        ...state,
        wallet: { ...state.wallet, address: action.address, eth: action.eth },
      };
    }

    case "WALLET_DISCONNECT": {
      return {
        ...state,
        wallet: { address: null, eth: null, slot: null },
      };
    }

    case "INTEL_QUOTE": {
      return {
        ...state,
        intel: action.quote,
        askPerEth: action.quote.suggestedAskPerEth,
        slotPricePerEth: action.quote.suggestedAskPerEth,
        intelCalls: state.intelCalls + 1,
        lastIntelError: null,
      };
    }

    case "INTEL_ERROR": {
      return { ...state, lastIntelError: action.message };
    }

    case "DEPLOYMENT_LOADED":
    case "POOL_SYNC": {
      return { ...state, pool: action.pool, slotPricePerEth: action.slotPricePerEth };
    }

    case "CAPACITY_SYNC": {
      return { ...state, buyCapacityEth: action.buyCapacityEth };
    }

    case "LP_AVAILABLE": {
      return { ...state, lp: { ...state.lp, available: action.available } };
    }

    case "LP_SYNC": {
      return {
        ...state,
        lp: {
          ...state.lp,
          available: true,
          position: {
            depositedEth: action.position.depositedEth,
            shares: action.position.shares,
            claimableRevenueEth: action.position.claimableRevenueEth,
            claimableSwapFeesUsdc: action.position.claimableSwapFeesUsdc,
            withdrawableEth: action.position.withdrawableEth,
          },
          swapFeeBps: action.swapFeeBps,
          slotRevenueShareBps: action.slotRevenueShareBps,
          soldCapacityEth: action.soldCapacityEth,
          budgetEth: action.budgetEth,
          remainingCapacity: action.remainingCapacity,
        },
      };
    }

    case "LP_SALE": {
      return {
        ...state,
        graph: [
          {
            id: takeEventId(),
            kind: "mint" as const,
            epochId: state.chain.epochId ?? 0,
            blockNumber: state.chain.blockNumber ?? 0,
            size: action.sizeEth,
            pricePaid: action.pricePaidEth,
            trader: action.buyer,
            ts: Date.now(),
          },
          ...state.graph,
        ],
      };
    }

    case "LP_AVAILABLE": {
      return { ...state, lp: { ...state.lp, available: action.available } };
    }

    case "LP_SYNC": {
      return {
        ...state,
        lp: {
          ...state.lp,
          available: true,
          position: {
            depositedEth: action.position.depositedEth,
            shares: action.position.shares,
            claimableRevenueEth: action.position.claimableRevenueEth,
            claimableSwapFeesUsdc: action.position.claimableSwapFeesUsdc,
            withdrawableEth: action.position.withdrawableEth,
          },
          swapFeeBps: action.swapFeeBps,
          slotRevenueShareBps: action.slotRevenueShareBps,
          soldCapacityEth: action.soldCapacityEth,
          budgetEth: action.budgetEth,
          remainingCapacity: action.remainingCapacity,
        },
      };
    }

    case "LP_SALE": {
      return {
        ...state,
        graph: [
          {
            id: takeEventId(),
            kind: "mint" as const,
            epochId: state.chain.epochId ?? 0,
            blockNumber: state.chain.blockNumber ?? 0,
            size: action.sizeEth,
            pricePaid: action.pricePaidEth,
            trader: action.buyer,
            ts: Date.now(),
          },
          ...state.graph,
        ],
      };
    }

    case "WALLET_SLOT_SYNC": {
      const epochId = state.chain.epochId;
      const expiredSlot =
        action.expired === undefined ? (state.wallet.expiredSlot ?? null) : action.expired;
      const slot =
        action.capacity > 0 ? { epochId: epochId ?? 0, capacity: action.capacity } : null;
      const unchanged =
        (state.wallet.slot == null) === (slot == null) &&
        state.wallet.expiredSlot?.epochId === expiredSlot?.epochId &&
        state.wallet.expiredSlot?.capacity === expiredSlot?.capacity &&
        (slot == null || (state.wallet.slot != null && state.wallet.slot.capacity === slot.capacity));
      if (unchanged) return state;
      return { ...state, wallet: { ...state.wallet, slot, expiredSlot } };
    }

    default:
      return state;
  }
}
