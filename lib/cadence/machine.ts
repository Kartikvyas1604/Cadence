import type { GraphEvent, IntelQuote, PricePoint, RejectEvent, WorldState } from "./types";
import { DEFAULT_ASK_PER_ETH, REJECT_REASONS } from "./types";
import { commitHash } from "./hash";

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

let nextCommitmentId = 1;
function takeCommitmentId(): number {
  return nextCommitmentId++;
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
      activeEth: pool.activeReserveEth,
      passiveEth: pool.passiveReserveEth,
      ts: Date.now(),
      swap,
    },
  ].slice(-MAX_PRICE_POINTS);
}

const SEED_POINTS = 120;

/** Deterministic PRNG so the seeded history renders identically on server and client. */
function seedNoise(i: number): number {
  let s = (i * 2654435761) % 4294967296;
  s ^= s << 13;
  s >>>= 0;
  s ^= s >>> 17;
  s ^= s << 5;
  s >>>= 0;
  return s / 4294967296;
}

/**
 * 120 blocks of prior pool history so the tape opens full instead of empty.
 * Fully deterministic — no Date.now / Math.random — so hydration never mismatches.
 */
function seedPriceHistory(
  startBlock: number,
  startEpoch: number,
  epochLength: number,
): PricePoint[] {
  const pts: PricePoint[] = [];
  const firstEpoch = startEpoch - epochLength;
  for (let i = 0; i < SEED_POINTS; i++) {
    const inEpoch = i % epochLength;
    const epochId = firstEpoch + Math.floor(i / epochLength);
    const n = seedNoise(i);
    // active price wanders gently around the pool spot
    const activeUsd =
      2500 + Math.sin(i / 6) * 10 + (n - 0.5) * 6;
    // passive reprices only at refresh — a flat step per epoch
    const passiveUsd = 2496 + ((epochId * 7) % 11);
    // active depth drains through the epoch, resets at refresh
    const activeEth = 30 - inEpoch * 0.55 + (n - 0.5) * 0.4;
    pts.push({
      block: startBlock - (SEED_POINTS - i),
      epochId,
      activeUsd,
      passiveUsd,
      activeEth,
      passiveEth: 90,
      // seeded as if each block landed one interval apart
      ts: Date.now() - (SEED_POINTS - i) * BLOCK_INTERVAL_MS,
    });
  }
  return pts;
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
    commitments: [],
    swaps: [],
    priceHistory: seedPriceHistory(
      41_200_100,
      3_204,
      EPOCH_LENGTH_BLOCKS,
    ),
    lastIntelError: null,
  };
}

export type Action =
  | { type: "TICK" }
  | { type: "BUY_SLOT"; sizeEth: number; pricePerEth: number }
  | { type: "COMMIT_MINT"; sizeEth: number; pricePerEth: number; salt: string }
  | { type: "REVEAL_SWAP"; sizeEth: number; salt: string }
  | { type: "SWAP_SUCCEEDED"; sizeEth: number; outUsdc: number; capacityUsed: number }
  | { type: "SWAP_REJECTED"; reason: RejectEvent["reason"]; tradeSize: number; detail: string }
  | { type: "INTEL_QUOTE"; quote: IntelQuote }
  | { type: "INTEL_ERROR"; message: string };

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
        epochId: state.epochId,
        blockNumber: state.blockNumber,
        tradeSize,
        detail,
        ts: Date.now(),
      },
      ...state.rejects,
    ],
  };
}

