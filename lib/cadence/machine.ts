import type { GraphEvent, IntelQuote, PricePoint, RejectEvent, WorldState } from "./types";
import { DEFAULT_ASK_PER_ETH } from "./types";

export const LAMBDA_BPS = 2500;
export const EPOCH_LENGTH_BLOCKS = 12;
export const BLOCK_INTERVAL_MS = 1800;
export const ETH_START = 8;
export const USDC_START = 25_000;

const MAX_PRICE_POINTS = 180;

const TRADERS = [
  "0x3fA9…c21B",
  "0x88dE…04a7",
  "0x1c0F…9eD3",
  "0xbE42…77aF",
  "0x77AA…d910",
  "0x09Fe…b6C4",
];

let nextEventId = 1;
export function takeEventId(): number {
  return nextEventId++;
}

export function otherTrader(): string {
  return TRADERS[Math.floor(Math.random() * TRADERS.length)];
}

function appendPrice(
  pool: WorldState["pool"],
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
      swap,
    },
  ].slice(-MAX_PRICE_POINTS);
}

export function createWorld(): WorldState {
  const activeEth = 120;
  const price = 2_500;
  return {
    blockNumber: 41_200_100,
    epochId: 3_204,
    blocksUntilEpochEnd: EPOCH_LENGTH_BLOCKS,
    pool: {
      pair: "ETH / USDC",
      lambdaBps: LAMBDA_BPS,
      epochLengthBlocks: EPOCH_LENGTH_BLOCKS,
      activeReserveEth: activeEth,
      activeReserveUsdc: activeEth * price,
      passiveReserveEth: activeEth * 3,
      passiveReserveUsdc: activeEth * 3 * price,
    },
    wallet: {
      address: "0xApr0…0001",
      eth: ETH_START,
      usdc: USDC_START,
      slot: null,
    },
    slotPricePerEth: DEFAULT_ASK_PER_ETH,
    askPerEth: DEFAULT_ASK_PER_ETH,
    intel: null,
    intelCalls: 0,
    graph: [],
    rejects: [],
    swaps: [],
    priceHistory: [],
    lastIntelError: null,
  };
}

export type Action =
  | { type: "TICK" }
  | { type: "BUY_SLOT"; sizeEth: number; pricePerEth: number }
  | { type: "SWAP_SUCCEEDED"; sizeEth: number; outUsdc: number; capacityUsed: number }
  | { type: "SWAP_REJECTED"; reason: RejectEvent["reason"]; tradeSize: number; detail: string }
  | { type: "OTHERS_CONSUME" }
  | { type: "INTEL_QUOTE"; quote: IntelQuote }
  | { type: "INTEL_ERROR"; message: string };

/** Quote output of swapping sizeEth into the ACTIVE side only (constant product). */
export function quoteSwapOutUsdc(
  pool: WorldState["pool"],
  sizeEth: number,
): number {
  const k = pool.activeReserveEth * pool.activeReserveUsdc;
  const newEth = pool.activeReserveEth + sizeEth;
  const newUsdc = k / newEth;
  return pool.activeReserveUsdc - newUsdc;
}

