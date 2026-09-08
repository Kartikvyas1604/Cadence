agent.md — Cadence (Scarce Execution Allocation Tickets)
Build-ready spec. COS PASS 2026-09-07. ETHOnline 2026 From Scratch. Deadline Sun Sep 13 2026 12:00pm EDT. Product name: Cadence (formerly SEAT / Apron). Mechanism freeze unchanged. Explicit ≠ TAP / ≠ Dockyard / ≠ Parity. Never Dock/Berth/Dockyard-adjacent naming. New traded object: epoch execution capacity. No fake APY. No finalist guarantee.

Rename law: Product is Cadence (formerly SEAT / Apron). Demo beat #1: buy a Cadence slot → swap → reject without. Never kitchen / Apron / Dock / Berth branding. Mechanism freeze + Next.js App Router stack lock unchanged. Privacy amendment (PASS 2026-09-08): Private Cadence Intent — commit H=hash(size,epochId,salt) → mint against commitment → beforeSwap reveal → verify → consume → swap active only. Privacy beat #2 ≤30s. Keep Hedera x402. Escapement / LATCH untouched.

One-Liner
Cadence tokenizes scarce per-epoch execution capacity as ERC-1155 tickets against a PA-AMM-style active/passive pool: buy a Cadence slot, then swap against active reserves only; without a slot (or oversize / same-block passive unlock) the trade rejects. Graph indexes mint/burn/consume + commit→reveal; Hedera x402 paid intel sets the Cadence-slot ask. Optional Private Cadence Intent hides size until beforeSwap reveal.

Not a take-permit vs a named Aqua maker (that was TAP). Not a fee desk (Dockyard). Not a peg desk (Parity). Edge = mechanism (bounded LVR + prepaid capacity), not invented yield.

Narrative law (codegen + demo): Lead with CADENCE SLOTS (buy a Cadence slot → consume → expire → reject without). Demo copy: buy a Cadence slot → swap → reject without. Never lead with "partially active AMM" or λ/tracking-error jargon. The hook is the venue; the product is the scarce gate slot. Never Dock/Berth/Dockyard-adjacent naming. Privacy is beat #2 only — never open with commit-reveal or “privacy DEX.”

Problem & Target User
Problem
LPs who stand forever in CFMM/CLMM eat LVR / adverse selection when arb drains full depth in one block. Research (PA-AMM) partitions active/passive each block but does not market the scarce capacity as a separate instrument. Status quo for “who gets depth”: gas race / JIT / private RFQ.

Target users
Cadence-slot sellers: LPs / pool deployers who want LVR reduction + capacity revenue.
Cadence-slot buyers: Solvers, arb desks, size traders who need guaranteed fill capacity this epoch.
JTBD (seller)
"Sell epoch Cadence slots so arb cannot drain my full depth for free — and earn on capacity."

JTBD (buyer)
"Buy a Cadence slot so my size fills against active liquidity this epoch — not a gas lottery."

Invention
Object traded: expiring capacity ticket (ERC-1155 per pool/epoch) = right to consume up to size S of that epoch’s active reserves. Passive locked until refresh. Unused Cadence slots expire. Cadence slot ≠ LP share.

Explicit ≠ TAP / Dockyard / Parity
TAP	Dockyard	Parity	Cadence
Object	Take-permit vs named Aqua maker	Fee multi-strategy desk	PeggedSwap desk	Pool-wide epoch capacity tickets
Venue	Aqua Conditional Access	Aqua SwapVM	Aqua PeggedSwap	Uniswap v4 hook / PA pool
Hackathon & Bounty Fit (exactly 3)
#	Partner	Track	Load-bearing
1	Uniswap Foundation	Best Uniswap Stack / v4 hooks	PA-AMM-style hook: active/passive + Cadence-slot gate in beforeSwap
2	The Graph	Composable/Standardized products	Live Studio subgraph: Cadence-slot mint/burn/consume + DEX compose for LVR/markout proxy
3	Hedera	x402 agentic payments	≥1 paid capacity/toxicity intel call that writes Cadence-slot ask UI
ETHGlobal axes (honest): Technicality 8 · Originality 9 · Practicality 8 · Usability 8 · WOW 8 — lead demo with Cadence-slot object + reject path, not “λ jargon.”

