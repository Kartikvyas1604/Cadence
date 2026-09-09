/**
 * Aztec adapter (Extended §7). See lib/shield/adapter.ts for the honest
 * surface — real integration needs @aztec/aztec.js + a PXE URL.
 */
export { shield, unshieldTo, shieldToCadencePayer, NotWired, type ShieldParams, type UnshieldParams, type ShieldBridgeTx } from "../shield/adapter";

export const PROTOCOL = "aztec" as const;
export const SETUP_DOC = {
  sdk: "@aztec/aztec.js",
  env: ["AZTEC_NODE_URL", "AZTEC_PXE_URL"],
  flow: [
    "connect PXE → register the recipient account",
    "shield: token transfer into the private note pool",
    "unshield to the ephemeral EOA that pays for the cadence slot",
  ],
  invariant: "Shields funds, not the swap — beforeSwap stays public.",
};
