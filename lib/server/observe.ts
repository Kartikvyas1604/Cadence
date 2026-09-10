/**
 * Server-only error tracking (backend-4). Structured console error lines with
 * a scrubber — env secret VALUES are never emitted. Wire into Route Handler
 * catch paths so paid intel / graph / LVR 5xxs are visible without reading
 * raw logs. An external sink (Sentry/OTel) can subscribe later by replacing
 * `emit` — the scrubbing contract stays the same.
 */

/** Env var names whose values must never appear in logs. */
const SECRET_KEYS = [
  "PRIVATE_KEY",
  "X402_PRIVATE_KEY",
  "HEDERA_PRIVATE_KEY",
  "GRAPH_API_KEY",
  "CRE_API_KEY",
  "UPSTASH_REDIS_REST_TOKEN",
];

function scrub(text: string): string {
  let out = text;
  for (const key of SECRET_KEYS) {
    const value = process.env[key];
    if (value && value.length > 8) {
      out = out.split(value).join("<redacted>");
    }
  }
  // hex private keys look-alikes (best effort, shape-based)
  out = out.replace(/0x[0-9a-fA-F]{64}/g, "<redacted-0x64>");
  return out;
}

export function trackError(route: string, error: unknown, extra: Record<string, unknown> = {}): void {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;
  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      level: "error",
      route,
      message: scrub(message),
      ...(stack ? { stack: scrub(stack) } : {}),
      ...Object.fromEntries(Object.entries(extra).map(([k, v]) => [k, scrub(String(v))])),
    }),
  );
}