Deadline: Sun Sep 13 2026 12:00pm EDT · From Scratch.

Market Validation Summary
Field	Value
Venture Readiness	76/100 · Mixed-leaning-strong
Why now	PA-AMM paper Feb 2026; v4 hooks mature; ETHOnline Uniswap+Graph+Hedera
Biggest risk	Sounds like “another AMM hook” — lead with Cadence slot + reject
Cheapest test	Loom to 8 LPs/solver ops: buy/sell epoch Cadence slots if fail-without-Cadence-slot is real?
Honesty	No finalist guarantee. No invented TAM. No fake APY.
Pillars: demand 8 · timing 8 · competition 8 · customer 7 · GTM 7 · execution 7 · unit econ 7. Idea-pipeline ~7.86. No pillar ≤5.

FACT: LVR is core LP loss; PA-AMM active/passive exists in research; ticket market NOT FOUND as deployed EVM product (search 2026-09-07). INFERENCE: Tokenizing the scarce time-slice is the missing instrument. HYPOTHESIS: Solvers buy Cadence slots ahead of known flow; LPs earn Cadence-slot sales + lower LVR.

vs named families
Family	Cadence difference
CFMM/CLMM/v4 fee hooks	Primary object = expiring capacity, not fee schedule
PA-AMM paper	Markets the capacity right as ERC-1155; paper has no ticket market
TAP	Pool-wide epoch capacity, not counterparty take-option vs Aqua maker
RFQ/HOT	Prices when liquidity may be consumed, onchain
Intent Dutch	Markets capacity supply, not user sell-flow auction
LP tokens	Cadence slot ≠ share of reserves; unused expires worthless
LP Deposit → Capacity → Slot Sale Flow (load-bearing)
Mechanism freeze unchanged. Narrative still leads with Cadence slots (not λ jargon). Privacy + x402 stay.

LP deposit: LP deposits assets into the Cadence pool. Protocol records the LP’s deposited liquidity (share of pool reserves, not an ERC-1155 Cadence slot).
λ + epoch split: Per configured λ and current epochId, protocol determines active vs passive reserves. Active portion = that epoch’s execution-capacity budget. Passive remains locked until the next permitted epoch refresh.
Capacity → Cadence slots: Cadence makes active capacity available as ERC-1155 Cadence Slots at the configured slot price. Traders/solvers buy (public mint or Private Cadence Intent) and later consume against active liquidity only.
Consume: When a trader purchases and consumes a slot, corresponding capacity is deducted from the slot and used against active liquidity only. Unused Cadence capacity expires at end of epoch. Passive cannot be consumed until refresh.
Revenue: Slot-sale proceeds are attributed to the pool / LPs via the protocol’s fee/revenue-sharing mechanism. Normal swap fees stay separate from slot-sale revenue (do not conflate).
LP dashboard (MVP UI): LP can view deposited liquidity, active/passive allocation, available capacity budget, slot sales, earned slot revenue, withdrawable liquidity. Withdraw is constrained by active/passive accounting and protocol safety rules (cannot pull liquidity that would break active capacity already sold this epoch beyond defined safety bounds).
Invariant: Cadence slot ≠ LP share. LP equity is deposit/share accounting; slots are expiring capacity tickets sold against the active budget.

Protocol Constants & Accounting (MVP concrete rules)
No TBD. Numbers below are demo defaults (configurable at deploy). Marked HYPOTHESIS only where product choice is open.

