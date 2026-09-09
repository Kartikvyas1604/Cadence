/**
 * Railgun adapter (Extended §7). See lib/shield/adapter.ts for the honest
 * surface — real integration needs @railgun-community/quickstart with the
 * wallet's proof key and viewing key trees synced. Never darkens the AMM.
 */
export { shield, unshieldTo, shieldToCadencePayer, NotWired, type ShieldParams, type UnshieldParams, type ShieldBridgeTx } from "../shield/adapter";

export const PROTOCOL = "railgun" as const;
export const SETUP_DOC = {
  sdk: "@railgun-community/quickstart",
  env: ["RAILGUN_PROOF_KEY", "RAILGUN_DB_NAME"],
  flow: [
    "loadProvider + setSyncingInProgress",
    "shield: wallet.createFullWithdrawKey → railgun wallet shield",
    "unshieldTo: railgun wallet → ephemeral EOA that pays the slot",
  ],
  invariant: "Shields funds, not the swap — beforeSwap stays public.",
};
