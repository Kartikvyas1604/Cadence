<div align="center">

<img src="public/logo.svg" width="96" alt="Cadence logo" />

# Cadence

**Scarce per-epoch execution capacity, sold as ERC-1155 cadence slots.**

*Buy a cadence slot for this epoch. Swap against active depth. No slot, no fill.*

Next.js 16 · TypeScript · Uniswap v4 hook · The Graph · Hedera x402

</div>

---

## Why Cadence exists

In a constant-function pool, an arbitrageur who spots a stale price can drain the
full depth in one block. The liquidity provider eats the loss — LVR — while the
arb keeps the spread.

The status quo for deciding **who gets depth** is a gas race, JIT liquidity, or a
private RFQ desk. None of them pay the LP for the capacity they are giving away.

Cadence makes depth a **scarce, priced, time-boxed resource** — and sells it.

## The mechanism

Every epoch, a Uniswap v4 hook partitions the pool and sells the right to touch
the active side.

**1 · The split.** Total reserves are divided by a fixed ratio λ (25% in the
local fixture, 20% at deploy). The active side is tradable this epoch. The
passive side stays locked until refresh — it cannot be reached by splitting an
order across blocks.

**2 · The gate.** Three checks run in `beforeSwap` before any swap touches the
pool:

| Check | Meaning |
|---|---|
| Slot ≥ size | The trader must hold a cadence slot for the current epoch with enough capacity |
| Burn the notional | Consumed capacity is burned — capacity is single-use per epoch |
| Active only | The fill executes against active reserves. Passive is untouchable, full stop |

**3 · The refresh.** At epoch end, un-consumed capacity expires, active
reserves are recomputed at λ, and a fresh capacity budget opens. Capacity you
don't use, you lose.

**4 · The rejects.** Reverting is a feature. Every refusal is a named, surfaced
code:

- **NO_SLOT** — no cadence slot for the current epoch
- **OVERSIZE** — the trade exceeds the slot's capacity (or the epoch's active depth)
- **PASSIVE_UNLOCK** — a same-block split tries to reach locked reserves
- **BAD_REVEAL** — a Private Cadence Intent reveal doesn't hash to the commitment
- **UNSAFE_WITHDRAW** — an LP withdraw would orphan sold capacity
- **EPOCH_EXPIRED** — slot id not current epoch

**5 · Private Cadence Intent.** Beat two, kept second on purpose: mint against
`H = hash(size, epochId, salt)` — size is never in the public payload. At fill
time `beforeSwap` verifies the reveal, emits `SlotRevealed`, consumes the
reserved capacity and refunds the unused escrow. Commit-reveal on **capacity
intent only** — the swap itself stays public.

## Deployed — live testnets

The full venue is deployed and live on two chains. The app serves the address
manifests from `public/deployments/<chainId>.json`; **your wallet's chain selects
which deployment the UI talks to.**

| | **Sepolia (11155111)** | **Base Sepolia (84532)** |
|---|---|---|
| v4 PoolManager | `0xE03A1074c86CFeDd5C142C4F04F1a1536e203543` | `0x05E73354cFDd6745C338b50BcFDfA3Aa6fA03408` |
| CadenceHook | `0x376888640655e696A3Dad28B1e6F2610B1b58088` | `0x56587b48d510FD5e0421957d7d5092DB862e8088` |
| CadenceSlots (ERC-1155) | `0x48283bd2FEBb36AAE1D54e3f5d312Ffb3a6Fa7c8` | `0x48283bd2FEBb36AAE1D54e3f5d312Ffb3a6Fa7c8` |
| Router + registry | `0xFd16c64042d6488ed052cF4F9B837E3A4394573C` | `0xC2efcc48bdaCdF96207733fAdA6340e3fD2490A3` |
| CLOB | `0x61fD009aA4903356C4eD9e8CEd47c009dA7ff86E` | `0x1d2498DD95Ff787eC981A2d01E8E822eb21a99D6` |
| Quote token (cUSDC 18) | `0xE63c7A674f16EAe31AC3e92d40782a1a154BAfac` | `0x93B196E430cefA177a8Af19d1A2FFb4e3f4Aa991` |
| λ / epoch / ask | 25% · 12 blocks · 0.001 ETH per ETH capacity | 25% · 12 blocks · 0.001 ETH per ETH capacity |
| Swap fee / protocol take | 0.30% / 10% | 0.30% / 10% |

> **If a panel says "no deployment for this wallet's network"** — switch your
> wallet to Sepolia or Base Sepolia (one-click buttons are rendered on the
> unwired panels). The wallet's chain id decides the deployment the UI loads.

## The app — ten rooms, one venue