Deploy defaults (one pair)
Param	Default	Notes
lambdaBps	2000 (20%)	Active fraction of eligible liquidity each epoch
epochLengthBlocks	1	Demo: epoch = block; production may use N≥1
slotPrice	0.001 quote-token units per 1 unit capacity notional	Fixed primary ask; x402 intel suggests UI ask, does not auto-change onchain price in MVP
slotRevenueShareBps	10000 (100% to LPs pro-rata by shares)	Protocol take-rate stretch later
swapFeeBps	30 (0.30%)	Separate from slot sales; accrues as normal pool swap fee
hash	keccak256(abi.encode(size, epochId, salt))	Private Cadence Intent commitment
Capacity budget math (each epoch)
eligible = total pool reserves eligible for Cadence split (same units as active/passive)
activeReserve  = eligible * lambdaBps / 10000
passiveReserve = eligible - activeReserve
activeBudget   = activeReserve          // execution-capacity budget this epoch
remainingCapacity = activeBudget - soldCapacity

Mint/commitMint reverts if size > remainingCapacity.
Consume burns slot notional size and reduces remainingCapacity equivalently (already reflected in sold/consumed accounting).
At epoch end: expiredCapacity = remainingCapacity + unconsumed slot balances; slots for prior epochId become non-spendable; soldCapacity resets for new epoch after refresh.
Slot sale revenue
proceeds = size * slotPrice
LP_i.accruedSlotRevenue += proceeds * LP_i.shares / totalShares * slotRevenueShareBps / 10000

Swap fee accrual uses swapFeeBps on swap notional — never mixed into accruedSlotRevenue.

Withdraw safety bounds
// Capacity already sold this epoch is backed by active liquidity.
// LP may not withdraw more than their pro-rata share of (passive + unsold active).
lockedForSold = soldCapacity   // same units as reserves/capacity
safePoolLiquidity = eligible - lockedForSold
withdrawable_i = min(
  LP_i.depositedLiquidity_value,
  LP_i.shares / totalShares * safePoolLiquidity
)

withdraw(shares) reverts if resulting pool state would make eligible < soldCapacity (orphan sold capacity).
HYPOTHESIS (open product choice, not TBD): exact share math uses standard constant-product / v4 liquidity shares for the demo pair — implement with the same share accounting as the chosen Uniswap v4 pool pattern; do not invent a second share token beyond LPPosition.shares.
Epoch transition
Finalize prior epoch: expire unconsumed slots; emit capacity expired.
epochId += 1 (or set from block.number / epochLengthBlocks).
Recompute active/passive from λ; set EpochCapacitySet; soldCapacity = 0; remainingCapacity = activeBudget.
MVP vs Stretch — User Stories
MVP (law)
As a deployer, I launch one pair with one λ, epoch = block (or N-block), active/passive split. 1b. As an LP, I deposit assets; pool records my liquidity; λ + epoch set active/passive; active becomes the Cadence capacity budget sold as ERC-1155 slots. 1c. As an LP, I view deposited liquidity, active/passive allocation, available capacity, slot sales, earned slot revenue, withdrawable liquidity; I withdraw only within active/passive + safety rules. Slot-sale proceeds → LP revenue share; swap fees stay separate.
As a buyer, I mint ERC-1155 Cadence slots for the current epoch only at a fixed primary price — public mint path (demo lead) or Private Cadence Intent path below.
Private Cadence Intent (MVP): commit H = hash(size, epochId, salt) → mint Cadence slot against commitment (size not public on mint) → at beforeSwap reveal (size, salt) → verify hash → consume slot ≥ trade size → swap against active only.
As a trader, beforeSwap requires Cadence slot ≥ size; burns/locks slot; quotes active only.
As a judge, I see reject for: no Cadence slot / oversize / same-block passive unlock attempt.
As a user, Graph panel shows mint/burn/consume plus commit→reveal (live Studio, no mocks). Events: SlotCommitted / SlotRevealed — not private forever.
As a user, I complete ≥1 Hedera x402 paid intel call that writes the Cadence-slot ask (unchanged).
Demo ≤4 min; beat #1 = buy → swap → reject without; privacy beat #2 ≤30s (commitment-only mint then reveal-on-consume); multi-commit git.
Stretch (only if MVP green by Thu Sep 11)
Secondary Cadence-slot transfer / mini-CLOB
Multi-pool router
Richer LVR tracking panel
Dynamic Cadence-slot pricing from intel
Stealth/ephemeral payer (optional); CRE TEE confidential ask (ITERATE only if privacy bounty partner required)
Forbidden
TAP / Dockyard / Parity · secondary CLOB in MVP · Aqua Conditional Access story · fake APY · verify / World/KYC as privacy · games · markout insurance · privacy sticker (toggle with no commitment object) · Veil sealed-fill / dark swap of the AMM trade · Aztec / Railgun as partners · drop Hedera x402 · forever-private Graph mints · Escapement/PULSE confusion

