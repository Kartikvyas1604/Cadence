"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import type { PublicClient, WalletClient } from "viem";
import { formatUnits, parseUnits } from "viem";
import { initialWorld, reducer } from "./machine";
import type { IntelQuote, RejectReason, WorldState } from "./types";
import { REJECT_REASONS } from "./types";
import { useInjectedWallet } from "@/lib/wallet/use-injected-wallet";
import { useChainState } from "./chain";
import {
  loadDeployment,
  slotsAbi,
  hookAbi,
  routerAbi,
  lpModuleAbi,
  adminAbi,
  poolKey,
  type CadenceDeployment,
} from "./abis";
import { decodeWrappedInner, publicClientFor, walletClientFor, REVERT_SELECTORS } from "./contract";
import { keccak256, toHex } from "viem";

const StateContext = createContext<WorldState | null>(null);
const ActionsContext = createContext<{
  buySlot: (sizeEth: number) => Promise<void>;
  commitMint: (sizeEth: number) => Promise<void>;
  attemptSwap: (
    sizeEth: number,
    opts?: { withoutSlot?: boolean; oversize?: boolean; reachPassive?: boolean },
  ) => Promise<"filled" | RejectReason>;
  attemptBadReveal: (sizeEth: number) => Promise<"filled" | RejectReason>;
  refreshIntel: () => Promise<boolean>;
  depositLpEth: (sizeEth: number) => Promise<void>;
  withdrawLpEth: (sharesEth: number) => Promise<void>;
  applyAsk: (askEth: number) => Promise<void>;
  withdrawProtocolRevenue: () => Promise<void>;
  setProtocolTreasury: (next: string) => Promise<void>;
} | null>(null);

interface CommitmentLocal {
  H: `0x${string}`;
  salt: `0x${string}`;
  sizeEth: number;
  epochId: number;
}

function toEth(wei: bigint): number {
  return Number(formatUnits(wei, 18));
}

function rejectFromRevert(data: string | undefined): { reason: RejectReason; detail: string } | null {
  const inner = data ? decodeWrappedInner(data) : null;
  const sel = (inner ?? data ?? "").slice(0, 10).toLowerCase();
  const mapped = REVERT_SELECTORS[sel];
  if (!mapped) return null;
  const reason =
    mapped === "no-slot"
      ? "no-slot"
      : mapped === "oversize"
        ? "oversize"
        : mapped === "same-block-passive-unlock"
          ? "same-block-passive-unlock"
          : mapped === "bad-reveal"
            ? "bad-reveal"
            : mapped === "unsafe-withdraw"
              ? "unsafe-withdraw"
              : mapped === "epoch-expired"
                ? "epoch-expired"
                : ("no-slot" as RejectReason);
  const extra: Record<string, string> = {
    "oversize-active": "Trade size exceeds the epoch's ACTIVE reserves.",
    "insufficient-escrow": "Commitment escrow is below the mint cost for the revealed size.",
    "capacity-exceeded": "Mint would exceed this epoch's capacity budget.",
    "zero-size": "Size must be nonzero.",
  };
  return {
    reason,
    detail: REJECT_REASONS[reason].detail + (extra[mapped] ? ` ${extra[mapped]}` : ""),
  };
}

