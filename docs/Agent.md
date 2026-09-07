# agent.md — Apron (Scarce Execution Allocation Tickets)

> Build-ready spec. COS PASS 2026-09-07. ETHOnline 2026 From Scratch. Deadline Sun Sep 13 2026 12:00pm EDT.
> Product name: **Apron** (formerly SEAT). Mechanism freeze unchanged.
> Explicit ≠ TAP / ≠ Dockyard / ≠ Parity. Never Dock/Berth/Dockyard-adjacent naming. New traded object: epoch execution capacity. No fake APY. No finalist guarantee.

---

## One-Liner

**Apron** tokenizes scarce per-epoch execution capacity as ERC-1155 tickets against a PA-AMM-style active/passive pool: buy an apron slot, then swap against **active** reserves only; without a slot (or oversize / same-block passive unlock) the trade **rejects**. Graph indexes mint/burn/consume; Hedera x402 paid intel sets the apron-slot ask.

Not a take-permit vs a named Aqua maker (that was TAP). Not a fee desk (Dockyard). Not a peg desk (Parity). Edge = mechanism (bounded LVR + prepaid capacity), not invented yield.

**Narrative law (codegen + demo):** Lead with **APRON SLOTS** (buy an apron slot → consume → expire → reject without). Demo copy: buy an apron slot → swap → reject without. Never lead with "partially active AMM" or λ/tracking-error jargon. The hook is the venue; the product is the scarce gate slot. Never Dock/Berth/Dockyard-adjacent naming.

---

## Problem & Target User

### Problem
LPs who stand forever in CFMM/CLMM eat LVR / adverse selection when arb drains full depth in one block. Research (PA-AMM) partitions active/passive each block but does **not** market the scarce capacity as a separate instrument. Status quo for “who gets depth”: gas race / JIT / private RFQ.

### Target users
- **Apron-slot sellers:** LPs / pool deployers who want LVR reduction + capacity revenue.
- **Apron-slot buyers:** Solvers, arb desks, size traders who need guaranteed fill capacity this epoch.

### JTBD (seller)
"Sell epoch apron slots so arb cannot drain my full depth for free — and earn on capacity."

### JTBD (buyer)
"Buy an apron slot so my size fills against active liquidity this epoch — not a gas lottery."

### Invention
Object traded: expiring **capacity ticket** (ERC-1155 per pool/epoch) = right to consume up to size `S` of that epoch’s **active** reserves. Passive locked until refresh. Unused apron slots expire. Seat ≠ LP share.

### Explicit ≠ TAP / Dockyard / Parity

| | TAP | Dockyard | Parity | **Apron** |
|---|---|---|---|---|
| Object | Take-permit vs named Aqua maker | Fee multi-strategy desk | PeggedSwap desk | **Pool-wide epoch capacity tickets** |
| Venue | Aqua Conditional Access | Aqua SwapVM | Aqua PeggedSwap | **Uniswap v4 hook / PA pool** |


---

## Hackathon & Bounty Fit (exactly 3)

| # | Partner | Track | Load-bearing |
|---|---|---|---|
| 1 | **Uniswap Foundation** | Best Uniswap Stack / v4 hooks | PA-AMM-style hook: active/passive + apron-slot gate in beforeSwap |
| 2 | **The Graph** | Composable/Standardized products | Live Studio subgraph: seat mint/burn/consume + DEX compose for LVR/markout proxy |
| 3 | **Hedera** | x402 agentic payments | ≥1 paid capacity/toxicity intel call that writes apron-slot ask UI |

**ETHGlobal axes (honest):** Technicality 8 · Originality 9 · Practicality 8 · Usability 8 · WOW 8 — lead demo with seat object + reject path, not “λ jargon.”

**Deadline:** Sun Sep 13 2026 12:00pm EDT · From Scratch.

---

## Market Validation Summary

| Field | Value |
|---|---|
| Venture Readiness | **76/100 · Mixed-leaning-strong** |
| Why now | PA-AMM paper Feb 2026; v4 hooks mature; ETHOnline Uniswap+Graph+Hedera |
| Biggest risk | Sounds like “another AMM hook” — lead with apron slot + reject |
| Cheapest test | Loom to 8 LPs/solver ops: buy/sell epoch apron slots if fail-without-seat is real? |
| Honesty | No finalist guarantee. No invented TAM. No fake APY. |

Pillars: demand 8 · timing 8 · competition 8 · customer 7 · GTM 7 · execution 7 · unit econ 7.
Idea-pipeline ~7.86. No pillar ≤5.

FACT: LVR is core LP loss; PA-AMM active/passive exists in research; ticket market NOT FOUND as deployed EVM product (search 2026-09-07).
INFERENCE: Tokenizing the scarce time-slice is the missing instrument.
HYPOTHESIS: Solvers buy apron slots ahead of known flow; LPs earn seat sales + lower LVR.

### vs named families

