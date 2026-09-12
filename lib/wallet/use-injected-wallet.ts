"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

interface Eip1193Provider {
  request: (args: { method: string; params?: unknown[] | object }) => Promise<unknown>;
  on?: (event: string, handler: (...args: never[]) => void) => void;
  removeListener?: (event: string, handler: (...args: never[]) => void) => void;
}

/** EIP-6963 — multi-wallet discovery so a hard refresh reconnects to the
 *  SAME wallet the user picked, not whichever extension owns window.ethereum. */
interface Eip6963Info {
  uuid: string;
  rdns: string;
  name: string;
}
interface Eip6963Detail {
  info: Eip6963Info;
  provider: Eip1193Provider;
}

const WALLET_KEY = "cadence:wallet-rdns";

function getInjected(): Eip1193Provider | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { ethereum?: Eip1193Provider }).ethereum ?? null;
}

function storedRdns(): string | null {
  try {
    return localStorage.getItem(WALLET_KEY);
  } catch {
    return null;
  }
}

function storeRdns(rdns: string | null) {
  try {
    if (rdns) localStorage.setItem(WALLET_KEY, rdns);
    else localStorage.removeItem(WALLET_KEY);
  } catch {
    /* private mode — discovery still works, persistence just doesn't */
  }
}

/** Module-level 6963 registry — shared across hook instances (provider
 *  mounts once per page, but the button + pages each call the hook). */
const announced = new Map<string, Eip6963Detail>();
let discoveryStarted = false;
const presenceListeners = new Set<() => void>();

function startDiscovery() {
  if (discoveryStarted || typeof window === "undefined") return;
  discoveryStarted = true;
  window.addEventListener("eip6963:announceProvider", (e: Event) => {
    const detail = (e as CustomEvent<Eip6963Detail>).detail;
    if (detail?.info?.rdns && typeof detail.provider?.request === "function") {
      const isNew = !announced.has(detail.info.rdns);
      announced.set(detail.info.rdns, detail);
      if (isNew) {
        for (const fn of presenceListeners) fn();
      }
    }
  });
  // Ask for announcements ONCE is not enough: wallet content scripts can be
  // injected after this dispatch (slow tabs, dev mode) and then MISS it —
  // the registry stays empty and every refresh falls back to the picker.
  // Re-request a few times until the wallets actually answer.
  const reRequest = () => window.dispatchEvent(new Event("eip6963:requestProvider"));
  reRequest();
  for (const delay of [300, 700, 1500, 3000]) {
    setTimeout(() => {
      if (announced.size === 0) reRequest();
    }, delay);
  }
}

function providerForRdns(rdns: string | null): Eip1193Provider | null {
  if (rdns) {
    const found = announced.get(rdns);
    if (found) return found.provider;
  }
  return getInjected();
}

export function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export const CHAIN_NAMES: Record<number, string> = {
  1: "Ethereum",
  8453: "Base",
  84532: "Base Sepolia",
  11155111: "Sepolia",
  10: "OP Mainnet",
  11155420: "OP Sepolia",
  42161: "Arbitrum One",
  421614: "Arbitrum Sepolia",
  137: "Polygon",
  59144: "Linea",
  56: "BNB Chain",
};

export function chainLabel(chainId: number | null): string {
  if (chainId === null) return "";
  return CHAIN_NAMES[chainId] ?? `chain ${chainId}`;
}

function hexToNumber(hex: unknown): number | null {
  if (typeof hex !== "string") return null;
  try {
    return Number.parseInt(hex, 16);
  } catch {
    return null;
  }
}

// presence of an injected wallet is external browser state — read it
// through useSyncExternalStore so SSR renders false and hydration stays clean
function subscribeProviderPresence(notify: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  startDiscovery();
  presenceListeners.add(notify);
  return () => {
    presenceListeners.delete(notify);
  };
}
function providerPresenceSnapshot(): boolean {
  if (typeof window === "undefined") return false;
  startDiscovery();
  return getInjected() !== null || announced.size > 0;
}
function providerPresenceServerSnapshot(): boolean {
  return false;
}

