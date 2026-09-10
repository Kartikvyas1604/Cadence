import { BigInt as GraphBigInt, log } from "@graphprotocol/graph-ts";
import {
  SlotMinted,
  SlotCommitted,
  SlotRevealed,
  SlotConsumed,
} from "../generated/CadenceSlots/CadenceSlots";
import { CadenceSwap, EpochRefreshed } from "../generated/CadenceHook/CadenceHook";
import { CadenceSwap as CadenceSwapEvent } from "../generated/CadenceHook/CadenceHook";
import {
  SlotRevenueAccrued as SlotRevenueAccruedEvent,
  RevenueClaimed as RevenueClaimedEvent,
  SwapFeeClaimed as SwapFeeClaimedEvent,
  ProtocolRevenueWithdrawn as ProtocolRevenueWithdrawnEvent,
  TreasuryUpdated as TreasuryUpdatedEvent,
} from "../generated/CadenceHook/CadenceHook";
import {
  CadenceMint,
  CadenceCommit,
  CadenceReveal,
  CadenceConsume,
  CadenceSwap as CadenceSwapEntity,
  PoolState,
  Global,
  SlotRevenueAccrued,
  RevenueClaimed,
  SwapFeeClaimed,
  ProtocolRevenueWithdrawn,
  TreasuryUpdated,
} from "../generated/schema";

const GLOBAL_ID = "global";

function bump(field: string, amount: i32 = 1): void {
  let g = Global.load(GLOBAL_ID);
  if (g == null) {
    g = new Global(GLOBAL_ID);
    g.totalMinted = new GraphBigInt(0);
    g.totalCommitted = new GraphBigInt(0);
    g.totalRevealed = new GraphBigInt(0);
    g.totalConsumed = new GraphBigInt(0);
    g.totalSwaps = new GraphBigInt(0);
  }
  if (field == "minted") g.totalMinted = g.totalMinted.plus(new GraphBigInt(amount));
  if (field == "committed") g.totalCommitted = g.totalCommitted.plus(new GraphBigInt(amount));
  if (field == "revealed") g.totalRevealed = g.totalRevealed.plus(new GraphBigInt(amount));
  if (field == "consumed") g.totalConsumed = g.totalConsumed.plus(new GraphBigInt(amount));
  if (field == "swaps") g.totalSwaps = g.totalSwaps.plus(new GraphBigInt(amount));
  g.save();
}

// ---------------------------------------------------------------------
// CadenceSlots events — mint / commit / reveal / consume
// ---------------------------------------------------------------------

export function handleSlotMinted(event: SlotMinted): void {
  const e = new CadenceMint(event.transaction.hash.toHexString() + '-' + event.logIndex.toString());
  e.epochId = event.params.epochId;
  e.buyer = event.params.buyer;
  e.size = event.params.size;
  e.pricePaid = event.params.pricePaid;
  e.blockNumber = event.block.number;
  e.timestamp = event.block.timestamp;
  e.txHash = event.transaction.hash;
  e.save();
  bump("minted");
}

export function handleSlotCommitted(event: SlotCommitted): void {
  // finance-6: the commit id is the COMMITMENT HASH H (not tx-log) so the
  // reveal handler can always load CadenceCommit.load(H.toHex())
  const e = new CadenceCommit(event.params.H.toHex());
  e.epochId = event.params.epochId;
  e.H = event.params.H;
  e.payer = event.params.payer;
  e.escrow = event.params.escrow;
  e.blockNumber = event.block.number;
  e.timestamp = event.block.timestamp;
  e.txHash = event.transaction.hash;
  e.save();
  bump("committed");
}

export function handleSlotRevealed(event: SlotRevealed): void {
  const e = new CadenceReveal(event.transaction.hash.toHexString() + '-' + event.logIndex.toString());
  e.epochId = event.params.epochId;
  e.H = event.params.H;
  e.trader = event.params.trader;
  e.size = event.params.size;
  // finance-4: the ABI names the 5th field `consumed` but it carries the ETH
  // cost paid (commit-time price x size) — indexed as pricePaid; the consumed
  // capacity IS size (revealAndConsume burns size against the epoch budget)
  e.pricePaid = event.params.consumed;
  e.blockNumber = event.block.number;
  e.timestamp = event.block.timestamp;
  e.txHash = event.transaction.hash;
  e.save();

  // link commit <-> reveal (size becomes public HERE, not before)
  const commit = CadenceCommit.load(event.params.H.toHex());
  if (commit != null) {
    commit.reveal = e.id;
    commit.save();
  }
  e.commit = commit != null ? commit.id : event.params.H.toHex();
  bump("revealed");
}