| Family | Apron difference |
|---|---|
| CFMM/CLMM/v4 fee hooks | Primary object = expiring capacity, not fee schedule |
| PA-AMM paper | Markets the capacity right as ERC-1155; paper has no ticket market |
| TAP | Pool-wide epoch capacity, not counterparty take-option vs Aqua maker |
| RFQ/HOT | Prices when liquidity may be consumed, onchain |
| Intent Dutch | Markets capacity supply, not user sell-flow auction |
| LP tokens | Seat ≠ share of reserves; unused expires worthless |


---

## MVP vs Stretch — User Stories

### MVP (law)

1. As a deployer, I launch **one pair** with one `λ`, epoch = block (or N-block), active/passive split.
2. As a buyer, I mint ERC-1155 apron slots for the **current epoch only** at a fixed primary price.
3. As a trader, beforeSwap requires apron slot ≥ size; burns/locks slot; quotes **active only**.
4. As a judge, I see **reject** for: no apron slot / oversize / same-block passive unlock attempt.
5. As a user, Graph panel shows mint/burn/consume (live Studio, no mocks).
6. As a user, I complete ≥1 Hedera x402 paid intel call that writes the apron-slot ask.
7. Demo ≤4 min; multi-commit git.

### Stretch (only if MVP green by Thu Sep 11)
- Secondary apron-slot transfer / mini-CLOB
- Multi-pool router
- Richer LVR tracking panel
- Dynamic apron-slot pricing from intel

### Forbidden
TAP / Dockyard / Parity · secondary CLOB in MVP · Aqua Conditional Access story · fake APY · verify · games · markout insurance product

---

## Non-Functionals

| NFR | Requirement |
|---|---|
| Invariant | Passive cannot unlock via same-block order splitting |
| Apron-slot honesty | Unused apron slots expire; seat ≠ LP equity |
| Demo clarity | Copy leads with “apron slot for this epoch/block” |
| Graph | Live Studio data only |
| UI | Near-black, one accent, serif + mono; no purple SaaS |
| Narrative | Buy apron slot → swap → fail without / succeed with |
| Commits | Multi-commit history |
| Deadline | Sun Sep 13 2026 12:00pm EDT |

---

## Architecture and Stack

```
Uniswap v4 Pool + Apron Hook
  active reserves (tradable this epoch)
  passive reserves (locked until refresh)
  λ, epochId
        |
  ERC-1155 ApronSlot(epochId) primary mint (fixed price)
        |
  beforeSwap: require apron slot ≥ size → burn/lock → quote active only
        |
  reject: no apron slot / oversize / same-block passive unlock
        |
  Graph: mint/burn/consume + LVR proxy
  Hedera x402: capacity/toxicity intel → apron-slot ask UI
```

### Stack

| Layer | Choice |
|---|---|
| App | Next.js or Vite + TypeScript + Tailwind |
| Contracts | Solidity v4 hook + ERC-1155 seats; Foundry tests |
| Chain | One EVM + Anvil fork for demo fills |
| Graph | Subgraph Studio live |
| Intel | Node route + Blocky402 on Hedera testnet |
| Host | Vercel |


---

## Data Model

PoolConfig: pair, lambdaBps, epochLengthBlocks, activeReserve, passiveReserve, epochId.

ApronSlotToken (ERC-1155): id = epochId (or poolId+epochId), balance = capacity notional.

ApronMint: buyer, epochId, size, pricePaid, ts.

ApronConsume: trader, epochId, sizeBurned, swapTx, ts.

IntelQuote (x402): asOf, pair, suggestedAsk, rationale.

---

## API / Program Spec

### A. Epoch refresh
On new epoch: unlock/refresh active = λ * total eligible; mint capacity budget; expire prior seats.

### B. Primary mint
Pay fixed price → mint ERC-1155 apron slots for current epoch only.

### C. beforeSwap (hook)
1. Require msg.sender (or router payer) holds apron slot ≥ trade size.
2. Burn/lock apron-slot notional.
3. Execute against active reserves only.
4. Revert if no seat, oversize vs active, or attempt to reach passive same block.

### D. Reject demos (must work)
- Swap without apron slot → revert
- Swap size > apron slot → revert
- Same-block split trying to unlock passive → revert

### E. Graph
Index mint, burn, consume; panel live.

### F. Hedera x402
Paid intel → apron-slot ask field in UI. ≥1 end-to-end paid call.

---

## UX Flow

### Visual system
Near-black, one accent (mint or amber — pick one), serif titles, mono for sizes/epoch/seat balances. No purple SaaS.
Layout: Buy Apron slot | Swap | Reject log | Graph panel | Pay intel.

### Critical path
1. Landing: “Buy an apron slot for this epoch.”
2. Buy apron slot (fixed price).
3. Swap succeeds with seat.
4. Same swap fails without seat (side-by-side or sequential).
5. Graph updates mint/consume.
6. x402 intel updates ask.

### Copy rules
- Say apron slot / capacity ticket — not “guaranteed APY.”
- Named risk: unused seats expire; active depth is capped.
- Explicit ≠ TAP (not Aqua take-permit). Product name Apron, not SEAT.


