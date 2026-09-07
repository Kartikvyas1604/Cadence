"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

interface Eip1193Provider {
  request: (args: { method: string; params?: unknown[] | object }) => Promise<unknown>;
  on?: (event: string, handler: (...args: never[]) => void) => void;
  removeListener?: (event: string, handler: (...args: never[]) => void) => void;
}

function getInjected(): Eip1193Provider | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { ethereum?: Eip1193Provider }).ethereum ?? null;
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
const subscribeProviderPresence = () => () => {};
function providerPresenceSnapshot(): boolean {
  return getInjected() !== null;
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

  const refreshBalance = useCallback(async (account: string) => {
    const provider = getInjected();
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
    const provider = getInjected();
    if (!provider) return;
    setChainId(hexToNumber(await provider.request({ method: "eth_chainId" })));
  }, []);

  useEffect(() => {
    const provider = getInjected();
    if (!provider?.on) return;

    // silent reconnect — never prompts on load
    (async () => {
      try {
        const accounts = (await provider.request({
          method: "eth_accounts",
        })) as string[];
        const restored = accounts[0];
        if (restored) {
          setAddress(restored);
          void refreshChain();
          void refreshBalance(restored);
        }
      } catch {
        /* wallet locked or not ready — stay disconnected */
      }
    })();

    const onAccounts = (...args: never[]) => {
      const accounts = (args[0] ?? []) as string[];
      const next = accounts[0] ?? null;
      setAddress(next);
      if (next) void refreshBalance(next);
      else setEthBalance(null);
    };
    const onChain = (...args: never[]) => {
      setChainId(hexToNumber(args[0]));
      const current = (window as unknown as { ethereum?: Eip1193Provider }).ethereum;
      void current?.request({ method: "eth_accounts" }).then((a) => {
        const acc = (a as string[])[0];
        if (acc) void refreshBalance(acc);
      });
    };
    provider.on("accountsChanged", onAccounts);
    provider.on("chainChanged", onChain);
    return () => {
      provider.removeListener?.("accountsChanged", onAccounts);
      provider.removeListener?.("chainChanged", onChain);
    };
  }, [refreshBalance, refreshChain]);

  const connect = useCallback(async () => {
    const provider = getInjected();
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
      setAddress(account);
      await refreshChain();
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
  }, [refreshBalance, refreshChain]);

  // EIP-1193 has no programmatic disconnect — clearing local state is the
  // standard pattern; the wallet itself stays authorized until revoked.
  const disconnect = useCallback(() => {
    setAddress(null);
    setEthBalance(null);
    setError(null);
  }, []);

  return {
    available,
    address,
    chainId,
    ethBalance,
    connecting,
    error,
    connect,
    disconnect,
  };
}
