export type RejectReason =
  | "no-slot"
  | "oversize"
  | "same-block-passive-unlock"
  | "bad-reveal"
  | "unsafe-withdraw"
  | "epoch-expired";

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
  "unsafe-withdraw": {
    code: "unsafe-withdraw",
    title: "Unsafe withdraw",
    detail:
      "withdraw reverted: it would orphan active capacity already sold this epoch.",
  },
  "epoch-expired": {
    code: "epoch-expired",
    title: "Epoch expired",
    detail:
      "slot id not current epoch — unused cadence slots expire worthless at refresh.",
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
  /** M17: stable hash of the OBSERVED settlement proof (server-side), bound
   *  to the on-chain ask via setSlotPriceFromIntel — null = unverified. */
  settlementHash: string | null;
}

export interface Wallet {
  /** connected EIP-1193 account — null when no wallet is connected */
  address: string | null;
  /** live ETH balance of the connected account, from the chain */
  eth: number | null;
  /** ERC-1155 balance: capacity notional held for the CURRENT epoch only —
   *  real once the cadence hook contract is connected */
  slot: { epochId: number; capacity: number; commitmentId?: number } | null;
  /** the wallet held capacity for a PAST epoch — it expired worthless at
   *  refresh; shown as an honest expiry note instead of a silent zero */
  expiredSlot?: { epochId: number; capacity: number } | null;
}

/** LP position — all values are contract reads (null until the LP module
 *  is deployed on the target chain). */
export interface LpPosition {
  /** ETH the LP deposited, per the contract */
  depositedEth: number | null;
  /** share units — equity in the pool, NOT cadence-slot capacity */
  shares: number | null;
  /** claimable slot-sale revenue, in ETH (≠ swap fees) */
  claimableRevenueEth: number | null;
  /** claimable swap fees, in USDC (≠ slot revenue) */
  claimableSwapFeesUsdc: number | null;
  /** withdrawable ETH under active/passive safety bounds */
  withdrawableEth: number | null;
}

export interface LpState {
  /** true when the deployed hook answers LP-module reads; false = honest
   *  "waiting for LP module" state; null = probe pending */
  available: boolean | null;
  position: LpPosition | null;
  /** protocol constants from the contract (defaults shown while unwired) */
  swapFeeBps: number | null;
  slotRevenueShareBps: number | null;
  /** capacity sold (minted + committed) this epoch, in ETH */
  soldCapacityEth: number | null;
  /** this epoch's active capacity budget, in ETH (hook read) */
  budgetEth: number | null;
  /** remaining mintable capacity for this epoch (slots read) */
  remainingCapacity: number | null;
}

/** Live chain state — read from a real RPC, never simulated. */
export interface ChainState {
  chainId: number | null;
  blockNumber: number | null;
  /** cadence epoch = floor(block / epochLengthBlocks), derived from the real chain */
  epochId: number | null;
  /** blocks remaining in the current cadence epoch */
  blocksUntilEpochEnd: number | null;
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
  chain: ChainState;
  /** live pool state from the cadence hook — null until contracts are connected */
  pool: PoolState | null;
  wallet: Wallet;
  /** LP module state — null fields until the LP module is on-chain */
  lp: LpState;
  /** live mintable capacity for the CURRENT epoch after the next refresh:
   *  λ × hook ETH balance − minted − committed. Feeds the /buy + /privacy
   *  size guards — null until contracts are connected. */
  buyCapacityEth: number | null;
  /** slot ask written by paid intel — null until a real intel call lands */
  slotPricePerEth: number | null;
  askPerEth: number | null;
  intel: IntelQuote | null;
  intelCalls: number;
  graph: GraphEvent[];
  rejects: RejectEvent[];
  commitments: CadenceCommitment[];
  swaps: { epochId: number; blockNumber: number; sizeEth: number; outUsdc: number; ts: number }[];
  priceHistory: PricePoint[];
  lastIntelError: string | null;
}

export const EPOCH_LENGTH_BLOCKS = 12;

export function epochFromBlock(block: number): number {
  return Math.floor(block / EPOCH_LENGTH_BLOCKS);
}

export function blocksUntilEpochEnd(block: number): number {
  return EPOCH_LENGTH_BLOCKS - (block % EPOCH_LENGTH_BLOCKS);
}

export function activePriceUsd(pool: PoolState): number {
  return pool.activeReserveUsdc / pool.activeReserveEth;
}
