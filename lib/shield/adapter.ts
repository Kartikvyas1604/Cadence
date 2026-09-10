import type { Address } from "viem";

/**
 * Aztec / Railgun fund-path adapter surface (Extended §7): shield assets,
 * unshield to a payer wallet, then pay for the cadence slot. The AMM swap
 * itself stays public — this path shields funds, not the swap.
 *
 * Railgun is WIRED via the real SDK (@railgun-community/quickstart) behind
 * env gating (lib/shield/railgun.ts): calls route there when RAILGUN_* env
 * is set, and throw NotWired otherwise — with the exact missing vars named.
 * The heavy SDK loads lazily, so the default deployment never touches it.
 * Aztec (@aztec/aztec.js) remains honestly NotWired — its 5.x client model
 * requires a self-hosted Aztec node; wiring lands when AZTEC_* env is set.
 * NEVER fake a tx.
 */

export type ShieldProtocol = "railgun" | "aztec";

export interface ShieldParams {
  /** wrapped/private ERC-20 or ETH amount (wei string) */
  amountWei: string;
  /** destination private balance */
  memo?: string;
  /** optional broadcaster (the caller's wallet sends the populated tx) */
  broadcast?: (tx: { to: string; data: string; value: string }) => Promise<string>;
}

export interface UnshieldParams {
  /** the ephemeral wallet to pay the cadence slot from */
  to: Address;
  amountWei: string;
  /** optional broadcaster (the caller's wallet sends the populated tx) */
  broadcast?: (tx: { to: string; data: string; value: string }) => Promise<string>;
  /** proof-generation progress (0–100) */
  onProofProgress?: (progress: number) => void;
}

export interface ShieldBridgeTx {
  protocol: ShieldProtocol;
  /** shield transaction hash / aztec note commitment */
  inTx: string;
  /** unshield transaction hash */
  outTx: string;
  amount: string;
}

export class NotWired extends Error {
  constructor(protocol: ShieldProtocol, missingEnv: string[] = []) {
    super(
      missingEnv.length > 0
        ? `${protocol} adapter not configured on this deployment — missing env: ${missingEnv.join(", ")}. Funds are NOT moved and nothing is simulated.`
        : `${protocol} adapter not wired on this deployment — the SDK proof setup (proof key, viewing key, tree sync) has not been configured. Funds are NOT moved and nothing is simulated.`,
    );
    this.name = "NotWired";
  }
}

/** Env names each protocol needs; surfaced verbatim when unconfigured. */
const REQUIRED_ENV: Record<ShieldProtocol, string[]> = {
  railgun: [
    "RAILGUN_NETWORK",
    "RAILGUN_RPC_URL",
    "RAILGUN_MNEMONIC",
    "RAILGUN_ENCRYPTION_KEY",
    "RAILGUN_WALLET_ID",
    "RAILGUN_SHIELD_PRIVATE_KEY",
    "RAILGUN_ARTIFACTS_PATH",
  ],
  aztec: ["AZTEC_NODE_URL", "AZTEC_ACCOUNT_SECRET"],
};

export function missingEnvFor(protocol: ShieldProtocol): string[] {
  return REQUIRED_ENV[protocol].filter((k) => !process.env[k]);
}

export function isConfigured(protocol: ShieldProtocol): boolean {
  return missingEnvFor(protocol).length === 0;
}

/**
 * Shield into the private balance. Railgun: real SDK flow via
 * populateShieldBaseToken. Unset env ⇒ NotWired (funds are not moved).
 */
export async function shield(protocol: ShieldProtocol, params: ShieldParams): Promise<string> {
  if (protocol === "railgun") {
    const missing = missingEnvFor(protocol);
    if (missing.length > 0) throw new NotWired(protocol, missing);
    const { shieldRailgun } = await import("./railgun");
    const { txHash } = await shieldRailgun(params.amountWei, { broadcast: params.broadcast });
    if (!txHash) {
      throw new Error(
        "railgun_shield_pending: the populated shield tx was returned — broadcast it with your wallet to settle",
      );
    }
    return txHash;
  }
  throw new NotWired(protocol, missingEnvFor(protocol));
}

/**
 * Unshield to the ephemeral payer that will commit/mint the cadence slot.
 */
export async function unshieldTo(protocol: ShieldProtocol, params: UnshieldParams): Promise<string> {
  if (protocol === "railgun") {
    const missing = missingEnvFor(protocol);
    if (missing.length > 0) throw new NotWired(protocol, missing);
    const { unshieldRailgun } = await import("./railgun");
    const { txHash } = await unshieldRailgun(params.to, params.amountWei, {
      broadcast: params.broadcast,
      onProofProgress: params.onProofProgress,
    });
    if (!txHash) {
      throw new Error(
        "railgun_unshield_pending: the proved unshield tx was returned — broadcast it with your wallet to settle",
      );
    }
    return txHash;
  }
  throw new NotWired(protocol, missingEnvFor(protocol));
}

/**
 * Compose the full fund path for the /privacy flow: Shield → Fund Cadence →
 * Commit/Mint. Resolves only when both legs settle; the returned bridge tx
 * is what /privacy displays.
 */
export async function shieldToCadencePayer(
  protocol: ShieldProtocol,
  shieldParams: ShieldParams,
  unshieldParams: UnshieldParams,
): Promise<ShieldBridgeTx> {
  const inTx = await shield(protocol, shieldParams);
  const outTx = await unshieldTo(protocol, unshieldParams);
  return { protocol, inTx, outTx, amount: shieldParams.amountWei };
}
