import type { IntelQuote, PricePoint, RejectEvent, WorldState } from "./types";
import { REJECT_REASONS } from "./types";
import { commitHash } from "./hash";

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
    slotPricePerEth: null,
    askPerEth: null,
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
  /** Deployment manifest found for this chain — pools/panels unlock. */
  | { type: "DEPLOYMENT_LOADED"; pool: NonNullable<WorldState["pool"]>; slotPricePerEth: number }
  /** Ground truth from the hook: reserves + written ask. */
  | { type: "POOL_SYNC"; pool: NonNullable<WorldState["pool"]>; slotPricePerEth: number }
  /** ERC-1155 slot balance of the connected wallet for the CURRENT epoch. */
  | { type: "WALLET_SLOT_SYNC"; capacity: number };

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

/** Shared fill path — executes against the live pool only. */
function fillSwap(
  state: WorldState,
  sizeEth: number,
  outUsdc: number,
  capacityUsed: number,
  fromCommitment: boolean,
): WorldState {
  const pool = state.pool;
  const slot = state.wallet.slot;
  const epochId = state.chain.epochId;
  const blockNumber = state.chain.blockNumber;
  if (!pool || !slot || epochId === null || blockNumber === null) return state;
  const k = pool.activeReserveEth * pool.activeReserveUsdc;
  const newEth = pool.activeReserveEth + sizeEth;
  const newUsdc = k / newEth;
  const nextPool = {
    ...pool,
    activeReserveEth: newEth,
    activeReserveUsdc: newUsdc,
  };
  return {
    ...state,
    wallet: {
      ...state.wallet,
      slot: {
        ...slot,
        capacity: Math.max(0, slot.capacity - capacityUsed),
      },
    },
    pool: nextPool,
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
      nextPool,
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
      const H = commitHash(action.sizeEth, epochId, action.salt);
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
      if (commitHash(action.sizeEth, epochId, action.salt) !== c.H) {
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
      return fillSwap(withReveal, action.sizeEth, outUsdc, action.sizeEth, true);
    }

    case "SWAP_SUCCEEDED": {
      return fillSwap(state, action.sizeEth, action.outUsdc, action.capacityUsed, false);
    }

    case "SWAP_REJECTED": {
      return addReject(state, action.reason, action.tradeSize, action.detail);
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

    case "WALLET_SLOT_SYNC": {
      const epochId = state.chain.epochId;
      if (action.capacity <= 0) {
        return state.wallet.slot ? { ...state, wallet: { ...state.wallet, slot: null } } : state;
      }
      return {
        ...state,
        wallet: { ...state.wallet, slot: { epochId: epochId ?? 0, capacity: action.capacity } },
      };
    }

    default:
      return state;
  }
}
