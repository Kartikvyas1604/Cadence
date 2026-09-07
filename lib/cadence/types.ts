export type RejectReason =
  | "no-slot"
  | "oversize"
  | "same-block-passive-unlock"
  | "bad-reveal";

export interface RejectReasonMeta {
  code: RejectReason;
  title: string;
  detail: string;
}

export const REJECT_REASONS: Record<RejectReason, RejectReasonMeta> = {
  "no-slot": {
    code: "no-slot",
    title: "No cadence slot",
    detail: "beforeSwap reverted: trader holds no cadence slot for this epoch.",
  },
  oversize: {
    code: "oversize",
    title: "Oversize vs slot",
    detail:
      "beforeSwap reverted: trade size exceeds cadence slot capacity for this epoch.",
  },
  "same-block-passive-unlock": {
    code: "same-block-passive-unlock",
    title: "Passive unlock attempt",
    detail:
      "beforeSwap reverted: order split would reach passive reserves in the same block.",
  },
  "bad-reveal": {
    code: "bad-reveal",
    title: "Bad reveal",
    detail:
      "beforeSwap reverted: reveal(size, salt) does not hash to the committed H.",
  },
};

export type GraphEventKind =
  | "mint"
  | "burn"
  | "consume"
  | "commit"
  | "reveal";

export interface GraphEvent {
  id: number;
  kind: GraphEventKind;
  epochId: number;
  blockNumber: number;
  /** capacity notional, in ETH — 0 and hidden for commit events until reveal */
  size: number;
  /** paid for a mint, in ETH */
  pricePaid?: number;
  /** commitment hash — present on commit / reveal events */
  H?: string;
  /** consume came from a revealed Private Cadence Intent */
  fromCommitment?: boolean;
  trader: string;
  ts: number;
}

export type CommitmentStatus = "committed" | "revealed" | "expired";

export interface CadenceCommitment {
  id: number;
  epochId: number;
  /** H = hash(size, epochId, salt) — public at commit */
  H: string;
  /** private until reveal */
  size: number;
  salt: string;
  pricePaid: number;
  status: CommitmentStatus;
  revealedSize?: number;
  ts: number;
}

export interface RejectEvent {
  id: number;
  reason: RejectReason;
  epochId: number;
  blockNumber: number;
  tradeSize: number;
  detail: string;
  ts: number;
}

export interface IntelQuote {
  suggestedAskPerEth: number;
  asOf: number;
  rationale: string;
  source: string;
  costUsd: number;
}

export interface Wallet {
  address: string;
  eth: number;
  usdc: number;
  /** ERC-1155 balance: capacity notional held for the CURRENT epoch only */
  slot: { epochId: number; capacity: number; commitmentId?: number } | null;
}

export interface PoolState {
  pair: string;
  lambdaBps: number;
  epochLengthBlocks: number;
  activeReserveEth: number;
  activeReserveUsdc: number;
  passiveReserveEth: number;
  passiveReserveUsdc: number;
}

export interface PricePoint {
  block: number;
  epochId: number;
  activeUsd: number;
  passiveUsd: number;
  /** active reserve depth, in ETH — for the depth view */
  activeEth: number;
  /** passive reserve depth, in ETH — flat within an epoch */
  passiveEth: number;
  /** wall-clock time the block landed — anchors tape scroll/ease */
  ts: number;
  swap?: { sizeEth: number; outUsdc: number };
}

export interface WorldState {
  blockNumber: number;
  epochId: number;
  blocksUntilEpochEnd: number;
  pool: PoolState;
  wallet: Wallet;
  /** fixed primary price, ETH per 1 ETH of slot capacity */
  slotPricePerEth: number;
  askPerEth: number;
  intel: IntelQuote | null;
  intelCalls: number;
  graph: GraphEvent[];
  rejects: RejectEvent[];
  commitments: CadenceCommitment[];
  swaps: { epochId: number; blockNumber: number; sizeEth: number; outUsdc: number; ts: number }[];
  priceHistory: PricePoint[];
  lastIntelError: string | null;
}

export const DEFAULT_ASK_PER_ETH = 0.002;

export function slotPrice(state: WorldState): number {
  return state.intel?.suggestedAskPerEth ?? DEFAULT_ASK_PER_ETH;
}

export function activePriceUsd(pool: PoolState): number {
  return pool.activeReserveUsdc / pool.activeReserveEth;
}