| Route | Purpose |
|---|---|
| `/` | Landing — the cadence-slot pitch |
| `/buy` | Primary market — fixed-price ERC-1155 mint, current epoch only |
| `/swap` | The gate: slot ≥ size, notional burned, active-only fill + live reject log |
| `/lp` | LP desk — deposit, λ allocation, capacity budget, dual ledgers, bounded withdraw |
| `/clob` | Secondary market — limit buy/sell of epoch slots, expiring book |
| `/router` | Multi-pool quote comparison + one-click execute (poolId always shown) |
| `/privacy` | Private Cadence Intent (commit→reveal) + stealth payer + Aztec/Railgun fund path |
| `/graph` | Live Studio index + LVR/markout panel |
| `/intel` | Paid x402 intel writes the ask · CRE confidential-ask mode · dynamic onchain price |
| `/admin` | Protocol treasury — take-rate split, accrued revenue, treasury withdraw |
| `/protocol` | Mechanism walkthrough |

Panels on chains without a deployment render their honest waiting states; every
module probes its ABI surface and lights up where deployed.

## What a slot is — and is not

A cadence slot is a **capacity ticket**: the right to fill up to a size against
this epoch's active reserves, at a fixed primary price, minted as ERC-1155.

A slot is **not** LP equity, **not** a yield claim, **not** a take-permit against
a named maker. Explicitly not TAP, not Dockyard, not Parity. No fake APY. No
guarantees.

Unused slots expire worthless at refresh. That expiry is the honesty of the
instrument — a slot is a time-slice, not equity.

## Extended capabilities (all MVP per spec)

| § | Capability | Where |
|---|---|---|
| 1 | Secondary slot CLOB — limit buy/sell, epoch expiry | `/clob` + `contracts/src/Clob.sol` |
| 2 | Multi-pool router + registry | `/router` + `CadenceRouter` |
| 3 | LVR / markout panel | `/graph` + `/api/lvr` |
| 4 | Dynamic onchain slot price from paid intel (bounded 50–200%) | `/intel` + `setSlotPriceFromIntel` |
| 5 | Stealth / ephemeral payer wallets | `/privacy` + `lib/stealth` |
| 6 | Chainlink CRE TEE confidential ask | `/intel` + `/api/x402/cre-ask` |
| 7 | Aztec / Railgun fund path (shields funds, not the swap) | `/privacy` + `lib/shield` |
| 8 | Protocol take-rate on slot sales (90/10 default) | `/admin` + hook accounting |

## Paid intel writes the price

One paid Hedera x402 call (Blocky402 facilitator) returns a capacity/toxicity
quote that **writes the cadence-slot ask**. The `/intel` page shows suggested vs
onchain price; the authorized keeper applies it on-chain inside the 50–200%
bounds. Without credentials the route serves an honest 503 — no fake quotes.

## Bounty map (exactly three, all load-bearing)

| Partner | Track | What ships |
|---|---|---|
| **Uniswap Foundation** | Best Uniswap Stack / v4 hooks | `CadenceHook`: active/passive PA-AMM + cadence-slot gate in `beforeSwap` (custom-curve accounting, Foundry-tested) |
| **The Graph** | Composable/Standardized products | Studio subgraph: mint/burn/consume + `SlotCommitted → SlotRevealed`, live via the `/api/graph` route handler |
| **Hedera** | x402 agentic payments | Paid capacity/toxicity intel through `/api/intel` (Blocky402) that writes the cadence-slot ask |

## Run it locally

```bash
npm install
npm run dev            # app at localhost:3000

cd contracts
anvil                  # local chain (predeploys the CREATE2 factory)
export PRIVATE_KEY=0xac09…ff80   # anvil account #0
forge script script/DeployCadence.s.sol \
  --rpc-url http://localhost:8545 --broadcast --slow
cp deployments/31337.json ../public/deployments/
```

Connect an injected wallet to the deployed chain — every panel lights up live.
The full loop is also smoke-tested end-to-end:
`npm run demo` (deploys + verifies the whole path + keeps the chain alive).

## Deploy to a live chain

```bash
# paste your funded deployer key into .env (NEVER committed)
PRIVATE_KEY=0x…

npm run deploy:sepolia    # or set SEPOLIA_RPC_URL to Base Sepolia + POOLMANAGER
```

The script deploys everything, seeds the λ reserves, registers the pool, and
copies the address manifest into `public/deployments/`. See
[docs/DEPLOY.md](docs/DEPLOY.md) for the full runbook (Subgraph, x402, rollback).

## Deployed stack

| Layer | Choice | Status |
|---|---|---|
| App | Next.js App Router + TypeScript + Tailwind (self-hosted) | build green |
| Contracts | Solidity v4 hook + ERC-1155 slots (Foundry, 52 tests) | **live on Sepolia + Base Sepolia** |
| Graph | Studio subgraph source + `/api/graph` proxy | source ready, deploy key pending |
| Intel | `/api/intel` — x402 paid call (Hedera `@x402/hedera` / EVM `@x402/evm`) | endpoint + payer key pending |

## Named risks

> **Say it plainly:** unused cadence slots expire worthless at epoch refresh.
> A slot is capacity, not LP equity. Active depth is capped at λ × total
> reserves. Scarcity is the product — and it cuts both ways.
> Commitments leak an escrow upper bound (disclosed; size itself is hidden).
> Contracts are unaudited, testnet-grade, immutable (no proxies). See
> [SECURITY.md](SECURITY.md).

---

<div align="center">

**Cadence** — depth you can gate.

</div>
