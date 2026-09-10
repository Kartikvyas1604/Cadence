import { NextResponse } from "next/server";
import { createPublicClient, http, formatUnits, sha256, toHex } from "viem";
import { IDEMPOTENCY_TTL_MS, StoreUnavailableError, withIdempotency } from "../../../../lib/server/idempotency";
import { resolveHookAddress } from "../../../../lib/server/manifest";
import { rateLimit } from "../../../../lib/server/rate-limit";
import { trackError } from "../../../../lib/server/observe";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * The PAID intel endpoint (bounty #3) — deployed alongside the app.
 * x402 flow:
 *   1. GET without payment  → 402 + PAYMENT-REQUIRED header (exact hedera USDC)
 *   2. client retries with PAYMENT-SIGNATURE → verify via Blocky402 facilitator
 *   3. settle on-chain → return the REAL slot-ask quote (live pool utilization)
 *
 * Money integrity (H4): every settle is idempotent. The idempotency key comes
 * from the Idempotency-Key header, or — when absent — from the verified
 * payment payload fingerprint itself, so a retry of the same signed payload
 * can never settle twice. Replays return the cached quote + the original
 * payment-response without touching the facilitator again. Failed payments
 * are never cached — a legitimate retry can re-run.
 *
 * Pool integrity (H3): the hook address is required — env (HOOK_ADDRESS) or
 * the deployment manifest for the active chain. A missing/unreadable/zero-
 * capacity hook fails closed with 503 intel_pool_unreadable BEFORE any
 * settlement — no paid quote is ever served from the wrong or empty pool.
 *
 * payTo / feePayer come from env (no secrets are ever printed):
 *   X402_PAY_TO      (merchant Hedera account)
 *   X402_FEE_PAYER   (facilitator fee payer)
 *   HOOK_ADDRESS + RPC_URL (pool reads for the real ask)
 */

const PAY_TO = process.env.X402_PAY_TO || "0.0.10455616";
const FEE_PAYER = process.env.X402_FEE_PAYER || "0.0.7162784";
const ASSET = "0.0.429274"; // Hedera testnet USDC
const NETWORK = "hedera:testnet";
const AMOUNT = process.env.X402_AMOUNT || "100000"; // 0.1 USDC (6 decimals)
const RPC = process.env.RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com";
const FACILITATOR = process.env.FACILITATOR_URL || "https://api.testnet.blocky402.com";

const hookAbi = [
  { type: "function", name: "currentEpoch", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "epochCapacityEth", stateMutability: "view", inputs: [{ name: "", type: "uint256" }], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "activeEth", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "remainingCapacity", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "soldCapacityEth", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
];

class PaymentError extends Error {
  constructor(
    public readonly body: Record<string, unknown>,
  ) {
    super("payment_error");
  }
}

/** REAL ask from live pool state — utilization up → ask up, bounded 50–200%. */
async function computeAsk(hook: string) {
  const pc = createPublicClient({ transport: http(RPC) });
  const epoch = await pc.readContract({ address: hook as `0x${string}`, abi: hookAbi, functionName: "currentEpoch" });
  const capacity = (await pc.readContract({ address: hook as `0x${string}`, abi: hookAbi, functionName: "epochCapacityEth", args: [epoch] })) as bigint;
  const sold = (await pc.readContract({ address: hook as `0x${string}`, abi: hookAbi, functionName: "soldCapacityEth" })) as bigint;
  const remaining = capacity > sold ? capacity - sold : 0n;
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

/**
 * Pre-flight pool read (H3): the hook must exist AND hold reserves BEFORE
 * any payment is taken. The epoch budget resets to zero at every epoch roll
 * (the hook refreshes lazily on demand), so budget == 0 alone is NOT an
 * empty pool — the discriminator is reserves: activeEth > 0 means the venue
 * is seeded and the budget restores on the next refresh. Unreadable hook or
 * a truly unseeded pool → 503 intel_pool_unreadable, no settle, no quote.
 */
async function preflightPool(hook: string) {
  let capacity: bigint;
  let activeEth: bigint;
  try {
    const pc = createPublicClient({ transport: http(RPC) });
    const epoch = await pc.readContract({ address: hook as `0x${string}`, abi: hookAbi, functionName: "currentEpoch" });
    [capacity, activeEth] = await Promise.all([
      pc.readContract({ address: hook as `0x${string}`, abi: hookAbi, functionName: "epochCapacityEth", args: [epoch] }) as Promise<bigint>,
      pc.readContract({ address: hook as `0x${string}`, abi: hookAbi, functionName: "activeEth" }) as Promise<bigint>,
    ]);
  } catch {
    return false;
  }
  return capacity > 0n || activeEth > 0n;
}

function paymentRequirements() {
  return {
    scheme: "exact",
    network: NETWORK,
    amount: AMOUNT,
    asset: ASSET,
    payTo: PAY_TO,
    maxTimeoutSeconds: 300,
    extra: { feePayer: FEE_PAYER },
  };
}

export async function GET(req: Request) {
  const limited = rateLimit(req, "intel-ask", 30, 60_000);
  if (limited) return limited;

  // x402 v2 sends the signed payload in PAYMENT-SIGNATURE (v1 uses X-PAYMENT)
  const paymentHeader =
    req.headers.get("payment-signature") ?? req.headers.get("x-payment") ?? req.headers.get("payment");

  // ---- 0. pool must be readable BEFORE any payment is taken (H3) ----
  const hook = await resolveHookAddress();
  if (!hook) {
    return NextResponse.json(
      {
        error: "intel_pool_unreadable",
        detail: "Hook address unresolved (set HOOK_ADDRESS or publish the deployment manifest) — no quote is sold.",
      },
      { status: 503 },
    );
  }
  if (!(await preflightPool(hook))) {
    return NextResponse.json(
      {
        error: "intel_pool_unreadable",
        detail: "Epoch capacity is zero or unreadable on the live hook — no quote is sold.",
      },
      { status: 503 },
    );
  }

  // ---- 1. no payment → 402 + requirements in PAYMENT-REQUIRED header ----
  if (!paymentHeader) {
    const envelope = {
      x402Version: 2,
      error: "Payment required",
      resource: {
        url: new URL(req.url).toString(),
        description: "Cadence capacity/toxicity intel — one quote, one payment",
        mimeType: "application/json",
      },
      accepts: [paymentRequirements()],
    };
    return NextResponse.json(envelope, {
      status: 402,
      headers: {
        "payment-required": Buffer.from(JSON.stringify(envelope)).toString("base64"),
        "access-control-expose-headers": "PAYMENT-REQUIRED",
      },
    });
  }

  // ---- 2. idempotent settle: verify + settle at most once per key ----
  let idemKey = req.headers.get("idempotency-key");
  if (!idemKey || idemKey.length < 8) {
    // stable fallback: fingerprint the verified payment payload itself — the
    // same signed payload retried settles exactly once (H4)
    idemKey = sha256(toHex(paymentHeader));
  }

  let outcome: { result: { quote: unknown; paymentResponse: string }; replayed: boolean };
  try {
    outcome = await withIdempotency<{ quote: unknown; paymentResponse: string }>(
      idemKey,
      IDEMPOTENCY_TTL_MS,
      async () => {
        let payload: unknown;
        try {
          // PAYMENT-SIGNATURE value is the base64-encoded signed payload
          payload = JSON.parse(Buffer.from(paymentHeader, "base64").toString("utf8"));
        } catch {
          // tolerate a raw-JSON header too
          payload = JSON.parse(paymentHeader);
        }

        const verifyRes = await fetch(`${FACILITATOR}/verify`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ x402Version: 2, paymentPayload: payload, paymentRequirements: paymentRequirements() }),
          signal: AbortSignal.timeout(15_000),
        });
        const verification = (await verifyRes.json()) as { isValid?: boolean; invalidReason?: string; payer?: string };
        if (!verification.isValid) {
          throw new PaymentError({
            error: "payment_verification_failed",
            reason: verification.invalidReason ?? "unknown",
          });
        }

        const settleRes = await fetch(`${FACILITATOR}/settle`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ x402Version: 2, paymentPayload: payload, paymentRequirements: paymentRequirements() }),
          signal: AbortSignal.timeout(30_000),
        });
        const settlement = (await settleRes.json()) as { success?: boolean; transaction?: string; errorReason?: string };
        if (!settlement.success) {
          throw new PaymentError({
            error: "settlement_failed",
            reason: settlement.errorReason ?? "unknown",
          });
        }

        const quote = await computeAsk(hook);
        const paymentResponse = Buffer.from(
          JSON.stringify({ success: true, network: NETWORK, transaction: settlement.transaction ?? "settled" }),
        ).toString("base64");
        return { quote, paymentResponse };
      },
    );
  } catch (e) {
    trackError("intel-ask", e);
    if (e instanceof PaymentError) {
      return NextResponse.json(e.body, { status: 402 });
    }
    if (e instanceof StoreUnavailableError) {
      return NextResponse.json(
        { error: "idempotency_store_unavailable", detail: "The idempotency store is down — refusing to risk a double settle." },
        { status: 503 },
      );
    }
    throw e;
  }

  const { result, replayed } = outcome;
  const headers: Record<string, string> = {
    "cache-control": "no-store",
    "payment-response": result.paymentResponse,
    "access-control-expose-headers": "PAYMENT-RESPONSE",
  };
  if (replayed) headers["x-idempotent-replay"] = "true";
  return NextResponse.json(result.quote, { headers });
}

export async function POST() {
  return NextResponse.json(
    { error: "method_not_allowed", detail: "The intel merchant is x402 GET-based — send an unpaid GET for the 402 challenge." },
    { status: 405, headers: { allow: "GET" } },
  );
}
