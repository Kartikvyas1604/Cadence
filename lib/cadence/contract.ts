"use client";

import { createPublicClient, createWalletClient, custom, http, type PublicClient, type WalletClient } from "viem";

const RPC_BY_CHAIN: Record<number, string> = {
  1: "https://eth.llamarpc.com",
  84532: "https://base-sepolia-rpc.publicnode.com",
  11155111: "https://ethereum-sepolia-rpc.publicnode.com",
  31337: "http://localhost:8545",
};

export function rpcUrlFor(chainId: number): string {
  return process.env.NEXT_PUBLIC_RPC_URL || RPC_BY_CHAIN[chainId] || "https://eth.llamarpc.com";
}

export function publicClientFor(_chainId: number): PublicClient {
  return createPublicClient({ transport: http(rpcUrlFor(_chainId)) });
}

/** Wrap the injected EIP-1193 provider as a viem wallet client. */
export function walletClientFor(provider: unknown, _chainId: number): WalletClient | null {
  if (!provider) return null;
  try {
    return createWalletClient({ transport: custom(provider as never) });
  } catch {
    return null;
  }
}

/** Decode a wrapped hook revert: WrappedError(hook, sel, inner, tail). */
export function decodeWrappedInner(revertData: string): string | null {
  // 0x90bfb865 = WrappedError(address,bytes4,bytes,bytes) — v4 callHook wrapper
  if (!revertData?.startsWith("0x90bfb865")) return null;
  try {
    // head: 32B addr | 32B bytes4 | 32B off | 32B off; inner bytes at offset 4+128
    const hex = revertData.slice(2);
    const innerOffset = Number.parseInt(hex.slice(4 * 32 + 64, 4 * 32 + 64 + 64), 16);
    const innerLen = Number.parseInt(hex.slice((4 + innerOffset) * 2, (4 + innerOffset) * 2 + 64), 16);
    const innerHex = hex.slice((4 + innerOffset + 1) * 2, (4 + innerOffset + 1) * 2 + innerLen * 2);
    return innerHex.startsWith("0x") ? innerHex : `0x${innerHex}`;
  } catch {
    return null;
  }
}

export const REVERT_SELECTORS: Record<string, string> = {
  "0xb6db9bd9": "no-slot", // NoCadenceSlot()
  "0x42af5088": "oversize", // OversizeVsSlot()
  "0xefd222f9": "oversize-active", // OversizeVsActive()
  "0x5a1b39fc": "same-block-passive-unlock", // PassiveUnlock()
  "0x8ff14e0d": "bad-reveal", // BadReveal() (slots or hook)
  "0x067a3d2e": "unsafe-withdraw", // UnsafeWithdraw()
  "0x90b8ab88": "insufficient-escrow", // InsufficientEscrow()
  "0x9ff41fe0": "capacity-exceeded", // CapacityExceeded()
  "0xc459d23f": "zero-size", // ZeroSize()
} as const;
