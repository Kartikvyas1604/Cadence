import { describe, test, afterEach } from "node:test";
import assert from "node:assert/strict";

async function loadAdapter() {
  return import("../../lib/shield/adapter.ts");
}

describe("lib/shield — env-gated fund path (H7)", () => {
  afterEach(() => {
    delete process.env.RAILGUN_NETWORK;
    delete process.env.RAILGUN_RPC_URL;
    delete process.env.RAILGUN_MNEMONIC;
    delete process.env.RAILGUN_ENCRYPTION_KEY;
    delete process.env.RAILGUN_WALLET_ID;
    delete process.env.RAILGUN_SHIELD_PRIVATE_KEY;
    delete process.env.RAILGUN_ARTIFACTS_PATH;
    delete process.env.AZTEC_NODE_URL;
    delete process.env.AZTEC_ACCOUNT_SECRET;
  });

  test("unconfigured → NotWired naming the exact missing env (no fake tx)", async () => {
    const { shield, unshieldTo, NotWired } = await loadAdapter();
    await assert.rejects(
      () => shield("railgun", { amountWei: "1000000000000000000" }),
      (e: unknown) => {
        assert.ok(e instanceof NotWired);
        assert.match(e.message, /railgun adapter not configured/);
        assert.match(e.message, /RAILGUN_MNEMONIC/);
        return true;
      },
    );
    await assert.rejects(
      () => unshieldTo("railgun", { to: "0x0000000000000000000000000000000000000001", amountWei: "1" }),
      (e: unknown) => e instanceof NotWired,
    );
    await assert.rejects(
      () => shield("aztec", { amountWei: "1" }),
      (e: unknown) => {
        assert.ok(e instanceof NotWired);
        assert.match(e.message, /AZTEC_NODE_URL/);
        return true;
      },
    );
  });

  test("isConfigured flips on with env set; unset path stays fail-closed", async () => {
    const { isConfigured } = await loadAdapter();
    assert.equal(isConfigured("railgun"), false);
    assert.equal(isConfigured("aztec"), false);

    process.env.RAILGUN_NETWORK = "EthereumSepolia";
    process.env.RAILGUN_RPC_URL = "https://rpc.test";
    process.env.RAILGUN_MNEMONIC = "test test test test test test test test test test test junk";
    process.env.RAILGUN_ENCRYPTION_KEY = "a".repeat(32);
    process.env.RAILGUN_WALLET_ID = "0xwalletid";
    process.env.RAILGUN_SHIELD_PRIVATE_KEY = "0x" + "a".repeat(64);
    process.env.RAILGUN_ARTIFACTS_PATH = "/tmp/cadence-railgun-artifacts-test";
    assert.equal(isConfigured("railgun"), true);
    assert.equal(isConfigured("aztec"), false);
  });

  test("configured railgun with an unsupported network fails closed (no fake tx)", async () => {
    const { shield } = await loadAdapter();
    process.env.RAILGUN_NETWORK = "EthereumSepolia"; // not supported by pinned quickstart
    process.env.RAILGUN_RPC_URL = "https://rpc.test";
    process.env.RAILGUN_MNEMONIC = "test test test test test test test test test test test junk";
    process.env.RAILGUN_ENCRYPTION_KEY = "a".repeat(32);
    process.env.RAILGUN_WALLET_ID = "0xwalletid";
    process.env.RAILGUN_SHIELD_PRIVATE_KEY = "0x" + "a".repeat(64);
    process.env.RAILGUN_ARTIFACTS_PATH = "/tmp/cadence-railgun-artifacts-test";
    await assert.rejects(
      () => shield("railgun", { amountWei: "1000000000000000000" }),
      (e: unknown) => {
        assert.ok(e instanceof Error);
        assert.match(e.message, /railgun_network_unsupported/);
        return true;
      },
    );
  });

  test("shieldToCadencePayer propagates the honest failure for the full path", async () => {
    const { shieldToCadencePayer, NotWired } = await loadAdapter();
    await assert.rejects(
      () =>
        shieldToCadencePayer(
          "railgun",
          { amountWei: "1000000000000000000" },
          { to: "0x0000000000000000000000000000000000000001", amountWei: "1000000000000000000" },
        ),
      (e: unknown) => e instanceof NotWired,
    );
  });
});
