# Apron

**Scarce per-epoch execution capacity, sold as ERC-1155 apron slots.**

Buy an apron slot for this epoch → swap against **active** reserves only → without a slot (or oversize / same-block passive unlock) the trade **reverts** at `beforeSwap`. The Graph indexes mint/burn/consume; Hedera x402 paid intel writes the apron-slot ask.

Explicitly **not** TAP (no Aqua take-permit) · not Dockyard (no fee desk) · not Parity (no peg desk). No fake APY. No finalist guarantee.

## Console

| Panel | What it proves |
|---|---|
| Buy an apron slot | Fixed-price ERC-1155 mint, current epoch only, expiry named |
| Swap | `beforeSwap` gate: slot ≥ size, notional burned, active-only quote |
| Reject log | No-slot / oversize / same-block passive-unlock reverts, live |
| Graph panel | Mint/burn/consume index feed with per-epoch notionals |
| Pay for the ask | One paid x402 call on Hedera writes the slot ask |

**Judge demo:** press **Run demo** — it plays buy → fill → reject-without → reject-oversize → paid intel in one run.

## Demo script (≤ 4 min)

1. Swap without a slot — reverts on camera.
2. Apron = scarce epoch execution capacity (gate slots).
3. Mint an ERC-1155 apron slot.
4. Same-size swap now fills against active depth.
5. Same-block split cannot unlock passive — revert.
6. Graph panel updates mint/consume.
7. Paid x402 intel updates the ask.
8. Close: ≠ TAP; named risks (slots expire worthless, seat ≠ equity).

## Stack

- Next.js 16 (App Router) + TypeScript + Tailwind v4
- Brand: warm near-black + one amber accent, serif display + mono numerics (`brand.md`)
- `lib/apron/` — typed protocol state machine (epoch refresh, slot mint, `beforeSwap` gate, rejects, intel). Simulated fork semantics; contract calls wire in at the same seams.
- Planned: Uniswap v4 hook (Foundry) · The Graph Studio subgraph · Hedera x402 intel node

## Develop

```bash
npm run dev   # http://localhost:3000
npm run build
npm run lint
```

## Named risks

Unused apron slots expire worthless at epoch refresh. A slot is capacity, not LP equity. Active depth is capped at λ × total reserves.
