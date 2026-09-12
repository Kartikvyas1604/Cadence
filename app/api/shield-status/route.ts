import { NextResponse } from "next/server";
import { isConfigured, missingEnvFor, type ShieldProtocol } from "@/lib/shield/adapter";
import { logRequest, rateLimit } from "@/lib/server/rate-limit";
import { trackError } from "@/lib/server/observe";

export const dynamic = "force-dynamic";

const PROTOCOLS: readonly ShieldProtocol[] = ["railgun", "aztec"];

/**
 * Reports which shield adapters (Railgun/Aztec) are configured on this
 * deployment. Env names stay server-side — only the configured flag and the
 * COUNT of missing vars cross the wire, never their values or names.
 */
export async function GET(req: Request) {
  const limited = rateLimit(req, "shield-status", 30, 10_000);
  if (limited) return limited;
  try {
    const adapters = Object.fromEntries(
      PROTOCOLS.map((p) => [p, { configured: isConfigured(p), missing: missingEnvFor(p).length }]),
    );
    logRequest(req, "shield-status", { adapters });
    return NextResponse.json({ adapters });
  } catch (e) {
    trackError("shield-status", e);
    return NextResponse.json({ error: "status_unavailable" }, { status: 500 });
  }
}