export function reducer(state: WorldState, action: Action): WorldState {
  switch (action.type) {
    case "TICK": {
      const block = state.blockNumber + 1;
      const remaining = state.blocksUntilEpochEnd - 1;
      if (remaining > 0) {
        return {
          ...state,
          blockNumber: block,
          blocksUntilEpochEnd: remaining,
          priceHistory: appendPrice(state.pool, state.priceHistory, block, state.epochId),
        };
      }
      // Epoch refresh: expire prior seats, refresh active = λ × total, new epochId
      const totalEth = state.pool.activeReserveEth + state.pool.passiveReserveEth;
      const totalUsdc = state.pool.activeReserveUsdc + state.pool.passiveReserveUsdc;
      const activeShare = state.pool.lambdaBps / 10_000;
      const graph: GraphEvent[] = state.wallet.slot
        ? [
            {
              id: takeEventId(),
              kind: "burn",
              epochId: state.epochId,
              blockNumber: block,
              size: state.wallet.slot.capacity,
              trader: state.wallet.address,
              ts: Date.now(),
            },
            ...state.graph,
          ]
        : state.graph;
      const pool = {
        ...state.pool,
        activeReserveEth: totalEth * activeShare,
        activeReserveUsdc: totalUsdc * activeShare,
        passiveReserveEth: totalEth * (1 - activeShare),
        passiveReserveUsdc: totalUsdc * (1 - activeShare),
      };
      return {
        ...state,
        blockNumber: block,
        epochId: state.epochId + 1,
        blocksUntilEpochEnd: state.pool.epochLengthBlocks,
        wallet: { ...state.wallet, slot: null },
        graph,
        pool,
        priceHistory: appendPrice(pool, state.priceHistory, block, state.epochId + 1),
      };
    }

    case "BUY_SLOT": {
      const cost = action.sizeEth * action.pricePerEth;
      return {
        ...state,
        wallet: {
          ...state.wallet,
          eth: state.wallet.eth - cost,
          slot: { epochId: state.epochId, capacity: action.sizeEth },
        },
        graph: [
          {
            id: takeEventId(),
            kind: "mint",
            epochId: state.epochId,
            blockNumber: state.blockNumber,
            size: action.sizeEth,
            pricePaid: cost,
            trader: state.wallet.address,
            ts: Date.now(),
          },
          ...state.graph,
        ],
      };
    }

    case "SWAP_SUCCEEDED": {
      const k = state.pool.activeReserveEth * state.pool.activeReserveUsdc;
      const newEth = state.pool.activeReserveEth + action.sizeEth;
      const newUsdc = k / newEth;
      const pool = {
        ...state.pool,
        activeReserveEth: newEth,
        activeReserveUsdc: newUsdc,
        passiveReserveEth: state.pool.passiveReserveEth,
        passiveReserveUsdc: state.pool.passiveReserveUsdc,
      };
      return {
        ...state,
        wallet: {
          ...state.wallet,
          usdc: state.wallet.usdc + action.outUsdc,
          slot: {
            epochId: state.epochId,
            capacity: Math.max(0, state.wallet.slot!.capacity - action.capacityUsed),
          },
        },
        pool,
        swaps: [
          {
            epochId: state.epochId,
            blockNumber: state.blockNumber,
            sizeEth: action.sizeEth,
            outUsdc: action.outUsdc,
            ts: Date.now(),
          },
          ...state.swaps,
        ],
        priceHistory: appendPrice(
          pool,
          state.priceHistory,
          state.blockNumber,
          state.epochId,
          { sizeEth: action.sizeEth, outUsdc: action.outUsdc },
        ),
        graph: [
          {
            id: takeEventId(),
            kind: "consume",
            epochId: state.epochId,
            blockNumber: state.blockNumber,
            size: action.capacityUsed,
            trader: state.wallet.address,
            ts: Date.now(),
          },
          ...state.graph,
        ],
      };
    }

    case "SWAP_REJECTED": {
      return {
        ...state,
        rejects: [
          {
            id: takeEventId(),
            reason: action.reason,
            epochId: state.epochId,
            blockNumber: state.blockNumber,
            tradeSize: action.tradeSize,
            detail: action.detail,
            ts: Date.now(),
          },
          ...state.rejects,
        ],
      };
    }

    case "OTHERS_CONSUME": {
      // Ambient solver flow consumes active capacity, shrinking it over the epoch
      const size = 0.4 + Math.random() * 1.8;
      const out = quoteSwapOutUsdc(state.pool, size);
      const pool = {
        ...state.pool,
        activeReserveEth: state.pool.activeReserveEth + size,
        activeReserveUsdc: state.pool.activeReserveUsdc - out,
      };
      return {
        ...state,
        pool,
        priceHistory: appendPrice(pool, state.priceHistory, state.blockNumber, state.epochId),
        graph:
          Math.random() < 0.35
            ? [
                {
                  id: takeEventId(),
                  kind: "consume",
                  epochId: state.epochId,
                  blockNumber: state.blockNumber,
                  size,
                  trader: otherTrader(),
                  ts: Date.now(),
                },
                ...state.graph,
              ]
            : state.graph,
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

    default:
      return state;
  }
}