export function handleSlotConsumed(event: SlotConsumed): void {
  const e = new CadenceConsume(event.transaction.hash.toHexString() + '-' + event.logIndex.toString());
  e.epochId = event.params.epochId;
  e.trader = event.params.trader;
  e.size = event.params.size;
  e.blockNumber = event.block.number;
  e.timestamp = event.block.timestamp;
  e.txHash = event.transaction.hash;
  e.save();
  bump("consumed");
}

// ---------------------------------------------------------------------
// CadenceHook events — fills + epoch partition
// ---------------------------------------------------------------------

export function handleCadenceSwap(event: CadenceSwap): void {
  const e = new CadenceSwapEntity(event.transaction.hash.toHexString() + '-' + event.logIndex.toString());
  e.epochId = event.params.epochId;
  e.trader = event.params.trader;
  e.zeroForOne = event.params.zeroForOne;
  e.sizeInEth = event.params.sizeInEth;
  e.outAmount = event.params.outAmount;
  e.fromCommitment = event.params.fromCommitment;
  e.blockNumber = event.block.number;
  e.timestamp = event.block.timestamp;
  e.txHash = event.transaction.hash;
  e.save();
  bump("swaps");
}

export function handleEpochRefreshed(event: EpochRefreshed): void {
  const p = new PoolState(event.params.epochId.toString());
  p.epochId = event.params.epochId;
  p.activeEth = event.params.activeEth;
  p.activeUsdc = event.params.activeUsdc;
  p.passiveEth = event.params.passiveEth;
  p.passiveUsdc = event.params.passiveUsdc;
  p.capacityBudgetEth = event.params.activeEth;
  p.timestamp = event.block.timestamp;
  p.save();
  log.info("epoch refreshed: {}", [event.params.epochId.toString()]);
}

// ---------------------------------------------------------------------
// CadenceHook money events (finance-5) — LP/protocol ledger, event-auditable
// ---------------------------------------------------------------------

export function handleSlotRevenueAccrued(event: SlotRevenueAccruedEvent): void {
  const e = new SlotRevenueAccrued(event.transaction.hash.toHexString() + '-' + event.logIndex.toString());
  e.epochId = event.params.epochId;
  e.proceeds = event.params.proceeds;
  e.blockNumber = event.block.number;
  e.timestamp = event.block.timestamp;
  e.txHash = event.transaction.hash;
  e.save();
}

export function handleRevenueClaimed(event: RevenueClaimedEvent): void {
  const e = new RevenueClaimed(event.transaction.hash.toHexString() + '-' + event.logIndex.toString());
  e.lp = event.params.lp;
  e.amountEth = event.params.amountEth;
  e.blockNumber = event.block.number;
  e.timestamp = event.block.timestamp;
  e.txHash = event.transaction.hash;
  e.save();
}

export function handleSwapFeeClaimed(event: SwapFeeClaimedEvent): void {
  const e = new SwapFeeClaimed(event.transaction.hash.toHexString() + '-' + event.logIndex.toString());
  e.lp = event.params.lp;
  e.amountUsdc = event.params.amountUsdc;
  e.blockNumber = event.block.number;
  e.timestamp = event.block.timestamp;
  e.txHash = event.transaction.hash;
  e.save();
}

export function handleProtocolRevenueWithdrawn(event: ProtocolRevenueWithdrawnEvent): void {
  const e = new ProtocolRevenueWithdrawn(event.transaction.hash.toHexString() + '-' + event.logIndex.toString());
  e.to = event.params.to;
  e.amountEth = event.params.amount;
  e.blockNumber = event.block.number;
  e.timestamp = event.block.timestamp;
  e.txHash = event.transaction.hash;
  e.save();
}

export function handleTreasuryUpdated(event: TreasuryUpdatedEvent): void {
  const e = new TreasuryUpdated(event.transaction.hash.toHexString() + '-' + event.logIndex.toString());
  e.previous = event.params.previous;
  e.current = event.params.current;
  e.blockNumber = event.block.number;
  e.timestamp = event.block.timestamp;
  e.txHash = event.transaction.hash;
  e.save();
}
