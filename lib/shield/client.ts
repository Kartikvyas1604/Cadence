"use client";

import type { ShieldProtocol } from "@/lib/shield/adapter";

/**
 * Client-side handle on the shield fund path (Extended §7). The heavy
 * Railgun/Aztec SDKs are server-only (env-gated, fail closed) — the browser
 * talks to /api/shield/* which routes to lib/shield/adapter.ts. With env
 * unset the API answers 503 naming the deployment gap; nothing is simulated.
 */

export interface ShieldStatus {
  railgun: { configured: boolean; missing: number };
  aztec: { configured: boolean; missing: number };
}

export interface ShieldRequest {
  protocol: ShieldProtocol;
  amountEth: string;
}

export async function fetchShieldStatus(): Promise<ShieldStatus> {
  const res = await fetch("/api/shield-status", { cache: "no-store" });
  if (!res.ok) throw new Error(`shield status unavailable (${res.status})`);
  const body = (await res.json()) as { adapters: ShieldStatus };
  return body.adapters;
}

export interface ShieldResponse {
  tx: string | null;
  populatedTx: { to: string; data: string; value: string } | null;
  note: string;
}

/** Send the populated tx with the connected browser wallet. Never server-signed. */
async function broadcastPopulated(
  populatedTx: { to: string; data: string; value: string },
): Promise<string | null> {
  const provider = (window as unknown as { ethereum?: { request: (m: string, p: unknown[]) => Promise<unknown> } })
    .ethereum;
  if (!provider) throw new Error("no injected wallet — connect to broadcast the populated tx");
  const hash = (await provider.request("eth_sendTransaction", [
    { to: populatedTx.to, data: populatedTx.data, value: populatedTx.value },
  ])) as string;
  return hash ?? null;
}

/** Shield ETH into the private balance. Fails closed — never fakes a tx. */
export async function shieldFunds(req: ShieldRequest): Promise<ShieldResponse> {
  const res = await fetch("/api/shield", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ op: "shield", protocol: req.protocol, amountEth: req.amountEth }),
  });
  const body = (await res.json()) as {
    tx?: string | null;
    populatedTx?: { to: string; data: string; value: string } | null;
    note?: string;
    error?: string;
    detail?: string;
  };
  if (!res.ok) throw new Error(body.detail ?? body.error ?? `shield failed (${res.status})`);
  let tx = body.tx ?? null;
  // no settled hash but a populated tx — the browser wallet broadcasts it
  if (!tx && body.populatedTx) {
    tx = await broadcastPopulated(body.populatedTx);
  }
  return { tx, populatedTx: body.populatedTx ?? null, note: body.note ?? "" };
}

/** Unshield ETH from the private balance to a public payer address. */
export async function unshieldFunds(
  req: ShieldRequest & { to: string },
): Promise<ShieldResponse> {
  const res = await fetch("/api/shield", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      op: "unshield",
      protocol: req.protocol,
      amountEth: req.amountEth,
      to: req.to,
    }),
  });
  const body = (await res.json()) as {
    tx?: string | null;
    populatedTx?: { to: string; data: string; value: string } | null;
    note?: string;
    error?: string;
    detail?: string;
  };
  if (!res.ok) throw new Error(body.detail ?? body.error ?? `unshield failed (${res.status})`);
  let tx = body.tx ?? null;
  if (!tx && body.populatedTx) {
    tx = await broadcastPopulated(body.populatedTx);
  }
  return { tx, populatedTx: body.populatedTx ?? null, note: body.note ?? "" };
}
