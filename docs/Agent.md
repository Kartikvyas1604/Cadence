# agent.md — Cadence (Scarce Execution Allocation Tickets)

> Build-ready spec. COS PASS 2026-09-07. ETHOnline 2026 From Scratch. Deadline Sun Sep 13 2026 12:00pm EDT.
> Product name: **Cadence** (formerly SEAT / Apron). Mechanism freeze unchanged.
> Explicit ≠ TAP / ≠ Dockyard / ≠ Parity. Never Dock/Berth/Dockyard-adjacent naming. New traded object: epoch execution capacity. No fake APY. No finalist guarantee.

---

> **Rename law:** Product is **Cadence** (formerly SEAT / Apron). Demo beat #1: buy a Cadence slot → swap → reject without. Never kitchen / Apron / Dock / Berth branding. Mechanism freeze + Next.js App Router stack lock unchanged.
> **Privacy amendment (PASS 2026-09-08):** Private Cadence Intent — commit `H=hash(size,epochId,salt)` → mint against commitment → `beforeSwap` reveal → verify → consume → swap active only. Privacy beat #2 ≤30s. Keep Hedera x402. Escapement untouched.

## One-Liner

**Cadence** tokenizes scarce per-epoch execution capacity as ERC-1155 tickets against a PA-AMM-style active/passive pool: buy a Cadence slot, then swap against **active** reserves only; without a slot (or oversize / same-block passive unlock) the trade **rejects**. Graph indexes mint/burn/consume + commit→reveal; Hedera x402 paid intel sets the Cadence-slot ask. Optional Private Cadence Intent hides size until `beforeSwap` reveal.

Not a take-permit vs a named Aqua maker (that was TAP). Not a fee desk (Dockyard). Not a peg desk (Parity). Edge = mechanism (bounded LVR + prepaid capacity), not invented yield.

**Narrative law (codegen + demo):** Lead with **CADENCE SLOTS** (buy a Cadence slot → consume → expire → reject without). Demo copy: buy a Cadence slot → swap → reject without. Never lead with "partially active AMM" or λ/tracking-error jargon. The hook is the venue; the product is the scarce gate slot. Never Dock/Berth/Dockyard-adjacent naming. Privacy is beat #2 only — never open with commit-reveal or “privacy DEX.”

---

## Problem & Target User

### Problem
LPs who stand forever in CFMM/CLMM eat LVR / adverse selection when arb drains full depth in one block. Research (PA-AMM) partitions active/passive each block but does **not** market the scarce capacity as a separate instrument. Status quo for “who gets depth”: gas race / JIT / private RFQ.

### Target users
- **Cadence-slot sellers:** LPs / pool deployers who want LVR reduction + capacity revenue.
- **Cadence-slot buyers:** Solvers, arb desks, size traders who need guaranteed fill capacity this epoch.

### JTBD (seller)
"Sell epoch Cadence slots so arb cannot drain my full depth for free — and earn on capacity."

### JTBD (buyer)
"Buy a Cadence slot so my size fills against active liquidity this epoch — not a gas lottery."

### Invention
Object traded: expiring **capacity ticket** (ERC-1155 per pool/epoch) = right to consume up to size `S` of that epoch’s **active** reserves. Passive locked until refresh. Unused Cadence slots expire. Cadence slot ≠ LP share.

### Explicit ≠ TAP / Dockyard / Parity

| | TAP | Dockyard | Parity | **Cadence** |
|---|---|---|---|---|
| Object | Take-permit vs named Aqua maker | Fee multi-strategy desk | PeggedSwap desk | **Pool-wide epoch capacity tickets** |
| Venue | Aqua Conditional Access | Aqua SwapVM | Aqua PeggedSwap | **Uniswap v4 hook / PA pool** |


---

## Hackathon & Bounty Fit (exactly 3)

| # | Partner | Track | Load-bearing |
|---|---|---|---|
| 1 | **Uniswap Foundation** | Best Uniswap Stack / v4 hooks | PA-AMM-style hook: active/passive + Cadence-slot gate in beforeSwap |
| 2 | **The Graph** | Composable/Standardized products | Live Studio subgraph: Cadence-slot mint/burn/consume + DEX compose for LVR/markout proxy |
| 3 | **Hedera** | x402 agentic payments | ≥1 paid capacity/toxicity intel call that writes Cadence-slot ask UI |

