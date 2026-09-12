#!/usr/bin/env node
/**
 * railgun-setup — generates EVERY RAILGUN_* value and prints a ready-to-paste
 * .env block. Runs fully offline: the Railgun wallet id is derived
 * deterministically from the mnemonic (same math the engine uses at runtime),
 * and the in-memory wallet store is recreated from that mnemonic on boot —
 * so the printed id is stable and never needs a first-boot sync.
 *
 * Usage:
 *   node scripts/railgun-setup.mjs                       # Ethereum mainnet
 *   node scripts/railgun-setup.mjs --network Hardhat     # local fork/anvil
 *   node scripts/railgun-setup.mjs --rpc https://... --network Ethereum
 *
 * HONEST LIMITS (pinned SDK @railgun-community/quickstart 5.1.3):
 *   Supported networks: Ethereum, EthereumGoerli (deprecated), Arbitrum,
 *   BNBChain, Polygon, Hardhat. Sepolia is NOT supported upstream yet.
 *   - Ethereum: real mainnet ETH is required (the shield tx is a real tx).
 *   - Hardhat:  requires the Railgun contracts deployed on the local chain.
 * Proof artifacts download on first shield (needs network).
 */
import crypto from "node:crypto";
import path from "node:path";

const args = process.argv.slice(2);
function arg(name) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : null;
}

const NETWORK = (arg("network") ?? "Ethereum").replace(/"/g, "");
const RPC = arg("rpc") ?? process.env.RAILGUN_RPC_URL ?? "";
const MNEMONIC = arg("mnemonic") ?? process.env.RAILGUN_MNEMONIC ?? "";
const ENCRYPTION_KEY = arg("encryptionKey") ?? process.env.RAILGUN_ENCRYPTION_KEY ?? "";
const SHIELD_KEY = arg("shieldKey") ?? process.env.RAILGUN_SHIELD_PRIVATE_KEY ?? "";
const WALLET_INDEX = Number(arg("index") ?? 0);
const ARTIFACTS = arg("artifacts") ?? path.resolve("railgun-artifacts");

if (!RPC) {
  console.error("No RPC URL — pass --rpc https://<rpc-for-the-chosen-network>");
  process.exit(1);
}
if (!["Ethereum", "EthereumGoerli", "Hardhat"].includes(NETWORK)) {
  console.error(
    `Network "${NETWORK}" is not supported by the pinned SDK (5.1.3). Use Ethereum, EthereumGoerli, or Hardhat. Sepolia is pending upstream — the app fails closed rather than fake a tx.`,
  );
  process.exit(1);
}
if (!MNEMONIC) {
  const { Wallet } = await import("ethers");
  process.stdout.write(`new mnemonic: ${Wallet.createRandom().mnemonic.phrase}\n`);
  console.error("Re-run with --mnemonic \"<the phrase above>\" to bind the wallet id to it.");
  process.exit(0);
}
if (MNEMONIC.trim().split(/\s+/).length < 12) {
  console.error("mnemonic must be at least 12 words");
  process.exit(1);
}
if (!/^[0-9a-fA-F]{64}$/.test(ENCRYPTION_KEY)) {
  process.stdout.write(`encryption key: ${crypto.randomBytes(32).toString("hex")}\n`);
  console.error("Re-run with --encryptionKey <64 hex chars> (must be exactly 32 bytes).");
  process.exit(0);
}
if (SHIELD_KEY && !/^0x[0-9a-fA-F]{64}$/.test(SHIELD_KEY)) {
  console.error("shield key must be 0x + 64 hex chars (32 bytes)");
  process.exit(1);
}

// Wallet id derivation — mirrors @railgun-community/engine RailgunWallet.generateID:
//   id = sha256(combine([mnemonicToSeed(mnemonic), index.toString(16)]))
// No DB, no engine boot, no network — pure key derivation.
const ENGINE = path.join(
  process.cwd(),
  "node_modules/@railgun-community/quickstart/node_modules/@railgun-community/engine/dist",
);
const { sha256 } = await import(`${ENGINE}/utils/hash.js`);
const { combine } = await import(`${ENGINE}/utils/bytes.js`);
const { mnemonicToSeed } = await import(`${ENGINE}/key-derivation/bip39.js`);

const walletID = sha256(combine([mnemonicToSeed(MNEMONIC.trim()), WALLET_INDEX.toString(16)]));

console.log("\n✅ Ready. Paste this block into .env:\n");
console.log(`RAILGUN_NETWORK=${NETWORK}`);
console.log(`RAILGUN_RPC_URL=${RPC}`);
console.log(`RAILGUN_MNEMONIC="${MNEMONIC.trim()}"`);
console.log(`RAILGUN_ENCRYPTION_KEY="${ENCRYPTION_KEY}"`);
console.log(`RAILGUN_WALLET_ID=${walletID}`);
console.log(`RAILGUN_SHIELD_PRIVATE_KEY="${SHIELD_KEY ?? `0x${crypto.randomBytes(32).toString("hex")}`}"`);
console.log(`RAILGUN_ARTIFACTS_PATH=${ARTIFACTS}`);
console.log("\nNotes:");
console.log("- The mnemonic IS the private balance. Back it up off-disk before using mainnet funds.");
console.log("- RAILGUN_WALLET_ID is derived from the mnemonic (index 0) — always matches at runtime.");
console.log("- For NETWORK=Ethereum the RPC must be an Ethereum MAINNET rpc, not Sepolia.");
process.exit(0);