export function CadenceProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, initialWorld);
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // real sources: connected wallet, live chain, contracts, paid intel
  const wallet = useInjectedWallet();
  const chain = useChainState(wallet.chainId);

  const walletRef = useRef<WalletClient | null>(null);
  const publicRef = useRef<PublicClient | null>(null);
  const deploymentRef = useRef<CadenceDeployment | null>(null);
  const commitmentRef = useRef<CommitmentLocal | null>(null);
  const [deploymentReady, setDeploymentReady] = useState(false);
  const deploymentChainRef = useRef<number | null>(null);

  const world: WorldState = useMemo(
    () => ({
      ...state,
      chain: (() => {
        // epoch clock follows the DEPLOYED hook's epoch length, not a constant
        const len = state.pool?.epochLengthBlocks ?? 12;
        return {
          chainId: chain.chainId,
          blockNumber: chain.blockNumber,
          epochId: chain.blockNumber != null ? Math.floor(chain.blockNumber / len) : null,
          blocksUntilEpochEnd:
            chain.blockNumber != null ? len - (chain.blockNumber % len) : null,
        };
      })(),
      wallet: {
        address: wallet.address,
        eth: wallet.ethBalance,
        slot: state.wallet.slot,
      },
      slotPricePerEth: state.slotPricePerEth,
      askPerEth: state.askPerEth,
    }),
    [state, chain.chainId, chain.blockNumber, wallet.address, wallet.ethBalance],
  );

  // ------------------------------------------------------------------
  // Contract wiring: load deployment for the current chain, keep clients
  // ------------------------------------------------------------------
  useEffect(() => {
    if (chain.chainId == null) {
      deploymentRef.current = null;
      deploymentChainRef.current = null;
      queueMicrotask(() => setDeploymentReady(false));
      return;
    }
    if (deploymentChainRef.current === chain.chainId) return;
    deploymentChainRef.current = chain.chainId;
    let alive = true;
    (async () => {
      const d = await loadDeployment(chain.chainId as number);
      if (!alive) return;
      deploymentRef.current = d;
      publicRef.current = publicClientFor(chain.chainId as number);
      walletRef.current = walletRef.current; // wallet client refreshed on connect
      if (d) {
        dispatch({
          type: "DEPLOYMENT_LOADED",
          pool: {
            pair: "ETH/USDC",
            lambdaBps: d.lambdaBps,
            epochLengthBlocks: d.epochLengthBlocks,
            activeReserveEth: 0,
            activeReserveUsdc: 0,
            passiveReserveEth: 0,
            passiveReserveUsdc: 0,
          },
          slotPricePerEth: toEth(BigInt(d.pricePerEth)),
        });
      }
      queueMicrotask(() => setDeploymentReady(true));
    })();
    return () => {
      alive = false;
    };
  }, [chain.chainId]);

  // wallet client from the injected provider
  useEffect(() => {
    walletRef.current = wallet.address && chain.chainId ? walletClientFor((window as unknown as { ethereum: unknown }).ethereum, chain.chainId) : null;
  }, [wallet.address, chain.chainId]);

  // ------------------------------------------------------------------
  // Chain truth: poll reserves + slot balance on every new block
  // ------------------------------------------------------------------
  useEffect(() => {
    const d = deploymentRef.current;
    const pc = publicRef.current;
    if (!d || !pc || chain.blockNumber == null) return;
    let alive = true;
    (async () => {
      try {
        const [reserves, price] = await Promise.all([
          pc.readContract({ address: d.hook, abi: hookAbi, functionName: "reserves" }) as Promise<[bigint, bigint, bigint, bigint]>,
          pc.readContract({ address: d.slots, abi: slotsAbi, functionName: "pricePerEth" }) as Promise<bigint>,
        ]);
        if (!alive) return;
        dispatch({
          type: "POOL_SYNC",
          pool: {
            pair: "ETH/USDC",
            lambdaBps: d.lambdaBps,
            epochLengthBlocks: d.epochLengthBlocks,
            activeReserveEth: toEth(reserves[0]),
            activeReserveUsdc: toEth(reserves[1]),
            passiveReserveEth: toEth(reserves[2]),
            passiveReserveUsdc: toEth(reserves[3]),
          },
          slotPricePerEth: toEth(price),
        });
      } catch {
        /* keep last known pool state */
      }
      if (wallet.address) {
        try {
          const slot = (await pc.readContract({
            address: d.slots,
            abi: slotsAbi,
            functionName: "slotOf",
            args: [wallet.address as `0x${string}`],
          })) as bigint;
          if (!alive) return;
          dispatch({ type: "WALLET_SLOT_SYNC", capacity: toEth(slot) });
        } catch {
          /* keep last */
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [chain.blockNumber, wallet.address, deploymentReady]);

  // ------------------------------------------------------------------
  // LP module: probe availability, then read position + constants.
  // When the deployed hook predates the LP module, reads revert and the
  // dashboard shows its honest "waiting for LP module" state.
  // ------------------------------------------------------------------
  useEffect(() => {
    const d = deploymentRef.current;
    const pc = publicRef.current;
    if (!d || !pc) return;
    let alive = true;
    (async () => {
      try {
        await pc.readContract({
          address: d.hook,
          abi: lpModuleAbi,
          functionName: "sharesOf",
          args: ["0x0000000000000000000000000000000000000001" as `0x${string}`],
        });
        if (!alive) return;
        dispatch({ type: "LP_AVAILABLE", available: true });
      } catch {
        if (!alive) return;
        dispatch({ type: "LP_AVAILABLE", available: false });
      }
    })();
    return () => {
      alive = false;
    };
  }, [chain.chainId, deploymentReady]);

  useEffect(() => {
    const d = deploymentRef.current;
    const pc = publicRef.current;
    if (!d || !pc || state.lp.available !== true) return;
    let alive = true;
    (async () => {
      const lp = wallet.address ?? "0x0000000000000000000000000000000000000001";
      try {
        const epoch = (await pc.readContract({
          address: d.hook,
          abi: hookAbi,
          functionName: "currentEpoch",
        })) as bigint;
        const [pos, feeBps, revBps, sold, budget, remaining] = await Promise.all([
          pc.readContract({ address: d.hook, abi: lpModuleAbi, functionName: "lpPosition", args: [lp as `0x${string}`] }) as Promise<[bigint, bigint, bigint, bigint, bigint]>,
          pc.readContract({ address: d.hook, abi: lpModuleAbi, functionName: "swapFeeBps" }) as Promise<bigint>,
          pc.readContract({ address: d.hook, abi: lpModuleAbi, functionName: "slotRevenueShareBps" }) as Promise<bigint>,
          pc.readContract({ address: d.hook, abi: lpModuleAbi, functionName: "soldCapacityEth" }) as Promise<bigint>,
          pc.readContract({ address: d.hook, abi: hookAbi, functionName: "epochCapacityEth", args: [epoch] }) as Promise<bigint>,
          pc.readContract({ address: d.slots, abi: slotsAbi, functionName: "remainingCapacity" }) as Promise<bigint>,
        ]);
        if (!alive) return;
        dispatch({
          type: "LP_SYNC",
          position: {
            depositedEth: toEth(pos[0]),
            shares: toEth(pos[1]),
            claimableRevenueEth: toEth(pos[2]),
            claimableSwapFeesUsdc: toEth(pos[3]),
            withdrawableEth: toEth(pos[4]),
          },
          swapFeeBps: Number(feeBps),
          slotRevenueShareBps: Number(revBps),
          soldCapacityEth: toEth(sold),
          budgetEth: toEth(budget),
          remainingCapacity: toEth(remaining),
        });
      } catch {
        /* keep last known LP state */
      }
    })();
    return () => {
      alive = false;
    };
  }, [chain.blockNumber, wallet.address, state.lp.available]);

  const requireReady = useCallback((): {
    ok: boolean;
    pc: PublicClient;
    wc: WalletClient;
    d: CadenceDeployment;
    s: WorldState;
  } | null => {
    const d = deploymentRef.current;
    const pc = publicRef.current;
    const wc = walletRef.current;
    const s = stateRef.current;
    if (!d || !pc || !wc || !s.wallet.address) return null;
    return { ok: true, pc, wc, d, s };
  }, []);

  /** Shared write helper: send, wait, decode revert → reject log. */
  const sendTx = useCallback(
    async (
      write: () => Promise<`0x${string}`>,
      pc: PublicClient,
      sizeEth: number,
    ): Promise<"filled" | RejectReason> => {
      let hash: `0x${string}`;
      try {
        hash = await write();
      } catch (e: unknown) {
        // wallet-level rejection or pre-simulation revert — extract data
        const data =
          (e as { data?: string })?.data ??
          (e as { details?: string })?.details ??
          (e instanceof Error ? e.message : "");
        const r = rejectFromRevert(data.startsWith("0x") ? data : undefined);
        dispatch({
          type: "SWAP_REJECTED",
          reason: r?.reason ?? "no-slot",
          tradeSize: sizeEth,
          detail: r?.detail ?? (e instanceof Error ? e.message.slice(0, 140) : "transaction reverted"),
        });
        return r?.reason ?? "no-slot";
      }
      const receipt = await pc.waitForTransactionReceipt({ hash });
      if (receipt.status === "reverted") {
        dispatch({
          type: "SWAP_REJECTED",
          reason: "no-slot",
          tradeSize: sizeEth,
          detail: "transaction reverted at execution",
        });
        return "no-slot";
      }
      return "filled";
    },
    [],
  );

  // ------------------------------------------------------------------
  // Actions — every path is a REAL contract call
  // ------------------------------------------------------------------
  const buySlot = useCallback(
    async (sizeEth: number) => {
      const ctx = requireReady();
      if (!ctx) return;
      const { pc, wc, d, s } = ctx;
      const sizeWei = parseUnits(String(sizeEth), 18);
      const cost = (sizeWei * BigInt(d.pricePerEth)) / parseUnits("1", 18);
      const value = cost + parseUnits("0.05", 18); // buffer for refund
      const account = s.wallet.address as `0x${string}`;
      const ok = await sendTx(
        () =>
          wc.writeContract({
            address: d.slots,
            abi: slotsAbi,
            functionName: "mintPublic",
            args: [sizeWei],
            account,
            chain: null,
            value,
          }),
        pc,
        sizeEth,
      );
      if (ok === "filled") {
        dispatch({
          type: "BUY_SLOT",
          sizeEth,
          pricePerEth: Number(formatUnits(BigInt(d.pricePerEth), 18)),
        });
      }
    },
    [requireReady, sendTx],
  );

  const commitMint = useCallback(
    async (sizeEth: number) => {
      const ctx = requireReady();
      if (!ctx) return;
      const { pc, wc, d, s } = ctx;
      const sizeWei = parseUnits(String(sizeEth), 18);
      const epochId = Number(await pc.readContract({ address: d.slots, abi: slotsAbi, functionName: "currentEpoch" }));
      // 32-byte salt generated locally — size stays off the public payload
      const salt = `0x${crypto.getRandomValues(new Uint8Array(32)).reduce((a, b) => a + b.toString(16).padStart(2, "0"), "")}` as `0x${string}`;
      const H = (await pc.readContract({
        address: d.slots,
        abi: slotsAbi,
        functionName: "commitHash",
        args: [sizeWei, BigInt(epochId), salt],
      })) as `0x${string}`;
      const escrow = (sizeWei * BigInt(d.pricePerEth) * 3n) / parseUnits("1", 18);
      const account = s.wallet.address as `0x${string}`;
      const ok = await sendTx(
        () =>
          wc.writeContract({
            address: d.slots,
            abi: slotsAbi,
            functionName: "commitMint",
            args: [H],
            account,
            chain: null,
            value: escrow,
          }),
        pc,
        sizeEth,
      );
      if (ok === "filled") {
        commitmentRef.current = { H, salt, sizeEth, epochId };
        dispatch({
          type: "COMMIT_MINT",
          sizeEth,
          pricePerEth: Number(formatUnits(BigInt(d.pricePerEth), 18)),
          salt: String(salt),
        });
      }
    },
    [requireReady, sendTx],
  );

  const attemptSwap = useCallback(
    async (
      sizeEth: number,
      opts: { withoutSlot?: boolean; oversize?: boolean; reachPassive?: boolean } = {},
    ): Promise<"filled" | RejectReason> => {
      const ctx = requireReady();
      if (!ctx) return "no-slot";
      const { pc, wc, d, s } = ctx;
      // demo reject intents are executed for real: the CONTRACT rejects
      const swapSize = opts.oversize ? sizeEth * 2 : opts.reachPassive ? Math.max(sizeEth, s.pool?.activeReserveEth ?? sizeEth) : sizeEth;
      const isPrivate = !opts.withoutSlot && !opts.oversize && !opts.reachPassive && commitmentRef.current != null && commitmentRef.current.sizeEth === sizeEth;
      const c = commitmentRef.current;
      if (isPrivate && c) {
        const ok = await sendTx(
          () =>
            wc.writeContract({
              address: d.router,
              abi: routerAbi,
              functionName: "sellEthPrivate",
              args: [poolKey(d), parseUnits(String(c.sizeEth), 18), c.salt],
              account: s.wallet.address as `0x${string}`,
              chain: null,
              value: parseUnits(String(c.sizeEth), 18),
            }),
          pc,
          c.sizeEth,
        );
        if (ok === "filled") {
          const outUsdc = s.pool
            ? s.pool.activeReserveUsdc -
              (s.pool.activeReserveEth * s.pool.activeReserveUsdc) / (s.pool.activeReserveEth + c.sizeEth)
            : 0;
          dispatch({ type: "REVEAL_SWAP", sizeEth: c.sizeEth, salt: String(c.salt) });
          void outUsdc;
          commitmentRef.current = null;
        }
        return ok;
      }
      const ok = await sendTx(
        () =>
          wc.writeContract({
            address: d.router,
            abi: routerAbi,
            functionName: "swap",
            args: [poolKey(d), true, parseUnits(String(swapSize), 18)],
            account: s.wallet.address as `0x${string}`,
            chain: null,
            value: parseUnits(String(swapSize), 18),
          }),
        pc,
        swapSize,
      );
      if (ok === "filled") {
        const outUsdc = s.pool
          ? s.pool.activeReserveUsdc -
            (s.pool.activeReserveEth * s.pool.activeReserveUsdc) / (s.pool.activeReserveEth + swapSize)
          : 0;
        dispatch({ type: "SWAP_SUCCEEDED", sizeEth: swapSize, outUsdc, capacityUsed: swapSize });
      }
      return ok;
    },
    [requireReady, sendTx],
  );

  // D4: reveal with a wrong salt — the hook must revert (real reject)
  const attemptBadReveal = useCallback(
    async (sizeEth: number): Promise<"filled" | RejectReason> => {
      const ctx = requireReady();
      if (!ctx) return "no-slot";
      const { pc, wc, d, s } = ctx;
      const c = commitmentRef.current;
      if (!c || c.sizeEth !== sizeEth) return "no-slot";
      const badSalt = `0x${c.salt.slice(2, 66).slice(0, 62)}ff` as `0x${string}`;
      const ok = await sendTx(
        () =>
          wc.writeContract({
            address: d.router,
            abi: routerAbi,
            functionName: "sellEthPrivate",
            args: [poolKey(d), parseUnits(String(sizeEth), 18), badSalt],
            account: s.wallet.address as `0x${string}`,
            chain: null,
            value: parseUnits(String(sizeEth), 18),
          }),
        pc,
        sizeEth,
      );
      if (ok === "filled") {
        dispatch({ type: "REVEAL_SWAP", sizeEth, salt: String(badSalt) });
        commitmentRef.current = null;
      }
      return ok;
    },
    [requireReady, sendTx],
  );

  const depositLpEth = useCallback(
    async (sizeEth: number) => {
      const ctx = requireReady();
      if (!ctx || stateRef.current.lp.available !== true) return;
      const { pc, wc, d } = ctx;
      await sendTx(
        () =>
          wc.writeContract({
            address: d.hook,
            abi: lpModuleAbi,
            functionName: "depositEth",
            args: [],
            account: ctx.s.wallet.address as `0x${string}`,
            chain: null,
            value: parseUnits(String(sizeEth), 18),
          }),
        pc,
        sizeEth,
      );
    },
    [requireReady, sendTx],
  );

  const withdrawLpEth = useCallback(
    async (sharesEth: number) => {
      const ctx = requireReady();
      if (!ctx || stateRef.current.lp.available !== true) return;
      const { pc, wc, d } = ctx;
      // the CONTRACT enforces withdraw safety — an unsafe amount reverts
      // with UnsafeWithdraw() and lands in the reject log
      await sendTx(
        () =>
          wc.writeContract({
            address: d.hook,
            abi: lpModuleAbi,
            functionName: "withdrawEth",
            args: [parseUnits(String(sharesEth), 18)],
            account: ctx.s.wallet.address as `0x${string}`,
            chain: null,
          }),
        pc,
        sharesEth,
      );
    },
    [requireReady, sendTx],
  );

  /** §4: push the paid-intel ask onchain — owner/keeper only, bounded on-chain. */
  const applyAsk = useCallback(
    async (askEth: number) => {
      const ctx = requireReady();
      if (!ctx) return;
      const { pc, wc, d } = ctx;
      const askWei = parseUnits(String(askEth), 18);
      // x402 payment proof: keccak of the stored quote payload (server
      // returns the paid quote; its hash binds the ask to the receipt)
      const quote = stateRef.current.intel;
      const payload = JSON.stringify(quote ?? { asOf: 0 });
      const receiptHash = keccak256(toHex(payload)) as `0x${string}`;
      await sendTx(
        () =>
          wc.writeContract({
            address: d.slots,
            abi: adminAbi,
            functionName: "setSlotPriceFromIntel",
            args: [askWei, receiptHash],
            account: ctx.s.wallet.address as `0x${string}`,
            chain: null,
          }),
        pc,
        askEth,
      );
      // the written ask lands via POOL_SYNC on the next block poll
    },
    [requireReady, sendTx],
  );

  /** §8: rotate the treasury role (current treasury only). */
  const setProtocolTreasury = useCallback(
    async (next: string) => {
      const ctx = requireReady();
      if (!ctx) return;
      const { pc, wc, d } = ctx;
      await sendTx(
        () =>
          wc.writeContract({
            address: d.hook,
            abi: adminAbi,
            functionName: "setProtocolTreasury",
            args: [next as `0x${string}`],
            account: ctx.s.wallet.address as `0x${string}`,
            chain: null,
          }),
        pc,
        0,
      );
    },
    [requireReady, sendTx],
  );

  /** §8: withdraw the accrued protocol take to the treasury. */
  const withdrawProtocolRevenue = useCallback(async () => {
    const ctx = requireReady();
    if (!ctx) return;
    const { pc, wc, d } = ctx;
    await sendTx(
      () =>
        wc.writeContract({
          address: d.hook,
          abi: adminAbi,
          functionName: "withdrawProtocolRevenue",
          args: [ctx.s.wallet.address as `0x${string}`],
          account: ctx.s.wallet.address as `0x${string}`,
          chain: null,
        }),
      pc,
      0,
    );
  }, [requireReady, sendTx]);

  const refreshIntel = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch("/api/intel", { method: "GET" });
      const body = (await res.json()) as Record<string, unknown>;
      if (!res.ok) {
        dispatch({
          type: "INTEL_ERROR",
          message: `paid intel unavailable (${res.status}): ${String(body.detail ?? body.error ?? "x402 intel not configured")}`,
        });
        return false;
      }
      dispatch({
        type: "INTEL_QUOTE",
        quote: {
          suggestedAskPerEth: Number(body.suggestedAskPerEth),
          asOf: Number(body.asOf ?? Date.now()),
          rationale: String(body.rationale ?? ""),
          source: String(body.source ?? "x402"),
          costUsd: 0,
        } satisfies IntelQuote,
      });
      return true;
    } catch {
      dispatch({ type: "INTEL_ERROR", message: "intel endpoint unreachable — paid x402 intel is not configured yet" });
      return false;
    }
  }, []);

  const actions = useMemo(
    () => ({
      buySlot,
      commitMint,
      attemptSwap,
      attemptBadReveal,
      refreshIntel,
      depositLpEth,
      withdrawLpEth,
      applyAsk,
      withdrawProtocolRevenue,
      setProtocolTreasury,
    }),
    [buySlot, commitMint, attemptSwap, attemptBadReveal, refreshIntel, depositLpEth, withdrawLpEth, applyAsk, withdrawProtocolRevenue, setProtocolTreasury],
  );

  return (
    <StateContext.Provider value={world}>
      <ActionsContext.Provider value={actions}>{children}</ActionsContext.Provider>
    </StateContext.Provider>
  );
}

export function useCadence(): WorldState {
  const ctx = useContext(StateContext);
  if (!ctx) throw new Error("useCadence must be used within CadenceProvider");
  return ctx;
}

export function useCadenceActions() {
  const ctx = useContext(ActionsContext);
  if (!ctx) throw new Error("useCadenceActions must be used within CadenceProvider");
  return ctx;
}