**ETHGlobal axes (honest):** Technicality 8 · Originality 9 · Practicality 8 · Usability 8 · WOW 8 — lead demo with Cadence-slot object + reject path, not “λ jargon.”

**Deadline:** Sun Sep 13 2026 12:00pm EDT · From Scratch.

---

## Market Validation Summary

| Field | Value |
|---|---|
| Venture Readiness | **76/100 · Mixed-leaning-strong** |
| Why now | PA-AMM paper Feb 2026; v4 hooks mature; ETHOnline Uniswap+Graph+Hedera |
| Biggest risk | Sounds like “another AMM hook” — lead with Cadence slot + reject |
| Cheapest test | Loom to 8 LPs/solver ops: buy/sell epoch Cadence slots if fail-without-Cadence-slot is real? |
| Honesty | No finalist guarantee. No invented TAM. No fake APY. |

Pillars: demand 8 · timing 8 · competition 8 · customer 7 · GTM 7 · execution 7 · unit econ 7.
Idea-pipeline ~7.86. No pillar ≤5.

FACT: LVR is core LP loss; PA-AMM active/passive exists in research; ticket market NOT FOUND as deployed EVM product (search 2026-09-07).
INFERENCE: Tokenizing the scarce time-slice is the missing instrument.
HYPOTHESIS: Solvers buy Cadence slots ahead of known flow; LPs earn Cadence-slot sales + lower LVR.

### vs named families

| Family | Cadence difference |
|---|---|
| CFMM/CLMM/v4 fee hooks | Primary object = expiring capacity, not fee schedule |
| PA-AMM paper | Markets the capacity right as ERC-1155; paper has no ticket market |
| TAP | Pool-wide epoch capacity, not counterparty take-option vs Aqua maker |
| RFQ/HOT | Prices when liquidity may be consumed, onchain |
| Intent Dutch | Markets capacity supply, not user sell-flow auction |
| LP tokens | Cadence slot ≠ share of reserves; unused expires worthless |


---

## MVP vs Stretch — User Stories

### MVP (law)

1. As a deployer, I launch **one pair** with one `λ`, epoch = block (or N-block), active/passive split.
2. As a buyer, I mint ERC-1155 Cadence slots for the **current epoch only** at a fixed primary price — **public mint path** (demo lead) **or** Private Cadence Intent path below.
3. **Private Cadence Intent (MVP):** commit `H = hash(size, epochId, salt)` → mint Cadence slot against commitment (size not public on mint) → at `beforeSwap` **reveal** `(size, salt)` → verify hash → consume slot ≥ trade size → swap against **active** only.
4. As a trader, beforeSwap requires Cadence slot ≥ size; burns/locks slot; quotes **active only**.
5. As a judge, I see **reject** for: no Cadence slot / oversize / same-block passive unlock attempt.
6. As a user, Graph panel shows mint/burn/consume **plus** commit→reveal (live Studio, no mocks). Events: `SlotCommitted` / `SlotRevealed` — not private forever.
7. As a user, I complete ≥1 Hedera x402 paid intel call that writes the Cadence-slot ask (unchanged).
8. Demo ≤4 min; beat #1 = buy → swap → reject without; privacy beat #2 ≤30s (commitment-only mint then reveal-on-consume); multi-commit git.

### Stretch (only if MVP green by Thu Sep 11)
- Secondary Cadence-slot transfer / mini-CLOB
- Multi-pool router
- Richer LVR tracking panel
- Dynamic Cadence-slot pricing from intel
- Stealth/ephemeral payer (optional); CRE TEE confidential ask (ITERATE only if privacy *bounty* partner required)

### Forbidden
TAP / Dockyard / Parity · secondary CLOB in MVP · Aqua Conditional Access story · fake APY · verify / World/KYC as privacy · games · markout insurance · **privacy sticker** (toggle with no commitment object) · **Veil sealed-fill / dark swap** of the AMM trade · **Aztec / Railgun** as partners · drop Hedera x402 · forever-private Graph mints · Escapement/PULSE confusion

---

## Non-Functionals

