import { NextResponse } from "next/server";

/**
 * Fixed-window in-memory rate limiter for public API routes.
 * Per-instance (single Vercel region) — sufficient for this deployment;
 * swap for a shared store if scaling beyond one region.
 */
const windows = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(req: Request, name: string, limit: number, windowMs: number): NextResponse | null {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";
  const key = `${name}:${ip}`;
  const now = Date.now();
  const w = windows.get(key);
  if (!w || w.resetAt < now) {
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return null;
  }
  w.count += 1;
  if (w.count > limit) {
    return NextResponse.json(
      { error: "rate_limited", detail: "Too many requests — retry shortly." },
      { status: 429, headers: { "retry-after": String(Math.ceil((w.resetAt - now) / 1000)) } },
    );
  }
  return null;
}

/** Structured JSON log line with a correlation id. */
export function logRequest(req: Request, name: string, extra: Record<string, unknown> = {}) {
  const id = req.headers.get("x-request-id") ?? crypto.randomUUID();
  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      level: "info",
      route: name,
      requestId: id,
      ...extra,
    }),
  );
  return id;
}
