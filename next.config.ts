import type { NextConfig } from "next";

/**
 * backend-3: production CSP for a wallet-connected dapp.
 *  - script-src keeps 'unsafe-inline'/'unsafe-eval': Next's inline hydration
 *    bootstrap has no nonce pipeline here, and injected wallet extensions
 *    write inline scripts. This still contains XSS damage (frame-ancestors
 *    'none', object-src 'none', base-uri/form-action 'self').
 *  - connect-src is an explicit allowlist: app origin + the RPCs/integrations
 *    the server is configured with. Operators with different RPC/studio
 *    endpoints set CSP_CONNECT_SRC (comma-separated).
 *  - ACAO: HTML documents get 'self' — the live Vercel default of '*' on
 *    documents is overridden. The x402 merchant route keeps an open ACAO
 *    (external x402 clients call it cross-origin).
 */
function connectAllowlist(): string {
  return (
    process.env.CSP_CONNECT_SRC ||
    [
      "'self'",
      "https://ethereum-sepolia-rpc.publicnode.com",
      "https://api.studio.thegraph.com",
      "https://api.testnet.blocky402.com",
    ].join(" ")
  );
}

const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  `connect-src ${connectAllowlist()}`,
  "img-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          { key: "Content-Security-Policy", value: CSP },
          // HTML documents are same-origin only; the x402 merchant route keeps
          // an open ACAO for external x402 clients
          { key: "Access-Control-Allow-Origin", value: "self" },
        ],
      },
      {
        source: "/api/intel-service/:path*",
        headers: [{ key: "Access-Control-Allow-Origin", value: "*" }],
      },
    ];
  },
};

export default nextConfig;
