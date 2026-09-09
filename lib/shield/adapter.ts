import type { Address } from "viem";

/**
 * Aztec / Railgun fund-path adapter surface (Extended §7): shield assets,
 * unshield to a payer wallet, then pay for the cadence slot. The AMM swap
 * itself stays public — this path shields funds, not the swap.
 *
 * These adapters are the honest integration surface: the real SDKs
 * (@aztec/aztec.js / @railgun-community/quickstart) require their own
 * proof key + viewing-key setup. Until that lands, every call throws
 * NotWired — the UI shows the corresponding honest state. NEVER fake a tx.
 */

export type ShieldProtocol = "railgun" | "aztec";

export interface ShieldParams {
  /** wrapped/private ERC-20 or ETH amount (wei string) */
  amountWei: string;
  /** destination private balance */
  memo?: string;
}

export interface UnshieldParams {
  /** the ephemeral wallet to pay the cadence slot from */
  to: Address;
  amountWei: string;
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
  constructor(protocol: ShieldProtocol) {
    super(
      `${protocol} adapter not wired on this deployment — the SDK proof setup (proof key, viewing key, tree sync) has not been configured. Funds are NOT moved and nothing is simulated.`,
    );
    this.name = "NotWired";
  }
}

/**
 * Shield into the private balance pool. Requires the protocol SDK with
 * its proof key configured (env: RAILGUN_PROOF_KEY / AZTEC_NODE_URL).
 */
export async function shield(_protocol: ShieldProtocol, _params: ShieldParams): Promise<string> {
  throw new NotWired(_protocol);
}

/**
 * Unshield to the ephemeral payer that will commit/mint the cadence slot.
 */
export async function unshieldTo(_protocol: ShieldProtocol, _params: UnshieldParams): Promise<string> {
  throw new NotWired(_protocol);
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
