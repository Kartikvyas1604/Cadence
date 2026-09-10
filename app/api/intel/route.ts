import { NextResponse } from "next/server";
import { z } from "zod";
import { logRequest, rateLimit } from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const IntelResponseSchema = z.object({
  suggestedAskPerEth: z.coerce.number().positive().max(1e6),
  rationale: z.string().max(500).optional(),
  source: z.string().max(200).optional(),
});

/** x402 v2 network ids we can pay with, chosen by env. */
type Scheme = "evm" | "hedera";

function configuredScheme(): Scheme | null {
  if (!process.env.X402_INTEL_URL) return null;
  const s = (process.env.X402_SCHEME ?? "evm").toLowerCase();
  if (s === "evm" && process.env.X402_PRIVATE_KEY) return "evm";
  if (s === "hedera" && process.env.HEDERA_PRIVATE_KEY) return "hedera";
  return null;
}

async function buildPaidFetch(): Promise<(url: string, init?: RequestInit) => Promise<Response>> {
  const scheme = configuredScheme();
  if (!scheme) throw new Error("intel_not_configured");

  if (scheme === "evm") {
    const { wrapFetchWithPaymentFromConfig } = await import("@x402/fetch");
    const { ExactEvmScheme } = await import("@x402/evm");
    const { privateKeyToAccount } = await import("viem/accounts");
    const account = privateKeyToAccount(process.env.X402_PRIVATE_KEY as `0x${string}`);
    return wrapFetchWithPaymentFromConfig(fetch, {
      schemes: [{ network: (process.env.X402_NETWORK ?? "eip155:84532") as `${string}:${string}`, client: new ExactEvmScheme(account) }],
    });
  }

  // Hedera (Blocky402 testnet path) — dynamic import keeps the heavy SDK out
  // of the critical path and degrades gracefully if it fails.
  const { wrapFetchWithPaymentFromConfig } = await import("@x402/fetch");
  const mod = (await import("@x402/hedera/exact/client")) as unknown as {
    ExactHederaScheme: new (signer: never) => unknown;
  };
  const hedera = (await import("@x402/hedera")) as unknown as {
    createClientHederaSigner: (accountId: string, key: unknown, opts: { network: string }) => never;
  };
  const { PrivateKey } = (await import("@hiero-ledger/sdk")) as unknown as {
    PrivateKey: { fromStringECDSA: (s: string) => unknown };
  };
  const network = process.env.HEDERA_NETWORK ?? "hedera:testnet";
  const signer = hedera.createClientHederaSigner(
    process.env.HEDERA_ACCOUNT_ID as string,
    PrivateKey.fromStringECDSA(process.env.HEDERA_PRIVATE_KEY as string),
    { network },
  );
  return wrapFetchWithPaymentFromConfig(fetch, {
    schemes: [
      {
        network: network as `${string}:${string}`,
        client: new mod.ExactHederaScheme(signer) as never,
      },
    ],
  });
}

/**
 * Paid capacity/toxicity intel (Hedera x402 — Blocky402). One call charges
 * real stablecoin payment through the facilitator; the response writes the
 * Cadence-slot ask in the UI. Server-held payer key — never exposed.
 */
export async function GET() {
  return NextResponse.json(
    { error: "method_not_allowed", detail: "Paid intel is POST-only — one click, one payment." },
    { status: 405, headers: { allow: "POST" } },
  );
}

/** In-memory idempotency cache (single Vercel isolate — demo-grade). */
const idempotencyCache = new Map<string, { quote: unknown; ts: number }>();
const IDEMPOTENCY_TTL_MS = 10 * 60 * 1000;

export async function POST(req: Request) {
  const limited = rateLimit(req, "intel", 5, 60_000);
  if (limited) return limited;

  const idempotencyKey = req.headers.get("idempotency-key");
  if (!idempotencyKey || idempotencyKey.length < 8) {
    return NextResponse.json(
      { error: "idempotency_key_required", detail: "Send an Idempotency-Key header (UUID) — one key = one paid call." },
      { status: 400 },
    );
  }

  // H1: replay returns cached quote without a second payment
  const cached = idempotencyCache.get(idempotencyKey);
  if (cached && Date.now() - cached.ts < IDEMPOTENCY_TTL_MS) {
    return NextResponse.json(cached.quote, { headers: { "cache-control": "no-store", "x-idempotent-replay": "true" } });
  }

  if (!configuredScheme()) {
    return NextResponse.json(
      {
        error: "intel_not_configured",
        detail:
          "Paid intel requires X402_INTEL_URL plus a payer key (X402_PRIVATE_KEY for EVM, HEDERA_PRIVATE_KEY + HEDERA_ACCOUNT_ID for Hedera). No fake quote is served.",
      },
      { status: 503 },
    );
  }

  const id = logRequest(req, "intel");
  try {
    const paidFetch = await buildPaidFetch();
    const res = await paidFetch(process.env.X402_INTEL_URL as string, {
      method: "GET",
      headers: { "x-request-id": id },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      return NextResponse.json({ error: "intel_upstream_error", status: res.status }, { status: 502 });
    }
    const raw = await res.json();
    const quote = IntelResponseSchema.safeParse(raw);
    if (!quote.success) {
      return NextResponse.json(
        { error: "intel_invalid_payload", detail: quote.error.issues.slice(0, 3) },
        { status: 502 },
      );
    }
    // decode settlement when present (proof the payment settled)
    const settlementHeader = res.headers.get("payment-response");
    const response = {
      suggestedAskPerEth: quote.data.suggestedAskPerEth,
      rationale: quote.data.rationale ?? "Paid capacity/toxicity intel",
      source: quote.data.source ?? process.env.X402_INTEL_URL,
      paid: true,
      settlement: settlementHeader ? "settled" : "unknown",
      asOf: Date.now(),
    };
    idempotencyCache.set(idempotencyKey, { quote: response, ts: Date.now() });
    return NextResponse.json(response, {
      headers: { "cache-control": "no-store", "x-request-id": id },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    return NextResponse.json(
      { error: msg === "intel_not_configured" ? msg : "intel_call_failed", detail: msg },
      { status: msg === "intel_not_configured" ? 503 : 502 },
    );
  }
}
