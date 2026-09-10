import { NextResponse } from "next/server";
import { z } from "zod";
import { sha256, toHex } from "viem";
import { logRequest, rateLimit } from "../../../lib/server/rate-limit";
import { trackError } from "../../../lib/server/observe";
import { IDEMPOTENCY_TTL_MS, withIdempotency } from "../../../lib/server/idempotency";

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
 *
 * Honesty (M11): `paid: true` + `settlement: "settled"` require an OBSERVED
 * payment-response header from the merchant — the x402 challenge must have
 * completed. Without observed settlement evidence the response reports
 * `paid: false` / `settlement: "unverified"` — a bare POST can never fake
 * settled state.
 */
export async function GET() {
  return NextResponse.json(
    { error: "method_not_allowed", detail: "Paid intel is POST-only — one click, one payment." },
    { status: 405, headers: { allow: "POST" } },
  );
}

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
    // M-IDEM: durable reserve-or-read — at most ONE paid call per key across
    // isolates; store failure fails closed (503) rather than paying twice
    const { result, replayed } = await withIdempotency(idempotencyKey, IDEMPOTENCY_TTL_MS, async () => {
      const paidFetch = await buildPaidFetch();
      const res = await paidFetch(process.env.X402_INTEL_URL as string, {
        method: "GET",
        headers: { "x-request-id": id },
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) {
        throw new Error(`intel_upstream_error_${res.status}`);
      }
      const raw = await res.json();
      const quote = IntelResponseSchema.safeParse(raw);
      if (!quote.success) {
        throw new Error("intel_invalid_payload");
      }
      // decode settlement when present (proof the payment settled)
      const settlementHeader = res.headers.get("payment-response");
      if (!settlementHeader) {
        // M11: without OBSERVED settlement evidence the response must not
        // claim settled state — the quote is unverified, no attestation hash
        return {
          suggestedAskPerEth: quote.data.suggestedAskPerEth,
          rationale: quote.data.rationale ?? "Paid capacity/toxicity intel",
          source: quote.data.source ?? process.env.X402_INTEL_URL,
          paid: false,
          settlement: "unverified",
          settlementHash: null,
          asOf: Date.now(),
        };
      }
      // M17: stable settlement fingerprint — the receipt bound on-chain is a
      // hash of the OBSERVED settlement proof (payment-response), not a hash
      // of the local quote object
      const settlementHash = sha256(toHex(settlementHeader));
      return {
        suggestedAskPerEth: quote.data.suggestedAskPerEth,
        rationale: quote.data.rationale ?? "Paid capacity/toxicity intel",
        source: quote.data.source ?? process.env.X402_INTEL_URL,
        paid: true,
        settlement: "settled",
        settlementHash,
        asOf: Date.now(),
      };
    });

    if (replayed) {
      return NextResponse.json(result, {
        headers: { "cache-control": "no-store", "x-idempotent-replay": "true", "x-request-id": id },
      });
    }
    return NextResponse.json(result, {
      headers: { "cache-control": "no-store", "x-request-id": id },
    });
  } catch (e) {
    trackError("intel", e, { requestId: id });
    const msg = e instanceof Error ? e.message : "unknown";
    if (msg === "idempotency_store_unavailable") {
      return NextResponse.json(
        { error: "idempotency_store_unavailable", detail: "The idempotency store is down — refusing to risk a double payment." },
        { status: 503 },
      );
    }
    if (msg === "intel_not_configured") {
      return NextResponse.json({ error: msg, detail: "Paid intel is not configured — no fake quote is served." }, { status: 503 });
    }
    if (msg.startsWith("intel_upstream_error_")) {
      return NextResponse.json({ error: "intel_upstream_error", status: Number(msg.split("_").at(-1)) }, { status: 502 });
    }
    return NextResponse.json({ error: msg === "intel_invalid_payload" ? msg : "intel_call_failed", detail: msg }, { status: 502 });
  }
}