/** Shared fill path for the public swap and the reveal-on-consume path. */
function fillSwap(
  state: WorldState,
  sizeEth: number,
  outUsdc: number,
  capacityUsed: number,
  fromCommitment: boolean,
): WorldState {
  const k = state.pool.activeReserveEth * state.pool.activeReserveUsdc;
  const newEth = state.pool.activeReserveEth + sizeEth;
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
      usdc: state.wallet.usdc + outUsdc,
      slot: {
        epochId: state.epochId,
        capacity: Math.max(0, state.wallet.slot!.capacity - capacityUsed),
      },
    },
    pool,
    swaps: [
      {
        epochId: state.epochId,
        blockNumber: state.blockNumber,
        sizeEth,
        outUsdc,
        ts: Date.now(),
      },
      ...state.swaps,
    ],
    priceHistory: appendPrice(
      pool,
      state.priceHistory,
      state.blockNumber,
      state.epochId,
      { sizeEth, outUsdc },
    ),
    graph: [
      {
        id: takeEventId(),
        kind: "consume",
        epochId: state.epochId,
        blockNumber: state.blockNumber,
        size: capacityUsed,
        fromCommitment,
        trader: state.wallet.address,
        ts: Date.now(),
      },
      ...state.graph,
    ],
  };
}

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
        // Ambient solver flow consumes active depth within the same block —
        // folded into TICK so the tape appends exactly one point per block.
        let pool = state.pool;
        let graph = state.graph;
        if (Math.random() < 0.3) {
          const size = 0.4 + Math.random() * 1.8;
          const out = quoteSwapOutUsdc(pool, size);
          pool = {
            ...pool,
            activeReserveEth: pool.activeReserveEth + size,
            activeReserveUsdc: pool.activeReserveUsdc - out,
          };
          if (Math.random() < 0.35) {
            graph = [
              {
                id: takeEventId(),
                kind: "consume",
                epochId: state.epochId,
                blockNumber: block,
                size,
                trader: otherTrader(),
                ts: Date.now(),
              },
              ...graph,
            ];
          }
        }
        return {
          ...state,
          blockNumber: block,
          blocksUntilEpochEnd: remaining,
          pool,
          priceHistory: appendPrice(pool, state.priceHistory, block, state.epochId),
          graph,
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
        // unrevealed Private Cadence Intents expire with the epoch
        commitments: state.commitments.map((c) =>
          c.status === "committed" && c.epochId === state.epochId
            ? { ...c, status: "expired" as const }
            : c,
        ),
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
      return fillSwap(state, action.sizeEth, action.outUsdc, action.capacityUsed, false);
    }

    case "COMMIT_MINT": {
      // B2: pay fixed price, mint against H — size never enters the public payload
      const cost = action.sizeEth * action.pricePerEth;
      const H = commitHash(action.sizeEth, state.epochId, action.salt);
      const id = takeCommitmentId();
      return {
        ...state,
        wallet: {
          ...state.wallet,
          eth: state.wallet.eth - cost,
          slot: { epochId: state.epochId, capacity: action.sizeEth, commitmentId: id },
        },
        commitments: [
          {
            id,
            epochId: state.epochId,
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
            epochId: state.epochId,
            blockNumber: state.blockNumber,
            size: 0,
            pricePaid: cost,
            H,
            trader: state.wallet.address,
            ts: Date.now(),
          },
          ...state.graph,
        ],
      };
    }

    case "REVEAL_SWAP": {
      // C1: revealAndConsume(size, salt) — verify hash, emit SlotRevealed, then fill
      const slot = state.wallet.slot;
      const c =
        slot && slot.epochId === state.epochId && slot.commitmentId != null
          ? state.commitments.find((x) => x.id === slot.commitmentId)
          : null;
      if (!c || c.status !== "committed") {
        return addReject(state, "no-slot", action.sizeEth, REJECT_REASONS["no-slot"].detail);
      }
      if (commitHash(action.sizeEth, state.epochId, action.salt) !== c.H) {
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
            epochId: state.epochId,
            blockNumber: state.blockNumber,
            size: action.sizeEth,
            H: c.H,
            trader: state.wallet.address,
            ts: Date.now(),
          },
          ...state.graph,
        ],
      };
      const outUsdc = quoteSwapOutUsdc(state.pool, action.sizeEth);
      return fillSwap(withReveal, action.sizeEth, outUsdc, action.sizeEth, true);
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

    default:
      return state;
  }
}
