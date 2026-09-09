"use client";

import type { Abi, PublicClient, WalletClient } from "viem";
import { decodeWrappedInner } from "./contract";

/**
 * Shared write path for module pages (router, clob, admin, intel): send via
 * the injected wallet, wait for the receipt, decode wrapped hook/slots
 * reverts into a readable message. Returns "filled" | the revert selector.
 */
export async function sendWrite(
  wc: WalletClient,
  pc: PublicClient,
  write: () => Promise<`0x${string}`>,
): Promise<{ ok: true; hash: `0x${string}` } | { ok: false; selector: string; message: string }> {
  let hash: `0x${string}`;
  try {
    hash = await write();
  } catch (e: unknown) {
    const data =
      (e as { data?: string })?.data ??
      (e as { cause?: { data?: string } })?.cause?.data ??
      "";
    const selector = data.startsWith("0x") && data.length >= 10 ? data.slice(0, 10) : "0x00000000";
    return {
      ok: false,
      selector,
      message: e instanceof Error ? e.message.slice(0, 160) : "transaction failed",
    };
  }
  const receipt = await pc.waitForTransactionReceipt({ hash });
  if (receipt.status === "reverted") {
    return { ok: false, selector: "0x00000000", message: "reverted at execution" };
  }
  return { ok: true, hash };
}

/** Map known revert selectors to blunt, actionable copy. */
export function describeRevert(selector: string): string | null {
  const map: Record<string, string> = {
    "0xb6db9bd9": "No cadence slot for this epoch — mint one first.",
    "0x42af5088": "Trade size exceeds your slot capacity.",
    "0xefd222f9": "Trade exceeds the epoch's active reserves.",
    "0x5a1b39fc": "Active depth is drained — passive cannot unlock.",
    "0x8ff14e0d": "Reveal does not match the commitment.",
    "0x067a3d2e": "Withdraw would orphan sold capacity — reduce the amount.",
    "0x9ff41fe0": "Mint exceeds this epoch's capacity budget.",
    "0x90b8ab88": "Escrow below the mint cost.",
    "0xc459d23f": "Size must be nonzero.",
    "0x82b1c3ae": "Not the pool owner.",
    "0x238243da": "Order rejected — check size, epoch and escrow.",
  };
  return map[selector] ?? null;
}

export type { Abi };