Non-Functionals
NFR	Requirement
Invariant	Passive cannot unlock via same-block order splitting
Cadence-slot honesty	Unused Cadence slots expire; Cadence slot ≠ LP equity
Demo clarity	Copy leads with “Cadence slot for this epoch/block”
Graph	Live Studio data only
UI	Near-black, one accent, serif + mono; no purple SaaS
Narrative	Beat #1: Buy Cadence slot → swap → fail without / succeed with. Privacy = beat #2 only
Privacy	Commit-reveal on capacity intent only — not private AMM fill
Commits	Multi-commit history
Deadline	Sun Sep 13 2026 12:00pm EDT
Accounting	Slot revenue ≠ swap fees; withdraw cannot orphan sold capacity
Completeness	Function Inventory matrix rows all MVP = implemented
Architecture and Stack
LP deposit → pool liquidity recorded
        |
Uniswap v4 Pool + Cadence Hook
  λ + epochId → active / passive split
  active = execution-capacity budget this epoch
  passive locked until refresh
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
  Slot-sale proceeds → LP revenue share (≠ swap fees)
  LP dashboard: deposit / active-passive / capacity / sales / revenue / withdraw

Stack (LOCKED — Next.js App Router; product rename Cadence 2026-09-07)
Layer	Choice
App	Next.js (App Router) + TypeScript + Tailwind — NOT Vite
Backend	Next.js Route Handlers under app/api/**/route.ts (Graph proxy, Hedera x402 intel, server-only secrets)
Client	wagmi/viem in app/ pages
Contracts	Solidity v4 hook + ERC-1155 Cadence slots; Foundry tests
Chain	One EVM + Anvil fork for demo fills
Graph	Subgraph Studio live (proxied via Route Handlers)
Intel	Route Handler + Blocky402 on Hedera testnet
Host	Vercel
Mechanism freeze unchanged. Stack choice is locked — do not scaffold Vite.

Data Model
PoolConfig
currency0, currency1, hooks, lambdaBps, epochLengthBlocks, epochId, activeReserve, passiveReserve, slotPrice, slotRevenueShareBps, swapFeeBps, totalShares.

LPPosition
lp, poolId, deposited0, deposited1 (or single depositedLiquidity for demo pair), shares, accruedSlotRevenue, accruedSwapFees (separate), withdrawableLiquidity (view; computed).

EpochCapacityBudget
epochId, activeBudget, soldCapacity, consumedCapacity, remainingCapacity, expiredCapacity.

CadenceSlotToken (ERC-1155)
id = uint256(epochId) (or poolId||epochId packed); balance = capacity notional. Commitment-backed mints hold pending size until reveal.

CadenceCommitment
epochId, H (bytes32), payer, pricePaid, sizeCommitted (private until reveal), ts, status = Committed | Revealed | Expired.

CadenceMint / CadenceConsume
Mint: buyer, epochId, size (null until reveal if private), commitmentH, pricePaid, ts.
Consume: trader, epochId, sizeBurned, swapTx, ts, revealedFromCommitment.

