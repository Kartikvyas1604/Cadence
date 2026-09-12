import type { PrivateKeyAccount } from "viem/accounts";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import type { PublicClient, WalletClient } from "viem";
import { createPublicClient, createWalletClient, custom, http, parseEther, parseUnits } from "viem";
import { poolKey, routerAbi, slotsAbi, type CadenceDeployment } from "@/lib/cadence/abis";
import { rpcUrlFor } from "@/lib/cadence/contract";

/**
 * Stealth / ephemeral payer wallets (Extended §5): a one-shot key generated
 * locally, funded by the main wallet, used to commit-mint AND reveal from
 * the one-shot address (the hook verifies payer == trader), then swept.
 * The key never leaves memory of the tab that created it. No KYC.
 */

export interface StealthSession {
  account: PrivateKeyAccount;
  createdAt: number;
}

/** Generate a one-shot wallet in the caller's process. */
export function createEphemeral(): StealthSession {
  return { account: privateKeyToAccount(generatePrivateKey()), createdAt: Date.now() };
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

/**
 * Local wallet client for the ephemeral key. Local accounts sign in-process
 * and broadcast via eth_sendRawTransaction over the chain's public RPC —
 * no wallet popup, no injected provider involvement.
 */
export function walletFromSession(session: StealthSession, chainId: number): WalletClient {
  return createWalletClient({
    account: session.account,
    transport: http(rpcUrlFor(chainId)),
  });
}

/**
 * commitMint(H) FROM the ephemeral wallet — the payer of record onchain is
 * the one-shot address, never the main wallet. Simulates first so a bad size
 * or short escrow surfaces before gas is spent.
 */
export async function commitFromEphemeral(
  session: StealthSession,
  deps: { deployment: CadenceDeployment; pc: PublicClient; chainId: number },
  params: { sizeWei: bigint; epochId: number; salt: `0x${string}`; escrowWei: bigint },
): Promise<{ H: `0x${string}`; txHash: `0x${string}` }> {
  const { deployment, pc, chainId } = deps;
  const wc = walletFromSession(session, chainId);
  const H = (await pc.readContract({
    address: deployment.slots,
    abi: slotsAbi,
    functionName: "commitHash",
    args: [params.sizeWei, BigInt(params.epochId), params.salt],
  })) as `0x${string}`;
  // dry-run first: surface reverts without burning the one-shot key's gas
  await pc.simulateContract({
    address: deployment.slots,
    abi: slotsAbi,
    functionName: "commitMint",
    args: [H],
    account: session.account,
    value: params.escrowWei,
  });
  const txHash = await wc.writeContract({
    address: deployment.slots,
    abi: slotsAbi,
    functionName: "commitMint",
    args: [H],
    account: session.account,
    chain: null,
    value: params.escrowWei,
  });
  await pc.waitForTransactionReceipt({ hash: txHash });
  return { H, txHash };
}

/**
 * Reveal + swap FROM the ephemeral wallet via the router's private path.
 * The hook verifies c.payer == trader, so the SAME one-shot key that
 * committed must reveal. USDC output and the leftover escrow refund land on
 * the ephemeral address (it is msg.sender on the router).
 */
export async function revealFromEphemeral(
  session: StealthSession,
  deps: { deployment: CadenceDeployment; pc: PublicClient; chainId: number },
  params: { sizeEth: number; salt: `0x${string}` },
): Promise<`0x${string}`> {
  const { deployment, pc, chainId } = deps;
  const wc = walletFromSession(session, chainId);
  const sizeWei = parseUnits(String(params.sizeEth), 18);
  await pc.simulateContract({
    address: deployment.router,
    abi: routerAbi,
    functionName: "sellEthPrivate",
    args: [poolKey(deployment), sizeWei, params.salt],
    account: session.account,
    value: sizeWei,
  });
  const txHash = await wc.writeContract({
    address: deployment.router,
    abi: routerAbi,
    functionName: "sellEthPrivate",
    args: [poolKey(deployment), sizeWei, params.salt],
    account: session.account,
    chain: null,
    value: sizeWei,
  });
  await pc.waitForTransactionReceipt({ hash: txHash });
  return txHash;
}

/**
 * Sweep everything above the gas reserve back to `to`. The reserve keeps a
 * 21k-gas plain transfer payable; anything below stays (dust, by design).
 */
export async function sweep(
  session: StealthSession,
  to: `0x${string}`,
  chainId: number,
): Promise<{ sweptWei: bigint; txHash: `0x${string}` } | null> {
  const wc = walletFromSession(session, chainId);
  const pc = createPublicClient({ transport: http(rpcUrlFor(chainId)) });
  const [balance, gasPrice] = await Promise.all([
    pc.getBalance({ address: session.account.address }),
    pc.getGasPrice(),
  ]);
  const gasReserve = gasPrice * 21_000n * 2n; // plain transfer + headroom
  if (balance <= gasReserve) return null; // nothing worth sweeping
  const value = balance - gasReserve;
  const txHash = await wc.sendTransaction({
    account: session.account,
    chain: null,
    to,
    value,
    gas: 21_000n,
    maxFeePerGas: gasPrice * 2n,
    maxPriorityFeePerGas: 0n,
  });
  await pc.waitForTransactionReceipt({ hash: txHash });
  return { sweptWei: value, txHash };
}