| NFR | Requirement |
|---|---|
| Invariant | Passive cannot unlock via same-block order splitting |
| Cadence-slot honesty | Unused Cadence slots expire; Cadence slot ≠ LP equity |
| Demo clarity | Copy leads with “Cadence slot for this epoch/block” |
| Graph | Live Studio data only |
| UI | Near-black, one accent, serif + mono; no purple SaaS |
| Narrative | Beat #1: Buy Cadence slot → swap → fail without / succeed with. Privacy = beat #2 only |
| Privacy | Commit-reveal on capacity intent only — not private AMM fill |
| Commits | Multi-commit history |
| Deadline | Sun Sep 13 2026 12:00pm EDT |

---

## Architecture and Stack

```
Uniswap v4 Pool + Cadence Hook
  active reserves (tradable this epoch)
  passive reserves (locked until refresh)
  λ, epochId
        |
  Hedera x402 ask (unchanged)
        |
  Mint paths:
    public: fixed-price Cadence slot (demo lead)
    private: commit H=hash(size,epochId,salt) → mint against H
        |
  beforeSwap:
    private path: reveal(size,salt) → verify H → consume ≥ size
    require Cadence slot ≥ size → burn/lock → quote active only
        |
  reject: no Cadence slot / oversize / same-block passive unlock
        |
  Graph: SlotCommitted → SlotRevealed → mint/burn/consume + LVR proxy
  (commitment hash public; size reveals at consume — not private forever)
```

### Stack (LOCKED — Next.js App Router; product rename Cadence 2026-09-07)

| Layer | Choice |
|---|---|
| App | **Next.js (App Router) + TypeScript + Tailwind** — NOT Vite |
| Backend | Next.js **Route Handlers** under `app/api/**/route.ts` (Graph proxy, Hedera x402 intel, server-only secrets) |
| Client | wagmi/viem in `app/` pages |
| Contracts | Solidity v4 hook + ERC-1155 Cadence slots; **Foundry** tests |
| Chain | One EVM + Anvil fork for demo fills |
| Graph | Subgraph Studio live (proxied via Route Handlers) |
| Intel | Route Handler + Blocky402 on Hedera testnet |
| Host | **Vercel** |

Mechanism freeze unchanged. Stack choice is locked — do not scaffold Vite.


---

## Data Model

PoolConfig: pair, lambdaBps, epochLengthBlocks, activeReserve, passiveReserve, epochId.

CadenceSlotToken (ERC-1155): id = epochId (or poolId+epochId), balance = capacity notional (revealed) or commitment-backed pending reveal.

CadenceCommitment: epochId, H (bytes32), payer (optional), pricePaid, ts, status = Committed | Revealed | Expired.

CadenceMint: buyer (or null if stealth stretch), epochId, size (null until reveal), commitment H, pricePaid, ts.

CadenceConsume: trader, epochId, sizeBurned, swapTx, ts, revealedFromCommitment bool.

Events: SlotCommitted(epochId, H, payer?) · SlotRevealed(epochId, size, slotId) · keep consume/reject.

IntelQuote (x402): asOf, pair, suggestedAsk, rationale.

---

## API / Program Spec

### A. Epoch refresh
On new epoch: unlock/refresh active = λ * total eligible; mint capacity budget; expire prior Cadence slots.

### B. Primary mint (public path — demo lead)
Pay fixed price → mint ERC-1155 Cadence slots for current epoch only (size visible).

### B2. Private Cadence Intent — `commitMint(H)`
1. Buyer computes `H = hash(size, epochId, salt)` offchain (or client).
2. Pay fixed price → mint against commitment `H` (size **not** in public mint payload).
3. Emit `SlotCommitted(epochId, H, payer?)`.

### C. beforeSwap (hook) — public or reveal path
1. **Private path:** `revealAndConsume(size, salt)` — verify `hash(size, epochId, salt) == H`; emit `SlotRevealed(epochId, size, slotId)`; then consume.
2. Require msg.sender (or router payer) holds Cadence slot ≥ trade size.
3. Burn/lock Cadence-slot notional.
4. Execute against active reserves only.
5. Revert if no Cadence slot, bad reveal, oversize vs active, or attempt to reach passive same block.

### D. Reject demos (must work)
- Swap without Cadence slot → revert
- Swap size > Cadence slot → revert
- Same-block split trying to unlock passive → revert
- Reveal with wrong salt/size → revert

### E. Graph
Index mint, burn, consume, **SlotCommitted → SlotRevealed** (commit then reveal — not forever private); panel live.

