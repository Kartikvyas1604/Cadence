import { MemoryLevel } from "memory-level";
import {
  ArtifactStore,
  createRailgunWallet,
  generateUnshieldBaseTokenProof,
  getWalletMnemonic,
  loadWalletByID,
  populateProvedUnshieldBaseToken,
  populateShieldBaseToken,
  setProviderForNetwork,
  startRailgunEngine,
  stopRailgunEngine,
  unloadWalletByID,
  getRailgunAddress,
} from "@railgun-community/quickstart";
import {
  EVMGasType,
  NetworkName,
  type RailgunERC20Amount,
  type RailgunPopulateTransactionResponse,
  type TransactionGasDetails,
} from "@railgun-community/shared-models";
import { randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

/**
 * Real Railgun integration (Extended §7) — env-gated, skip-when-unset.
 *
 * Required env (unset ⇒ the adapter reports NOT CONFIGURED, never fakes):
 *   RAILGUN_NETWORK         NetworkName of the SDK, e.g. "EthereumSepolia"
 *                           (unsupported by this SDK build ⇒ fails closed)
 *   RAILGUN_RPC_URL         RPC endpoint the engine syncs/listens on
 *   RAILGUN_MNEMONIC        spending-key mnemonic of the Railgun wallet
 *   RAILGUN_ENCRYPTION_KEY  wallet-store encryption key (>= 32 chars)
 *   RAILGUN_WALLET_ID       Railgun wallet id to load (create first if absent)
 *   RAILGUN_SHIELD_PRIVATE_KEY  shield secret (32-byte hex) for the reveal
 *   RAILGUN_ARTIFACTS_PATH  persisted proof-artifact directory
 *
 * The heavy SDK loads lazily — only when a shield/unshield is requested with
 * env present. The default deployment pays nothing and never fakes a tx.
 */

const REQUIRED_ENV = [
  "RAILGUN_NETWORK",
  "RAILGUN_RPC_URL",
  "RAILGUN_MNEMONIC",
  "RAILGUN_ENCRYPTION_KEY",
  "RAILGUN_WALLET_ID",
  "RAILGUN_SHIELD_PRIVATE_KEY",
  "RAILGUN_ARTIFACTS_PATH",
] as const;

export interface RailgunStatus {
  configured: boolean;
  missing: string[];
}

export function railgunStatus(): RailgunStatus {
  const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
  return { configured: missing.length === 0, missing };
}

export type BroadcastTx = { to: string; data: string; value: string };

/** The caller's wallet broadcasts — the adapter never fakes a tx hash. */
export type BroadcastFn = (tx: BroadcastTx) => Promise<string>;

/** Networks the pinned quickstart build actually supports at runtime. */
const SUPPORTED_NETWORKS: readonly NetworkName[] = [
  NetworkName.Ethereum,
  NetworkName.EthereumGoerli,
  NetworkName.Arbitrum,
  NetworkName.BNBChain,
  NetworkName.Polygon,
  NetworkName.Hardhat,
];

let engineStarted = false;

async function ensureEngine(): Promise<NetworkName> {
  const status = railgunStatus();
  if (!status.configured) {
    throw new Error(`railgun_not_configured: missing ${status.missing.join(", ")}`);
  }
  const network = process.env.RAILGUN_NETWORK as NetworkName;
  if (!SUPPORTED_NETWORKS.includes(network)) {
    throw new Error(
      `railgun_network_unsupported: ${network} is not supported by the pinned quickstart build — Railgun testnet support for Sepolia is pending upstream. Failing closed; no tx is faked.`,
    );
  }
  const artifactsPath = process.env.RAILGUN_ARTIFACTS_PATH as string;
  await fs.mkdir(artifactsPath, { recursive: true });

  if (!engineStarted) {
    const artifactStore = new ArtifactStore(
      async (p: string) => {
        try {
          return await fs.readFile(path.join(artifactsPath, p));
        } catch {
          return null;
        }
      },
      async (dir: string, p: string, item: string | Buffer) => {
        const target = path.join(artifactsPath, dir, p);
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.writeFile(target, item);
      },
      async (p: string) => {
        try {
          await fs.access(path.join(artifactsPath, p));
          return true;
        } catch {
          return false;
        }
      },
    );
    // in-memory wallet store: the wallet is deterministically recreated from
    // the mnemonic on every boot (mnemonic restores a lost store)
    await startRailgunEngine("cadence", new MemoryLevel() as never, false, artifactStore, false, false);
    engineStarted = true;
  }

  const { FallbackProvider } = await import("ethers");
  const chainId = network === NetworkName.Ethereum || network === NetworkName.EthereumGoerli ? 1 : 0;
  setProviderForNetwork(
    network,
    new FallbackProvider(
      [{ provider: process.env.RAILGUN_RPC_URL as unknown as never, weight: 1 }],
      chainId as never,
    ),
  );
  return network;
}

function baseTokenAmount(wrappedWei: string): RailgunERC20Amount {
  // ETH is the base token: tokenAddress = zero address
  return { tokenAddress: "0x0000000000000000000000000000000000000000", amount: BigInt(wrappedWei) };
}

async function populatedToTx(
  res: RailgunPopulateTransactionResponse,
  broadcast?: BroadcastFn,
): Promise<string | null> {
  const tx = res.transaction;
  if (!tx) return null; // caller broadcasts with their wallet
  if (!broadcast) return null;
  return broadcast({
    to: tx.to as string,
    data: tx.data as string,
    value: (tx.value ?? 0n).toString(),
  });
}

const DEMO_GAS: TransactionGasDetails = {
  evmGasType: EVMGasType.Type2,
  gasEstimate: 1_000_000n,
  maxFeePerGas: 1n,
  maxPriorityFeePerGas: 1n,
};

/** Shield base-token (ETH) into the Railgun private balance. */
export async function shieldRailgun(
  amountWei: string,
  opts: { broadcast?: BroadcastFn } = {},
): Promise<{
  txHash: string | null;
  railgunAddress: string | null;
  populatedTx: BroadcastTx | null;
}> {
  const network = await ensureEngine();
  const encryptionKey = process.env.RAILGUN_ENCRYPTION_KEY as string;
  const walletID = process.env.RAILGUN_WALLET_ID as string;
  const mnemonic = process.env.RAILGUN_MNEMONIC as string;

  try {
    await getWalletMnemonic(encryptionKey, walletID);
  } catch {
    // fresh wallet store — recreate deterministically from the mnemonic
    await createRailgunWallet(encryptionKey, mnemonic, new Map());
  }
  await loadWalletByID(encryptionKey, walletID, false);
  const railgunAddress = getRailgunAddress(walletID);
  if (!railgunAddress) throw new Error("railgun_wallet_unloadable");

  // shieldPrivateKey: random per shield unless pinned by env (reveal needs it)
  const envShieldKey = process.env.RAILGUN_SHIELD_PRIVATE_KEY as string;
  const shieldPrivateKey =
    envShieldKey && envShieldKey.length >= 64 ? envShieldKey : `0x${randomBytes(32).toString("hex")}`;

  const populated = await populateShieldBaseToken(
    network,
    railgunAddress,
    shieldPrivateKey,
    baseTokenAmount(amountWei),
  );
  const tx = populated.transaction;
  return {
    txHash: await populatedToTx(populated, opts.broadcast),
    railgunAddress,
    populatedTx: tx
      ? { to: tx.to as string, data: tx.data as string, value: (tx.value ?? 0n).toString() }
      : null,
  };
}

/** Unshield base-token (ETH) from the Railgun wallet to a public payer. */
export async function unshieldRailgun(
  to: string,
  amountWei: string,
  opts: { broadcast?: BroadcastFn; onProofProgress?: (progress: number) => void } = {},
): Promise<{ txHash: string | null; populatedTx: BroadcastTx | null }> {
  const network = await ensureEngine();
  const encryptionKey = process.env.RAILGUN_ENCRYPTION_KEY as string;
  const walletID = process.env.RAILGUN_WALLET_ID as string;

  await loadWalletByID(encryptionKey, walletID, false);
  const railgunAddress = getRailgunAddress(walletID);
  if (!railgunAddress) throw new Error("railgun_wallet_unloadable");

  await generateUnshieldBaseTokenProof(
    network,
    railgunAddress,
    walletID,
    encryptionKey,
    baseTokenAmount(amountWei),
    null,
    true,
    null,
    opts.onProofProgress ?? (() => {}),
  );
  const populated = await populateProvedUnshieldBaseToken(
    network,
    to,
    walletID,
    baseTokenAmount(amountWei),
    null,
    true,
    null,
    DEMO_GAS,
  );
  const tx = populated.transaction;
  return {
    txHash: await populatedToTx(populated, opts.broadcast),
    populatedTx: tx
      ? { to: tx.to as string, data: tx.data as string, value: (tx.value ?? 0n).toString() }
      : null,
  };
}

/** Wallet-store hygiene for long-lived processes. */
export async function shutdownRailgun(): Promise<void> {
  try {
    const walletID = process.env.RAILGUN_WALLET_ID;
    if (walletID) unloadWalletByID(walletID);
    await stopRailgunEngine();
  } finally {
    engineStarted = false;
  }
}