---

## Success Metrics

### ETHOnline DoD
- One pair, one λ, epoch apron slots ERC-1155
- Fixed-price primary mint
- beforeSwap apron-slot gate + active-only + reject paths
- Graph mint/burn/consume live
- ≥1 Hedera x402 paid intel → apron-slot ask
- Demo ≤4 min; multi-commit repo
- Submit before Sun Sep 13 2026 12:00pm EDT

### Startup hypotheses
- 8 LP/solver Looms; ≥3 would buy or sell apron slots
- Take-rate on apron-slot premium post-hackathon

Axes: T8 O9 P8 U8 W8

---

## Demo Script (≤4 min)

| Beat | Judges see |
|---|---|
| Hook | Swap without apron slot fails on camera |
| Product | Apron = scarce epoch execution capacity (gate slots) |
| Buy | Mint ERC-1155 apron slot |
| Success | Same size swap succeeds after buying apron slot |
| Invariant | Same-block split cannot unlock passive |
| Graph | Mint/consume panel |
| x402 | Paid intel writes apron-slot ask |
| Close | ≠ TAP; partners load-bearing; named risk |

---

## Launch and First-Customer Plan

1–3 Uniswap/v4 LP operators who hate arb LVR
4–5 Solver / arb desks needing epoch depth
6 ETHOnline AMM-background teammate
7 Graph subgraph collab
8 Hedera x402 bounty hunter
9 One DAO treasury LP
10 Uniswap Discord / office hours

Monetization: take-rate on apron-slot premium + tiny active swap fee. Not APY.

---

## Risks

| Risk | Mitigation |
|---|---|
| “Another AMM hook” | Lead seat object + reject path |
| Confused with TAP | Explicit ≠ Aqua take-permit |
| Usability jargon | Copy = “apron slot for this block” |
| Week clock | One pair, fixed price, no CLOB |
| PA-AMM complexity | Minimal λ + active/passive only |

---

## Build Roadmap

Mon Sep 7 → Sun Sep 13 12:00pm EDT.

Day 0–1: Hook scaffold + active/passive + Foundry reject tests.
Day 2: ERC-1155 apron slots + fixed-price mint + beforeSwap burn.
Day 3: Demo reject/success paths solid; epoch refresh.
Day 4: Graph mint/burn/consume panel live.
Day 5: x402 intel → apron-slot ask UI; polish.
Day 6: Demo video + README ≠ TAP; submit.

Hard cut: never drop apron-slot gate, reject demos, Graph, or x402. Cut secondary market and multi-pool first.


---

## Build Instructions for Codegen Agent

Imperative. Follow exactly.

1. Scaffold typed web app named apron with Tailwind.
2. Near-black UI, one accent, serif and mono. No purple SaaS.
3. Foundry project for Uniswap v4 hook + ERC-1155 seats; one pair; one lambda; epoch = block or N-block.
4. Implement active/passive split; beforeSwap requires apron slot >= size, burns/locks, quotes active only.
5. Reject paths: no seat, oversize, same-block passive unlock.
6. Fixed-price primary mint for current-epoch apron slots only.
7. Graph live Studio panel for mint/burn/consume.
8. Hedera x402 paid intel writes apron-slot ask; at least one paid call in demo.
9. README: invention brief, not TAP/Dockyard/Parity, bounty map, demo script, named risks.
10. Multi-day commits. No secondary CLOB, Aqua TAP, fake APY, verify, games.
11. Follow Uniswap v4 hook docs. Do not invent PoolManager semantics.

Suggested layout: app, contracts, lib/graph, lib/x402, scripts/demo, README.md, agent.md

---

## References

- /workspace/ideation/ethonline2026-validator-packet-newtrade-v2.md
- https://arxiv.org/html/2602.09887
- https://arxiv.org/html/2208.06046
- https://ethglobal.com/events/ethonline2026/prizes/uniswap-foundation
- https://ethglobal.com/events/ethonline2026/prizes/the-graph
- https://ethglobal.com/events/ethonline2026/prizes/hedera
- https://ethglobal.com/events/ethonline2026/info/details

---

## Spec freeze acknowledgement

Matches COS PASS:
- Product Apron — Scarce Execution Allocation Tickets (formerly SEAT) (ERC-1155) vs PA-AMM-style active/passive pool
- VR 76/100; ETHGlobal T8/O9/P8/U8/W8
- MVP: one pair, one lambda, epoch apron slots, fixed-price mint, beforeSwap apron-slot gate, reject paths, Graph panel, x402 intel, demo <=4 min, multi-commit
- Bounties: Uniswap v4 hook, Graph, Hedera x402
- Forbidden: TAP/Dockyard/Parity, secondary CLOB, Aqua, fake APY
- Demo lead: seat object + reject path
- Explicit not TAP
- Deadline: Sun Sep 13 2026 12:00pm EDT
