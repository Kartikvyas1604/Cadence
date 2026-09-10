import assert from "node:assert/strict";
import { test } from "node:test";
import { initialWorld, reducer, quoteSwapOutUsdc } from "../lib/cadence/machine";
import type { PoolState, WorldState } from "../lib/cadence/types";

const POOL: PoolState = {
  pair: "ETH/USDC",
  lambdaBps: 2500,
  epochLengthBlocks: 12,
  activeReserveEth: 250,
  activeReserveUsdc: 750_000,
  passiveReserveEth: 750,
  passiveReserveUsdc: 2_250_000,
};

function withPool(): WorldState {
  const s = initialWorld();
  return reducer(s, { type: "POOL_SYNC", pool: POOL, slotPricePerEth: 0.001 });
}

/** Live chain context — the provider derives this from the RPC. */
function withEpoch(): WorldState {
  return {
    ...withPool(),
    chain: { chainId: 31337, blockNumber: 24, epochId: 2, blocksUntilEpochEnd: 7 },
  };
}

test("POOL_SYNC sets pool truth and the written ask", () => {
  const s = withPool();
  assert.ok(s.pool);
  assert.equal(s.slotPricePerEth, 0.001);
});

test("WALLET_SLOT_SYNC stores the current-epoch capacity; zero clears it", () => {
  let s = withPool();
  s = reducer(s, { type: "WALLET_SLOT_SYNC", capacity: 10 });
  assert.equal(s.wallet.slot?.capacity, 10);
  s = reducer(s, { type: "WALLET_SLOT_SYNC", capacity: 0 });
  assert.equal(s.wallet.slot, null);
});

test("SWAP_REJECTED logs a real reject with reason and detail", () => {
  let s = withPool();
  s = reducer(s, { type: "SWAP_REJECTED", reason: "oversize", tradeSize: 20, detail: "x" });
  assert.equal(s.rejects.length, 1);
  assert.equal(s.rejects[0].reason, "oversize");
});

test("SWAP_SUCCEEDED records the fill event without touching reserves (chain owns truth)", () => {
  let s = withEpoch();
  s = reducer(s, { type: "WALLET_SLOT_SYNC", capacity: 10 });
  s = reducer(s, { type: "SWAP_SUCCEEDED", sizeEth: 1, outUsdc: 2988, capacityUsed: 1 });
  assert.equal(s.swaps[0].sizeEth, 1);
  assert.equal(s.graph[0].kind, "consume");
  // reserves unchanged locally — POOL_SYNC will deliver the chain truth
  assert.equal(s.pool?.activeReserveEth, 250);
});

test("COMMIT_MINT stores commitment with H; size visible only locally", () => {
  let s = withEpoch();
  s = reducer(s, { type: "COMMIT_MINT", sizeEth: 5, pricePerEth: 0.001, salt: "abc" });
  assert.equal(s.commitments.length, 1);
  assert.equal(s.commitments[0].status, "committed");
  assert.equal(s.graph[0].kind, "commit");
  assert.equal(s.graph[0].size, 0);
});

test("REVEAL_SWAP with wrong salt is rejected as bad-reveal", () => {
  let s = withEpoch();
  s = reducer(s, { type: "COMMIT_MINT", sizeEth: 5, pricePerEth: 0.001, salt: "abc" });
  s = reducer(s, { type: "REVEAL_SWAP", sizeEth: 5, salt: "zzz" });
  assert.equal(s.rejects[0].reason, "bad-reveal");
  assert.equal(s.commitments[0].status, "committed");
});

test("REVEAL_SWAP with the right salt reveals then records the fill", () => {
  let s = withEpoch();
  s = reducer(s, { type: "COMMIT_MINT", sizeEth: 5, pricePerEth: 0.001, salt: "abc" });
  s = reducer(s, { type: "REVEAL_SWAP", sizeEth: 5, salt: "abc" });
  assert.equal(s.commitments[0].status, "revealed");
  assert.equal(s.swaps.length, 1);
});

test("INTEL_QUOTE writes the ask; INTEL_ERROR only records the failure", () => {
  let s = withPool();
  s = reducer(s, {
    type: "INTEL_QUOTE",
    quote: { suggestedAskPerEth: 0.002, asOf: 1, rationale: "r", source: "x402", costUsd: 0.001, settlementHash: null },
  });
  assert.equal(s.slotPricePerEth, 0.002);
  s = reducer(s, { type: "INTEL_ERROR", message: "not configured" });
  assert.equal(s.lastIntelError, "not configured");
  // an error must not fabricate a quote
  assert.equal(s.intel?.suggestedAskPerEth, 0.002);
});

test("active-only constant product quote matches the hook's math", () => {
  const out = quoteSwapOutUsdc(POOL, 1);
  // out = A_u - (A_e * A_u)/(A_e + s) = 750000 - 250*750000/251
  assert.equal(out, 750_000 - (250 * 750_000) / 251);
});

test("buy on a null pool is a no-op (honest gating)", () => {
  const s = reducer(initialWorld(), { type: "BUY_SLOT", sizeEth: 10, pricePerEth: 0.001 });
  assert.equal(s.wallet.slot, null);
  assert.equal(s.graph.length, 0);
});
