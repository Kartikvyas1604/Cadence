import { NextResponse } from "next/server";
import { createPublicClient, http, formatUnits } from "viem";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * The PAID intel endpoint (bounty #3) — deployed alongside the app.
 * x402 flow:
 *   1. GET without payment  → 402 + PAYMENT-REQUIRED header (exact hedera USDC)
 *   2. client retries with PAYMENT-SIGNATURE → verify via Blocky402 facilitator
 *   3. settle on-chain → return the REAL slot-ask quote (live pool utilization)
 *
 * payTo / feePayer come from env:
 *   X402_PAY_TO      (merchant Hedera account, e.g. 0.0.10455616)
 *   X402_FEE_PAYER   (facilitator fee payer, default 0.0.7162784)
 *   HOOK_ADDRESS + RPC_URL (pool reads for the real ask)
 */

const PAY_TO = process.env.X402_PAY_TO || "0.0.10455616";
const FEE_PAYER = process.env.X402_FEE_PAYER || "0.0.7162784";
const ASSET = "0.0.429274"; // Hedera testnet USDC
const NETWORK = "hedera:testnet";
const AMOUNT = process.env.X402_AMOUNT || "100000"; // 0.1 USDC (6 decimals)
const HOOK = process.env.HOOK_ADDRESS || "0x5fD91266BF19d3fF8d0596607C68FD2be8d44088";
const RPC = process.env.RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com";
const FACILITATOR = process.env.FACILITATOR_URL || "https://api.testnet.blocky402.com";

const hookAbi = [
  { type: "function", name: "currentEpoch", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "epochCapacityEth", stateMutability: "view", inputs: [{ name: "", type: "uint256" }], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "remainingCapacity", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "soldCapacityEth", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
];

/** REAL ask from live pool state — utilization up → ask up, bounded 50–200%. */
async function computeAsk(origin: string) {
  const pc = createPublicClient({ transport: http(RPC) });
  const epoch = await pc.readContract({ address: HOOK as `0x${string}`, abi: hookAbi, functionName: "currentEpoch" });
  const capacity = (await pc.readContract({ address: HOOK as `0x${string}`, abi: hookAbi, functionName: "epochCapacityEth", args: [epoch] })) as bigint;
  const sold = (await pc.readContract({ address: HOOK as `0x${string}`, abi: hookAbi, functionName: "soldCapacityEth" })) as bigint;
  const remaining = capacity - sold;
  const utilization = capacity > 0n ? Number((sold * 10000n) / capacity) / 10000 : 0;

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

export async function GET(req: Request) {
  // x402 v2 sends the signed payload in PAYMENT-SIGNATURE (v1 uses X-PAYMENT)
  const paymentHeader =
    req.headers.get("payment-signature") ?? req.headers.get("x-payment") ?? req.headers.get("payment");

  // ---- 1. no payment → 402 + requirements in PAYMENT-REQUIRED header ----
  if (!paymentHeader) {
    const requirements = {
      scheme: "exact",
      network: NETWORK,
      amount: AMOUNT,
      asset: ASSET,
      payTo: PAY_TO,
      maxTimeoutSeconds: 300,
      extra: { feePayer: FEE_PAYER },
    };
    const body = {
      x402Version: 2,
      error: "Payment required",
      resource: {
        url: new URL(req.url).toString(),
        description: "Cadence capacity/toxicity intel — one quote, one payment",
        mimeType: "application/json",
      },
      accepts: [requirements],
    };
    // x402 v2 envelope: the client (@x402/fetch) parses this header shape
    const envelope = {
      x402Version: 2,
      error: "Payment required",
      resource: {
        url: new URL(req.url).toString(),
        description: "Cadence capacity/toxicity intel — one quote, one payment",
        mimeType: "application/json",
      },
      accepts: [requirements],
    };
    const encoded = Buffer.from(JSON.stringify(envelope)).toString("base64");
    return NextResponse.json({}, {
      status: 402,
      headers: {
        "payment-required": encoded,
        "access-control-expose-headers": "PAYMENT-REQUIRED",
      },
    });
  }

  // ---- 2. payment present → verify with the Blocky402 facilitator ----
  let payload: unknown;
  try {
    // PAYMENT-SIGNATURE value is the base64-encoded signed payload
    payload = JSON.parse(Buffer.from(paymentHeader, "base64").toString("utf8"));
  } catch {
    // tolerate a raw-JSON header too
    payload = JSON.parse(paymentHeader);
  }

  const requirements = {
    scheme: "exact",
    network: NETWORK,
    amount: AMOUNT,
    asset: ASSET,
    payTo: PAY_TO,
    maxTimeoutSeconds: 300,
    extra: { feePayer: FEE_PAYER },
  };

  const verifyRes = await fetch(`${FACILITATOR}/verify`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ x402Version: 2, paymentPayload: payload, paymentRequirements: requirements }),
    signal: AbortSignal.timeout(15_000),
  });
  const verification = (await verifyRes.json()) as { isValid?: boolean; invalidReason?: string; payer?: string };
  if (!verification.isValid) {
    return NextResponse.json(
      { error: "payment_verification_failed", reason: verification.invalidReason ?? "unknown" },
      { status: 402 },
    );
  }

  // ---- 3. settle on-chain, then serve the REAL quote ----
  const settleRes = await fetch(`${FACILITATOR}/settle`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ x402Version: 2, paymentPayload: payload, paymentRequirements: requirements }),
    signal: AbortSignal.timeout(30_000),
  });
  const settlement = (await settleRes.json()) as { success?: boolean; transaction?: string; errorReason?: string };
  if (!settlement.success) {
    return NextResponse.json(
      { error: "settlement_failed", reason: settlement.errorReason ?? "unknown" },
      { status: 402 },
    );
  }

  const quote = await computeAsk(new URL(req.url).origin);
  return NextResponse.json(quote, {
    headers: {
      "cache-control": "no-store",
      "payment-response": Buffer.from(JSON.stringify({
        success: true,
        network: NETWORK,
        transaction: settlement.transaction ?? "settled",
      })).toString("base64"),
      "access-control-expose-headers": "PAYMENT-RESPONSE",
    },
  });
}
