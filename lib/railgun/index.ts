/**
 * Railgun adapter (Extended §7). See lib/shield/adapter.ts for the honest
 * surface — the real SDK flow (@railgun-community/quickstart) is wired behind
 * env gating in lib/shield/railgun.ts; with RAILGUN_* env unset every call
 * throws NotWired naming the missing vars. Never darkens the AMM.
 */
export { shield, unshieldTo, shieldToCadencePayer, NotWired, type ShieldParams, type UnshieldParams, type ShieldBridgeTx } from "../shield/adapter";

export const PROTOCOL = "railgun" as const;
export const SETUP_DOC = {
  sdk: "@railgun-community/quickstart (real SDK flow in lib/shield/railgun.ts)",
  env: [
    "RAILGUN_NETWORK",
    "RAILGUN_RPC_URL",
    "RAILGUN_MNEMONIC",
    "RAILGUN_ENCRYPTION_KEY",
    "RAILGUN_WALLET_ID",
    "RAILGUN_SHIELD_PRIVATE_KEY",
    "RAILGUN_ARTIFACTS_PATH",
  ],
  flow: [
    "startRailgunEngine (wallet store + artifact store) → setProviderForNetwork",
    "shield: populateShieldBaseToken → broadcast with your wallet",
    "unshieldTo: generateUnshieldBaseTokenProof → populateProvedUnshieldBaseToken → broadcast",
  ],
  invariant: "Shields funds, not the swap — beforeSwap stays public.",
};
