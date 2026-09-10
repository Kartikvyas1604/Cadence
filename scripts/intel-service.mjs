#!/usr/bin/env node
/**
 * Cadence Intel Service — the PAID intel node (Extended §F / bounty #3).
 *
 *   GET /ask   — x402 paywall → after payment: REAL slot-ask quote
 *
 * The ask is computed from live on-chain pool state (deployed CadenceHook via
 * public RPC): utilization up → ask up, bounded 50–200% of the deploy ask.
 * Payment settles through the Blocky402 hosted testnet facilitator.
 *
 * Run:  node scripts/intel-service.mjs            (port 4002)
 * Env:  PAY_TO (or HEDERA_ACCOUNT_ID) — where the intel fee lands
 *       HOOK_ADDRESS, RPC_URL, PORT, ASK_PRICE, X402_NETWORK, FACILITATOR_URL
 */
import express from "express";
import { createPublicClient, http, formatUnits } from "viem";
import { paymentMiddleware } from "@x402/express";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { x402ResourceServer } from "@x402/core/server";
import { ExactHederaScheme } from "@x402/hedera/exact/server";

const PORT = process.env.PORT || 4002;
const RPC = process.env.RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com";
const HOOK = process.env.HOOK_ADDRESS || "0x5fD91266BF19d3fF8d0596607C68FD2be8d44088";
const NETWORK = process.env.X402_NETWORK || "hedera:testnet";
const PRICE = process.env.ASK_PRICE || "$0.10"; // x402 v2 price format
const PAY_TO = process.env.PAY_TO || process.env.HEDERA_ACCOUNT_ID;
const FACILITATOR = process.env.FACILITATOR_URL || "https://api.testnet.blocky402.com";

if (!PAY_TO) {
  console.error("PAY_TO (or HEDERA_ACCOUNT_ID) required — create a testnet account at https://portal.hedera.com/register");
  process.exit(1);
}

const pc = createPublicClient({ transport: http(RPC) });

const hookAbi = [
  { type: "function", name: "currentEpoch", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "epochCapacityEth", stateMutability: "view", inputs: [{ name: "", type: "uint256" }], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "remainingCapacity", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "soldCapacityEth", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
];

/** REAL capacity/toxicity ask from live pool state — no fabrication. */
async function computeAsk() {
  const epoch = await pc.readContract({ address: HOOK, abi: hookAbi, functionName: "currentEpoch" });
  const capacity = await pc.readContract({ address: HOOK, abi: hookAbi, functionName: "epochCapacityEth", args: [epoch] });
  const sold = await pc.readContract({ address: HOOK, abi: hookAbi, functionName: "soldCapacityEth" });
  const remaining = capacity - sold;
  const utilization = capacity > 0n ? Number((sold * 10000n) / capacity) / 10000 : 0;

  // ask (wei-ETH per 1 ETH of capacity): 0.001 * (1 + utilization), clamped 50–200%
  const deployAsk = Number(formatUnits(1000000000000000n, 18));
  const ask = Math.min(deployAsk * 2, Math.max(deployAsk * 0.5, deployAsk * (1 + utilization)));
  return {
    suggestedAskPerEth: ask,
    utilization: Number(utilization.toFixed(4)),
    remainingCapacityEth: Number(formatUnits(remaining, 18)),
    rationale: `paid capacity/toxicity intel: utilization ${(utilization * 100).toFixed(1)}% of epoch budget, ${Number(formatUnits(remaining, 18)).toFixed(3)} ETH remaining`,
    source: "blocky402-hedera-testnet",
    asOf: Date.now(),
  };
}

const facilitator = new HTTPFacilitatorClient({ url: FACILITATOR });

// resource server with the EXACT scheme registered for the paywall network
const resourceServer = new x402ResourceServer(facilitator);
if (NETWORK === "hedera:testnet") {
  resourceServer.register(NETWORK, new ExactHederaScheme());
} else {
  const { ExactEvmScheme } = await import("@x402/evm/exact/server");
  resourceServer.register(NETWORK, new ExactEvmScheme());
}

const app = express();

app.use(
  paymentMiddleware(
    {
      "GET /ask": {
        accepts: {
          scheme: "exact",
          price: PRICE,
          network: NETWORK,
          payTo: PAY_TO,
          asset: process.env.ASSET || (NETWORK === "hedera:testnet" ? "0.0.429274" : undefined),
        },
        description: "Cadence capacity/toxicity intel — one quote, one payment",
        mimeType: "application/json",
      },
    },
    resourceServer,
  ),
);

app.get("/ask", async (req, res) => {
  try {
    const quote = await computeAsk();
    res.json(quote);
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "quote failed" });
  }
});

app.listen(PORT, () =>
  console.log(`cadence intel service: http://localhost:${PORT}/ask\nx402 paywall: ${NETWORK} · payTo ${PAY_TO} · facilitator ${FACILITATOR}`),
);