/** Real EIP-1193 injected-wallet connection — no mock state, no stubs. */
export function useInjectedWallet() {
  const available = useSyncExternalStore(
    subscribeProviderPresence,
    providerPresenceSnapshot,
    providerPresenceServerSnapshot,
  );
  const [address, setAddress] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [ethBalance, setEthBalance] = useState<number | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // which wallet the user picked (persisted) — null on first visit
  const [connectedRdns, setConnectedRdns] = useState<string | null>(null);

  const refreshBalance = useCallback(async (account: string) => {
    const provider = providerForRdns(storedRdns());
    if (!provider) return;
    try {
      const weiHex = (await provider.request({
        method: "eth_getBalance",
        params: [account, "latest"],
      })) as string;
      setEthBalance(Number.parseInt(weiHex, 16) / 1e18);
    } catch {
      setEthBalance(null);
    }
  }, []);

  const refreshChain = useCallback(async () => {
    const provider = providerForRdns(storedRdns());
    if (!provider) return;
    setChainId(hexToNumber(await provider.request({ method: "eth_chainId" })));
  }, []);

  useEffect(() => {
    startDiscovery();
    queueMicrotask(() => setConnectedRdns(storedRdns()));

    let attempts = 0;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    // silent reconnect to the SAME wallet the user picked before —
    // eth_accounts never prompts; a pick popup only shows on first visit.
    // Probes BOTH the remembered 6963 wallet and the default injected
    // provider, because some wallets (or MetaMask's multi-wallet picker)
    // authorize the default provider even when another was chosen.
    const trySilent = () => {
      if (stopped) return;
      (async () => {
        const candidates: Eip1193Provider[] = [];
        const rdns = storedRdns();
        const remembered = rdns ? announced.get(rdns)?.provider : null;
        if (remembered) candidates.push(remembered);
        const injected = getInjected();
        if (injected && injected !== remembered) candidates.push(injected);
        for (const candidate of candidates) {
          try {
            const accounts = (await candidate.request({
              method: "eth_accounts",
            })) as string[];
            const restored = (accounts ?? [])[0] ?? null;
            if (restored) {
              // connected through the default provider? remember WHICH
              // wallet that is (matched against 6963 announcements) so the
              // next refresh goes straight to it
              if (candidate !== remembered) {
                const legacyMatch = Array.from(announced.values()).find(
                  (d) => d.provider === candidate,
                );
                storeRdns(legacyMatch?.info.rdns ?? null);
                queueMicrotask(() => setConnectedRdns(legacyMatch?.info.rdns ?? null));
              }
              setAddress(restored);
              queueMicrotask(() => setConnectedRdns((prev) => prev ?? storedRdns()));
              void refreshChain();
              void refreshBalance(restored);
              return;
            }
          } catch {
            /* wallet locked or not ready yet — try the next candidate */
          }
        }
        // wallets report eth_accounts empty while locked, and 6963
        // announcements can land late — retry for ~30s, then idle
        attempts += 1;
        if (attempts < 20) timer = setTimeout(trySilent, 1_500);
      })();
    };
    trySilent();

    // a wallet extension announcing after mount can satisfy the stored
    // rdns — re-probe the moment any new provider announces itself
    const onAnnounced = () => {
      if (!stopped) trySilent();
    };
    presenceListeners.add(onAnnounced);

    const active = () => providerForRdns(storedRdns());
    const onAccounts = (...args: never[]) => {
      const accounts = (args[0] ?? []) as string[];
      const next = accounts[0] ?? null;
      setAddress(next);
      if (next) void refreshBalance(next);
      else setEthBalance(null);
    };
    const onChain = (...args: never[]) => {
      setChainId(hexToNumber(args[0]));
      void active()?.request({ method: "eth_accounts" }).then((a) => {
        const acc = (a as string[])[0];
        if (acc) void refreshBalance(acc);
      });
    };
    type ListenableProvider = Eip1193Provider & {
      on: NonNullable<Eip1193Provider["on"]>;
      removeListener: NonNullable<Eip1193Provider["removeListener"]>;
    };
    const listenTargets: ListenableProvider[] = [];
    for (const candidate of [announced.get(storedRdns() ?? "")?.provider, getInjected()]) {
      if (candidate?.on && candidate.removeListener) {
        listenTargets.push(candidate as ListenableProvider);
      }
    }
    for (const provider of listenTargets) {
      provider.on("accountsChanged", onAccounts);
      provider.on("chainChanged", onChain);
    }
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      presenceListeners.delete(onAnnounced);
      for (const provider of listenTargets) {
        provider.removeListener("accountsChanged", onAccounts);
        provider.removeListener("chainChanged", onChain);
      }
    };
  }, [refreshBalance, refreshChain]);

  /** Detected wallets via EIP-6963 — drives the first-visit picker. */
  const providers = Array.from(announced.values()).map((d) => ({
    rdns: d.info.rdns,
    name: d.info.name,
  }));

  /** Connect to a SPECIFIC detected wallet (first-visit picker choice). */
  const connectTo = useCallback(
    async (rdns: string | null) => {
      // if a remembered wallet hasn't announced yet, give the extensions a
      // short window to answer the 6963 request before falling back —
      // falling back to the default provider is what opens the multi-wallet
      // picker the user finds annoying
      let provider = rdns ? announced.get(rdns)?.provider : getInjected();
      if (rdns && !provider) {
        for (let i = 0; i < 6 && !announced.has(rdns); i += 1) {
          window.dispatchEvent(new Event("eip6963:requestProvider"));
          await new Promise((r) => setTimeout(r, 250));
        }
        provider = announced.get(rdns)?.provider ?? getInjected();
      }
      if (!provider) {
        setError("No injected wallet found — install MetaMask or Rabby");
        return;
      }
      setConnecting(true);
      setError(null);
      try {
        const accounts = (await provider.request({
          method: "eth_requestAccounts",
        })) as string[];
        const account = accounts[0] ?? null;
        if (account) {
          // remember which wallet was used — even for the legacy path,
          // match the connected provider against the 6963 announcements
          const legacyMatch = Array.from(announced.values()).find(
            (d) => d.provider === provider,
          );
          storeRdns(legacyMatch?.info.rdns ?? rdns);
          setConnectedRdns(legacyMatch?.info.rdns ?? rdns);
        }
        setAddress(account);
        setChainId(hexToNumber(await provider.request({ method: "eth_chainId" })));
        if (account) await refreshBalance(account);
      } catch (e) {
        setError(
          e instanceof Error && e.message.length > 0
            ? e.message
            : "Connection request rejected",
        );
      } finally {
        setConnecting(false);
      }
    },
    [refreshBalance],
  );

  const connect = useCallback(async () => {
    // remembered wallet → reconnect straight to it, no picker, no popup
    const remembered = storedRdns();
    if (remembered) return connectTo(remembered);
    // single detected wallet → use it directly
    if (announced.size === 1) return connectTo(Array.from(announced.keys())[0]);
    // legacy providers that never announce via 6963
    return connectTo(null);
  }, [connectTo]);

  // EIP-1193 has no programmatic disconnect — clearing local state is the
  // standard pattern; the wallet itself stays authorized until revoked.
  const disconnect = useCallback(() => {
    setAddress(null);
    setEthBalance(null);
    setError(null);
    storeRdns(null);
    setConnectedRdns(null);
  }, []);

  return {
    available,
    address,
    chainId,
    ethBalance,
    connecting,
    error,
    providers,
    connectedRdns,
    connect,
    connectTo,
    disconnect,
    refreshBalance,
  };
}