### F. Hedera x402
Paid intel → Cadence-slot ask field in UI. ≥1 end-to-end paid call. **Do not drop x402.**

---

## UX Flow

### Visual system
Near-black, one accent (mint or amber — pick one), serif titles, mono for sizes/epoch/Cadence-slot balances. No purple SaaS.
Layout: Buy Cadence slot | Swap | Reject log | Graph panel | Pay intel | **Private intent (committed)** secondary panel.

### Critical path (beat #1 — always first)
1. Landing: “Buy a Cadence slot for this epoch.”
2. Buy Cadence slot (fixed price) — public path.
3. Swap succeeds with Cadence slot.
4. Same swap fails without Cadence slot (side-by-side or sequential).
5. Graph updates mint/consume.
6. x402 intel updates ask.

### Privacy beat #2 (≤30s — never open with this)
1. Toggle / panel: Private Cadence Intent.
2. Commit-mint: explorer shows commitment `H` only (no size).
3. Swap with reveal: size appears at consume; Graph shows SlotCommitted → SlotRevealed.
4. One line: “We hid capacity intent until fill — not a dark AMM.”

### Copy rules
- Say Cadence slot / capacity ticket — not “guaranteed APY.”
- Named risk: unused Cadence slots expire; active depth is capped.
- Explicit ≠ TAP (not Aqua take-permit). Product name Cadence (not SEAT / Apron).
- Never lead with “privacy DEX,” commit-reveal, or Veil/sealed-fill language.


---

## Success Metrics

### ETHOnline DoD
- One pair, one λ, epoch Cadence slots ERC-1155
- Fixed-price primary mint (public + commitMint path)
- Private Cadence Intent: commit → mint → reveal in beforeSwap → consume
- beforeSwap Cadence-slot gate + active-only + reject paths
- Graph mint/burn/consume + SlotCommitted/SlotRevealed live
- ≥1 Hedera x402 paid intel → Cadence-slot ask (kept)
- Demo ≤4 min with privacy ≤30s second; multi-commit repo
- Submit before Sun Sep 13 2026 12:00pm EDT

### Startup hypotheses
- 8 LP/solver Looms; ≥3 would buy or sell Cadence slots
- Take-rate on Cadence-slot premium post-hackathon

Axes: T8 O9 P8 U8 W8

---

## Demo Script (≤4 min)