IntelQuote (x402)
asOf, pair, suggestedAsk, toxicityScore, rationale, paymentReceipt.

Events (all indexed for Graph)
LPDeposited(lp, amounts, shares) · LPWithdrawn(lp, amounts, shares) · EpochCapacitySet(epochId, activeBudget, passiveReserve) · SlotSold(buyer, epochId, size, pricePaid) · SlotCommitted(epochId, H, payer) · SlotRevealed(epochId, size, slotId) · SlotConsumed(...) · SwapRejected(reason) · SlotRevenueAccrued(epochId, proceeds) · CapacityExpired(epochId, amount).

API / Program Spec
A0. LP deposit / withdraw
deposit(assets) — credit LPPosition; increase pool reserves.
On deposit or epoch boundary: recompute active/passive from λ and eligible liquidity; set EpochCapacityBudget.activeBudget.
withdraw(shares) — allowed only up to withdrawableLiquidity under safety rules (must not orphan sold active capacity beyond protocol bounds). Revert if unsafe.
Accrue slotRevenue to LPs per slotRevenueShareBps when slots are sold; swap fees accounted separately.
A. Epoch refresh
On new epoch: unlock/refresh active = λ * total eligible; set capacity budget from active; expire prior Cadence slots / unused capacity; roll LP accounting.

B. Primary mint (public path — demo lead)
Pay configured slot price → mint ERC-1155 Cadence slots against remaining active capacity budget for current epoch only (size visible). Proceeds → SlotRevenueAccrued to pool/LPs.

B2. Private Cadence Intent — commitMint(H)
Buyer computes H = hash(size, epochId, salt) offchain (or client).
Pay fixed price → mint against commitment H (size not in public mint payload).
Emit SlotCommitted(epochId, H, payer?).
C. beforeSwap (hook) — public or reveal path
Private path: revealAndConsume(size, salt) — verify hash(size, epochId, salt) == H; emit SlotRevealed(epochId, size, slotId); then consume.
Require msg.sender (or router payer) holds Cadence slot ≥ trade size.
Burn/lock Cadence-slot notional.
Execute against active reserves only.
Revert if no Cadence slot, bad reveal, oversize vs active, or attempt to reach passive same block.
D. Reject demos (must work)
Swap without Cadence slot → revert
Swap size > Cadence slot → revert
Same-block split trying to unlock passive → revert
Reveal with wrong salt/size → revert
E. Graph (Studio live — no mocks)
Index and show in UI panel:

LPDeposited / LPWithdrawn / SlotRevenueAccrued
EpochCapacitySet / SlotSold / SlotConsumed / CapacityExpired
SlotCommitted → SlotRevealed (not forever private)
SwapRejected reasons (no slot / oversize / passive unlock / bad reveal) Compose with standardized DEX subgraph for simple LVR/markout proxy if available.
F. Hedera x402
Route Handler calls Blocky402 facilitator on Hedera testnet.
Buyer pays ≥1 call; server returns IntelQuote.suggestedAsk.
UI writes suggested ask into Cadence-slot ask field (display). MVP: onchain slotPrice stays deploy default unless deployer updates — intel does not silently mutate pool config.
Do not drop x402.
G. Reject reason codes (must surface in UI + events)
Code	Meaning
NO_SLOT	No Cadence slot balance for epoch
OVERSIZE	Trade size > slot balance or > remainingCapacity / active
PASSIVE_UNLOCK	Same-block attempt to reach passive
BAD_REVEAL	hash(size,epochId,salt) ≠ H
UNSAFE_WITHDRAW	Withdraw would orphan sold capacity
EPOCH_EXPIRED	Slot id not current epoch
UX Flow
Visual system
Near-black, one accent (mint or amber — pick one), serif titles, mono for sizes/epoch/Cadence-slot balances. No purple SaaS. Layout: LP Deposit / Dashboard | Buy Cadence slot | Swap | Reject log | Graph panel | Pay intel | Private intent (committed) secondary panel.

