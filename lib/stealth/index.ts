import type { PrivateKeyAccount } from "viem/accounts";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import type { WalletClient } from "viem";
import { createWalletClient, custom, formatEther, http, parseEther } from "viem";

/**
 * Stealth / ephemeral payer wallets (Extended §5): a one-shot key generated
 * locally, funded by the main wallet, used to mint/commit and pay x402, then
 * swept. The key never leaves memory of the tab that created it. No KYC.
 */

export interface StealthSession {
  account: PrivateKeyAccount;
  createdAt: number;
}

/** Generate a one-shot wallet in the caller's process. */
export function createEphemeral(): StealthSession {
  return { account: privateKeyToAccount(generatePrivateKey()), createdAt: Date.now() };
}

export function ephemeralAddress(session: StealthSession): string {
  return session.account.address;
}

export function ephemeralBalanceLabel(session: StealthSession, balanceWei: bigint | null): string {
  if (balanceWei === null) return "—";
  return `${formatEther(balanceWei)} ETH`;
}

/** Wrap a generic EIP-1193 provider as a wallet client (for funding). */
export function walletFromProvider(provider: unknown): WalletClient | null {
  if (!provider) return null;
  try {
    return createWalletClient({ transport: custom(provider as never) });
  } catch {
    return null;
  }
}

/** Send `amountEth` from a funding wallet to the ephemeral address. */
export async function fundEphemeral(
  funder: WalletClient,
  session: StealthSession,
  amountEth: string,
): Promise<`0x${string}`> {
  return funder.sendTransaction({
    account: null,
    chain: null,
    to: session.account.address as `0x${string}`,
    value: parseEther(amountEth),
  });
}

/** Local wallet client for the ephemeral key — signs its own transactions. */
export function walletFromSession(session: StealthSession): WalletClient {
  return createWalletClient({ account: session.account, transport: http() });
}

/** Sweep everything left on the ephemeral wallet back to `to` (optional). */
export async function sweep(session: StealthSession, to: `0x${string}`, valueWei: bigint): Promise<`0x${string}`> {
  const client = walletFromSession(session);
  return client.sendTransaction({
    account: session.account,
    chain: null,
    to,
    value: valueWei,
  });
}
