import { NextResponse } from "next/server";
import { z } from "zod";
import { parseEther } from "viem";
import { isConfigured, missingEnvFor, shield, unshieldTo } from "@/lib/shield/adapter";
import { logRequest, rateLimit } from "@/lib/server/rate-limit";
import { trackError } from "@/lib/server/observe";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BodySchema = z.object({
  op: z.enum(["shield", "unshield"]),
  protocol: z.enum(["railgun", "aztec"]),
  amountEth: z.string().regex(/^\d+(\.\d{1,18})?$/, "invalid amount"),
  to: z
    .string()
    .regex(/^0x[0-9a-fA-F]{40}$/, "invalid address")
    .optional(),
});

/**
 * Shield fund path (Extended §7). Heavy SDKs run server-side behind env
 * gating; with env unset every call fails closed (503) naming how many vars
 * are missing — funds are never moved and nothing is simulated.
 */
export async function POST(req: Request) {
  const limited = rateLimit(req, "shield", 10, 10_000);
  if (limited) return limited;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_request", detail: parsed.error.issues.slice(0, 3).map((i) => i.message).join("; ") },
      { status: 400 },
    );
  }
  const { op, protocol, amountEth, to } = parsed.data;

  if (op === "unshield" && !to) {
    return NextResponse.json({ error: "missing_recipient", detail: "unshield needs a `to` payer address" }, { status: 400 });
  }

  if (!isConfigured(protocol)) {
    const missing = missingEnvFor(protocol);
    return NextResponse.json(
      {
        error: "not_wired",
        detail: `${protocol} is not configured on this deployment — ${missing.length} env var(s) missing. Funds are NOT moved. The commit-reveal path on this page works today without it.`,
      },
      { status: 503 },
    );
  }

  try {
    const amountWei = parseEther(amountEth).toString();
    if (op === "shield") {
      const r = await shield(protocol, { amountWei });
      logRequest(req, "shield", { protocol, op });
      if (r.txHash) {
        return NextResponse.json({ tx: r.txHash, populatedTx: r.populatedTx, note: "shield transaction settled" });
      }
      if (r.populatedTx) {
        return NextResponse.json({
          tx: null,
          populatedTx: r.populatedTx,
          note: "shield transaction populated — broadcast it with your wallet to settle",
        });
      }
      throw new Error("railgun_shield_empty: the SDK returned neither a settled hash nor a populated tx");
    }
    const r = await unshieldTo(protocol, {
      to: to as `0x${string}`,
      amountWei,
      onProofProgress: () => {},
    });
    logRequest(req, "shield", { protocol, op });
    if (r.txHash) {
      return NextResponse.json({ tx: r.txHash, populatedTx: r.populatedTx, note: "unshield transaction settled — the payer wallet is funded" });
    }
    if (r.populatedTx) {
      return NextResponse.json({
        tx: null,
        populatedTx: r.populatedTx,
        note: "unshield transaction proved and populated — broadcast it with your wallet to fund the payer",
      });
    }
    throw new Error("railgun_unshield_empty: the SDK returned neither a settled hash nor a populated tx");
  } catch (e) {
    trackError("shield", e, { protocol, op });
    const message = e instanceof Error ? e.message : "shield operation failed";
    return NextResponse.json({ error: "shield_failed", detail: message.slice(0, 300) }, { status: 500 });
  }
}