LP path (load-bearing — show in app; demo may keep slot gate as beat #1)
LP deposits assets → see deposited liquidity.
View active/passive allocation + available capacity budget for epoch (λ explained in one short line, not the headline).
After slot sales: view slot sales, earned slot revenue (≠ swap fees), withdrawable liquidity.
Withdraw respects active/passive + safety rules (demo a blocked unsafe withdraw if easy).
Critical path (beat #1 — always first for judges)
Landing: “Buy a Cadence slot for this epoch.”
Buy Cadence slot (fixed price) — public path (capacity comes from LP active budget).
Swap succeeds with Cadence slot.
Same swap fails without Cadence slot (side-by-side or sequential).
Graph updates mint/consume (+ LP deposit / revenue if indexed).
x402 intel updates ask.
Privacy beat #2 (≤30s — never open with this)
Toggle / panel: Private Cadence Intent.
Commit-mint: explorer shows commitment H only (no size).
Swap with reveal: size appears at consume; Graph shows SlotCommitted → SlotRevealed.
One line: “We hid capacity intent until fill — not a dark AMM.”
Copy rules
Say Cadence slot / capacity ticket — not “guaranteed APY.”
Named risk: unused Cadence slots expire; active depth is capped.
Explicit ≠ TAP (not Aqua take-permit). Product name Cadence (not SEAT / Apron).
Never lead with “privacy DEX,” commit-reveal, or Veil/sealed-fill language.
Success Metrics
ETHOnline DoD
One pair, one λ, epoch Cadence slots ERC-1155
LP deposit → λ active/passive → capacity budget → slot sale → LP revenue/withdraw UI
Fixed-price primary mint (public + commitMint path)
Private Cadence Intent: commit → mint → reveal in beforeSwap → consume
beforeSwap Cadence-slot gate + active-only + reject paths
Graph mint/burn/consume + SlotCommitted/SlotRevealed live
≥1 Hedera x402 paid intel → Cadence-slot ask (kept)
Demo ≤4 min with privacy ≤30s second; multi-commit repo
Submit before Sun Sep 13 2026 12:00pm EDT
Startup hypotheses
8 LP/solver Looms; ≥3 would buy or sell Cadence slots
Take-rate on Cadence-slot premium post-hackathon
Axes: T8 O9 P8 U8 W8

Demo Script (≤4 min)
Beat	Judges see
Hook (#1)	Swap without Cadence slot fails on camera
Product	Cadence = scarce epoch execution capacity (gate slots)
LP (optional ≤20s)	Deposit → see active capacity budget → slot sales feed LP revenue
Buy	Mint ERC-1155 Cadence slot
Success	Same size swap succeeds after buying Cadence slot
Invariant	Same-block split cannot unlock passive
Privacy (#2 ≤30s)	Commitment-only mint → reveal-on-consume; contrast public size leak
Graph	Mint/consume + SlotCommitted → SlotRevealed
x402	Paid intel writes Cadence-slot ask
Close	≠ TAP; ≠ privacy sticker; Uni+Graph+Hedera load-bearing; named risk
Launch and First-Customer Plan
1–3 Uniswap/v4 LP operators who hate arb LVR 4–5 Solver / arb desks needing epoch depth 6 ETHOnline AMM-background teammate 7 Graph subgraph collab 8 Hedera x402 bounty hunter 9 One DAO treasury LP 10 Uniswap Discord / office hours

Monetization: take-rate on Cadence-slot premium + tiny active swap fee. Not APY.

Risks
Risk	Mitigation
“Another AMM hook”	Lead Cadence-slot object + reject path
Confused with TAP	Explicit ≠ Aqua take-permit
Usability jargon	Copy = “Cadence slot for this block”
Week clock	One pair, fixed price, no CLOB
PA-AMM complexity	Minimal λ + active/passive only
Privacy buries Cadence story	Reject path = beat #1; privacy ≤30s second
Looks like Veil/dark DEX	Commit-reveal on capacity intent only; swap stays public
Build Roadmap
Mon Sep 7 → Sun Sep 13 12:00pm EDT.

Day 0–1: Hook scaffold + active/passive + LP deposit accounting + Foundry reject tests. Day 2: ERC-1155 Cadence slots + capacity budget mint + beforeSwap burn + slot revenue to LPs. Day 3: Demo reject/success paths solid; epoch refresh; commitMint + revealAndConsume. Day 4: Graph mint/burn/consume + SlotCommitted/SlotRevealed panel live. Day 5: x402 intel → Cadence-slot ask UI; privacy beat polish. Day 6: Demo video + README ≠ TAP; submit.

Hard cut: never drop Cadence-slot gate, reject demos, Graph, or x402. Cut secondary market and multi-pool first. If clock fails on commit-reveal, ship public-mint Cadence first (base PASS); privacy is additive.

Function Inventory (completeness matrix)
Every MVP function must appear in User story + Data model + API + UX + Codegen. Stretch is listed as out-of-MVP.

Function	Story	Data	API	UX	Codegen
Deploy one pair + λ + epoch	MVP 1	PoolConfig	constructor/init	Deploy/readme	contracts
LP deposit	MVP 1b	LPPosition	deposit	LP Deposit	contracts + app
λ active/passive + capacity budget	MVP 1b	EpochCapacityBudget	epoch refresh / on deposit	LP Dashboard	contracts
ERC-1155 slot public mint	MVP 2	CadenceSlotToken	primary mint	Buy Cadence slot	contracts + app
Private Cadence Intent commit/reveal	MVP 3	CadenceCommitment	commitMint / revealAndConsume	Private intent panel	contracts + app
beforeSwap gate + active-only	MVP 4	—	hook C	Swap	contracts
Reject: no slot / oversize / passive / bad reveal	MVP 5	SwapRejected	revert codes	Reject log	contracts + app
Slot expire EOE	MVP / LP flow	CapacityExpired	epoch refresh	Dashboard	contracts
Slot-sale revenue ≠ swap fees	MVP 1c	accruedSlotRevenue vs accruedSwapFees	SlotRevenueAccrued	LP Dashboard	contracts + app
LP withdraw safety	MVP 1c	withdrawableLiquidity	withdraw	LP Withdraw	contracts + app
Graph indexing	MVP 6	events	subgraph	Graph panel	subgraph + Route Handlers
Hedera x402 intel → ask UI	MVP 7	IntelQuote	Route Handler	Pay intel	app/api
Demo ≤4 min + multi-commit	MVP 8	—	—	Demo script	git hygiene
Intentionally out of MVP (do not build unless stretch unlocked)
Secondary Cadence-slot CLOB · multi-pool router · dynamic onchain price from x402 · CRE TEE confidential ask · stealth wallets · Aztec/Railgun · World/KYC · Escapement/LATCH features · fake APY · Dock/Berth naming.

Build Instructions for Codegen Agent
Imperative. Follow exactly.

Scaffold a Next.js App Router app named cadence with TypeScript + Tailwind. Do not use Vite.
Near-black UI, one accent, serif and mono. No purple SaaS.
Foundry project under contracts/ for Uniswap v4 hook + ERC-1155 Cadence slots; one pair; one lambda; epoch = block or N-block. 3b. Implement LP Deposit → Capacity → Slot Sale Flow: deposit, λ active/passive split, EpochCapacityBudget, slot mint against remaining budget, slot-sale revenue to LPs (separate from swap fees), withdraw with safety constraints, LP dashboard fields.
Implement active/passive split; beforeSwap requires Cadence slot >= size, burns/locks, quotes active only.
Reject paths: no Cadence slot, oversize, same-block passive unlock, bad reveal, unsafe LP withdraw.
Fixed-price primary mint for current-epoch Cadence slots only (public path) against active capacity budget. 6b. Private Cadence Intent: commitMint(H) where H=hash(size,epochId,salt); revealAndConsume(size,salt) in beforeSwap; emit SlotCommitted / SlotRevealed.
Graph live Studio panel for mint/burn/consume + commit→reveal — fetch via Route Handlers (app/api/**/route.ts), never expose studio keys in the client. Not forever-private.
Hedera x402 paid intel writes Cadence-slot ask via Route Handlers + Blocky402; at least one paid call in demo; secrets stay server-side. Do not drop x402.
Client: wagmi/viem in app/ pages for wallet + contract calls. UI: LP Deposit/Dashboard + primary Buy→Swap→Reject; secondary Private intent panel.
README: invention brief, not TAP/Dockyard/Parity, bounty map, demo script (privacy beat #2), named risks. Rename law: Cadence.
Multi-commit history (minimum): chore: scaffold next+foundry → feat: pool+lp deposit+lambda split → feat: erc1155 slots+mint → feat: beforeSwap gate+rejects → feat: commit-reveal privacy → feat: graph+x402 → feat: lp dashboard+withdraw safety → docs: demo+readme.
Follow Uniswap v4 hook docs. Do not invent PoolManager semantics. Host on Vercel. Next.js App Router stack lock unchanged. Escapement / LATCH out of scope.
App routes (MVP pages): / (landing beat #1) · /lp (deposit/dashboard/withdraw) · /buy (public mint) · /swap · /privacy (commit intent) · /graph · /intel (x402). Reject log can be panel on /swap.
Suggested layout (single Next app — UI + API colocated):

apps/web/                 # Next.js App Router
  app/                    # UI pages/layouts (/, /lp, /buy, /swap, /privacy, /graph, /intel)
  app/api/graph/route.ts
  app/api/x402/quote/route.ts
  lib/graph/
  lib/x402/
  lib/cadence/            # ABI + epoch/capacity helpers
contracts/                # Foundry: Hook, CadenceSlot1155, tests
subgraph/                 # Studio subgraph
scripts/demo/
README.md
agent.md                  # this file

References
/workspace/ideation/ethonline2026-validator-packet-newtrade-v2.md
/workspace/ideation/ethonline2026-validator-packet-cadence-privacy.md
/workspace/ideation/research-cadence-privacy.md
https://arxiv.org/html/2602.09887
https://arxiv.org/html/2208.06046
https://ethglobal.com/events/ethonline2026/prizes/uniswap-foundation
https://ethglobal.com/events/ethonline2026/prizes/the-graph
https://ethglobal.com/events/ethonline2026/prizes/hedera
https://ethglobal.com/events/ethonline2026/info/details
Spec freeze acknowledgement
Matches COS PASS:

Product Cadence — scarce per-epoch execution capacity (formerly SEAT / Apron) (ERC-1155) vs PA-AMM-style active/passive pool
VR 76/100; ETHGlobal T8/O9/P8/U8/W8
MVP: one pair, one lambda, LP deposit→capacity→slot sale→LP revenue/withdraw, epoch Cadence slots, fixed-price mint, Private Cadence Intent (commit→reveal), beforeSwap Cadence-slot gate, reject paths, Graph commit/reveal panel, x402 intel, demo <=4 min (privacy #2 <=30s), multi-commit
Bounties: Uniswap v4 hook, Graph, Hedera x402
Forbidden: TAP/Dockyard/Parity, secondary CLOB, Aqua, fake APY, privacy sticker, Veil sealed-fill, Aztec/Railgun, drop x402, World/KYC privacy
Demo lead: Cadence-slot object + reject path; privacy second
Explicit not TAP; Escapement/LATCH untouched
Protocol constants + Function Inventory completeness pass 2026-09-09
Deadline: Sun Sep 13 2026 12:00pm EDT
Honesty: no “world’s best” language