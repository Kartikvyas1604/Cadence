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

**1 · The split.** Total reserves are divided by a fixed ratio λ (25% active in
this demo). The active side is tradable this epoch. The passive side stays locked
until refresh — it cannot be reached by splitting an order across blocks.

**2 · The gate.** Three checks run in `beforeSwap` before any swap touches the
pool:

| Check | Meaning |
|---|---|
| Slot ≥ size | The trader must hold a cadence slot for the current epoch with enough capacity |
| Burn the notional | Consumed capacity is burned — capacity is single-use per epoch |
| Active only | The fill executes against active reserves. Passive is untouchable, full stop |

**3 · The refresh.** At epoch end, every un-consumed slot is burned, active
reserves are recomputed, and a fresh capacity budget mints. Capacity you don't
use, you lose.

**4 · The rejects.** Reverting is a feature. Every refusal is public and indexed:

- **No slot** — the trader holds no cadence slot for this epoch
- **Oversize** — the trade exceeds the slot's capacity
- **Same-block passive unlock** — a split order tries to reach locked reserves

**The whole loop in one line:**

> Buy a cadence slot → swap against active depth → fill. Without a slot (or
> oversize, or reaching for passive) the trade reverts before it touches the pool.

## What a slot is — and is not

A cadence slot is a **capacity ticket**: the right to fill up to a size against
this epoch's active reserves, at a fixed primary price, minted as ERC-1155.

A slot is **not** LP equity, **not** a yield claim, **not** a take-permit against
a named maker. Explicitly not TAP, not Dockyard, not Parity. No fake APY. No
guarantees.

Unused slots expire worthless at refresh. That expiry is the honesty of the
instrument — a slot is a time-slice, not equity.

## The console

A live demo console proves every claim on one screen:

| Panel | What it proves |
|---|---|
| Buy a cadence slot | Fixed-price ERC-1155 mint, current epoch only, expiry named |
| Swap | The gate: slot ≥ size, notional burned, active-only quote |
| Reject log | No-slot / oversize / passive-unlock reverts, live |
| Graph panel | Mint / burn / consume index feed with per-epoch notionals |
| Pay for the ask | One paid x402 call on Hedera writes the slot ask |

**Judge demo** — press Run demo and it plays the entire loop in one take:
buy slot → fill → reject without → reject oversize → paid intel.

## Paid intel writes the price

Capacity pricing shouldn't be a hardcoded constant. One paid Hedera x402 call
returns a capacity/toxicity quote that **writes the cadence-slot ask** — real
payment, real intel, visible in the UI. One quote, one payment, no subscription.

## Explore

| Route | Purpose |
|---|---|
| `/` | Landing — the cadence-slot pitch |
| `/console` | Live demo console — buy, swap, rejects, graph, intel, Run demo |
| `/protocol` | Mechanism — problem, λ split, refresh, gate, rejects, honesty |
| `/graph` | Subgraph explorer — mint / burn / consume feed and entities |
| `/intel` | Hedera x402 — the paid quote that writes the ask |

State is shared across routes through a global provider — the epoch ticker
follows you from page to page.

## Design

Warm near-black with a single amber accent, serif display type against mono
numerics. Near-black `#0B0A08`, amber `#F0B441` at roughly 9.2:1 contrast, warm
grays throughout — never cool. The full system lives in
[brand.md](brand.md).

## Roadmap

- [x] Typed protocol state machine — epoch refresh, slot mint, gate, rejects, intel
- [x] Demo console with live reject paths and judge demo
- [x] Simulated fork semantics; contract calls wire in at the same seams
- [ ] Uniswap v4 hook (Foundry) — real `beforeSwap` gate on-chain
- [ ] The Graph Studio subgraph — production indexing
- [ ] Hedera x402 intel node — live paid quotes

## Run it locally

| Command | What it does |
|---|---|
| `npm install` | Install dependencies |
| `npm run dev` | Start the dev server at localhost:3000 |
| `npm run build` | Production build |
| `npm run lint` | Lint |

## Named risks

> **Say it plainly:** unused cadence slots expire worthless at epoch refresh.
> A slot is capacity, not LP equity. Active depth is capped at λ × total
> reserves. Scarcity is the product — and it cuts both ways.

---

<div align="center">

**Cadence** — depth you can gate.

</div>