| Beat | Judges see |
|---|---|
| Hook (#1) | Swap without Cadence slot fails on camera |
| Product | Cadence = scarce epoch execution capacity (gate slots) |
| Buy | Mint ERC-1155 Cadence slot |
| Success | Same size swap succeeds after buying Cadence slot |
| Invariant | Same-block split cannot unlock passive |
| Privacy (#2 ≤30s) | Commitment-only mint → reveal-on-consume; contrast public size leak |
| Graph | Mint/consume + SlotCommitted → SlotRevealed |
| x402 | Paid intel writes Cadence-slot ask |
| Close | ≠ TAP; ≠ privacy sticker; Uni+Graph+Hedera load-bearing; named risk |

---

## Launch and First-Customer Plan

1–3 Uniswap/v4 LP operators who hate arb LVR
4–5 Solver / arb desks needing epoch depth
6 ETHOnline AMM-background teammate
7 Graph subgraph collab
8 Hedera x402 bounty hunter
9 One DAO treasury LP
10 Uniswap Discord / office hours

Monetization: take-rate on Cadence-slot premium + tiny active swap fee. Not APY.

---

## Risks

| Risk | Mitigation |
|---|---|
| “Another AMM hook” | Lead Cadence-slot object + reject path |
| Confused with TAP | Explicit ≠ Aqua take-permit |
| Usability jargon | Copy = “Cadence slot for this block” |
| Week clock | One pair, fixed price, no CLOB |
| PA-AMM complexity | Minimal λ + active/passive only |
| Privacy buries Cadence story | Reject path = beat #1; privacy ≤30s second |
| Looks like Veil/dark DEX | Commit-reveal on **capacity intent** only; swap stays public |

---

## Build Roadmap

Mon Sep 7 → Sun Sep 13 12:00pm EDT.

Day 0–1: Hook scaffold + active/passive + Foundry reject tests.
Day 2: ERC-1155 Cadence slots + fixed-price mint + beforeSwap burn.
Day 3: Demo reject/success paths solid; epoch refresh; commitMint + revealAndConsume.
Day 4: Graph mint/burn/consume + SlotCommitted/SlotRevealed panel live.
Day 5: x402 intel → Cadence-slot ask UI; privacy beat polish.
Day 6: Demo video + README ≠ TAP; submit.

Hard cut: never drop Cadence-slot gate, reject demos, Graph, or x402. Cut secondary market and multi-pool first. If clock fails on commit-reveal, ship public-mint Cadence first (base PASS); privacy is additive.


---

## Build Instructions for Codegen Agent

Imperative. Follow exactly.

1. Scaffold a **Next.js App Router** app named `cadence` with TypeScript + Tailwind. **Do not use Vite.**
2. Near-black UI, one accent, serif and mono. No purple SaaS.
3. Foundry project under `contracts/` for Uniswap v4 hook + ERC-1155 Cadence slots; one pair; one lambda; epoch = block or N-block.
4. Implement active/passive split; beforeSwap requires Cadence slot >= size, burns/locks, quotes active only.
5. Reject paths: no Cadence slot, oversize, same-block passive unlock, bad reveal.
6. Fixed-price primary mint for current-epoch Cadence slots only (public path).
6b. Private Cadence Intent: `commitMint(H)` where `H=hash(size,epochId,salt)`; `revealAndConsume(size,salt)` in beforeSwap; emit SlotCommitted / SlotRevealed.
7. Graph live Studio panel for mint/burn/consume + commit→reveal — fetch via **Route Handlers** (`app/api/**/route.ts`), never expose studio keys in the client. Not forever-private.
8. Hedera x402 paid intel writes Cadence-slot ask via Route Handlers + Blocky402; at least one paid call in demo; secrets stay server-side. **Do not drop x402.**
9. Client: wagmi/viem in `app/` pages for wallet + contract calls. UI: primary Buy→Swap→Reject; secondary Private intent panel.
10. README: invention brief, not TAP/Dockyard/Parity, bounty map, demo script (privacy beat #2), named risks. Rename law: Cadence.
11. Multi-day commits. No secondary CLOB, Aqua TAP, fake APY, verify/World KYC, games, privacy sticker, Veil sealed-fill, Aztec/Railgun.
12. Follow Uniswap v4 hook docs. Do not invent PoolManager semantics. Host on Vercel. Next.js App Router stack lock unchanged. Escapement out of scope.

Suggested layout (single Next app — UI + API colocated):
```
apps/web/                 # Next.js App Router
  app/                    # UI pages/layouts
  app/api/**/route.ts     # backend Route Handlers (Graph proxy, x402 intel, secrets)
  lib/graph/
  lib/x402/
contracts/                # Foundry
scripts/demo/
README.md
agent.md
```

---

## References

- /workspace/ideation/ethonline2026-validator-packet-newtrade-v2.md
- /workspace/ideation/ethonline2026-validator-packet-cadence-privacy.md
- /workspace/ideation/research-cadence-privacy.md
- https://arxiv.org/html/2602.09887
- https://arxiv.org/html/2208.06046
- https://ethglobal.com/events/ethonline2026/prizes/uniswap-foundation
- https://ethglobal.com/events/ethonline2026/prizes/the-graph
- https://ethglobal.com/events/ethonline2026/prizes/hedera
- https://ethglobal.com/events/ethonline2026/info/details

---

## Spec freeze acknowledgement

Matches COS PASS:
- Product Cadence — scarce per-epoch execution capacity (formerly SEAT / Apron) (ERC-1155) vs PA-AMM-style active/passive pool
- VR 76/100; ETHGlobal T8/O9/P8/U8/W8
- MVP: one pair, one lambda, epoch Cadence slots, fixed-price mint, Private Cadence Intent (commit→reveal), beforeSwap Cadence-slot gate, reject paths, Graph commit/reveal panel, x402 intel, demo <=4 min (privacy #2 <=30s), multi-commit
- Bounties: Uniswap v4 hook, Graph, Hedera x402
- Forbidden: TAP/Dockyard/Parity, secondary CLOB, Aqua, fake APY, privacy sticker, Veil sealed-fill, Aztec/Railgun, drop x402, World/KYC privacy
- Demo lead: Cadence-slot object + reject path; privacy second
- Explicit not TAP
- Deadline: Sun Sep 13 2026 12:00pm EDT
