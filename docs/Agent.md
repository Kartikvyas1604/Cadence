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
slotRevenueShareBps	9000 (90% to LPs pro-rata)	Remainder = protocol take
protocolTakeBps	1000 (10%)	Protocol treasury share of slot proceeds; slotRevenueShareBps + protocolTakeBps = 10000
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
protocolCut = proceeds * protocolTakeBps / 10000
lpPool = proceeds - protocolCut   // == proceeds * slotRevenueShareBps / 10000
LP_i.accruedSlotRevenue += lpPool * LP_i.shares / totalShares

Swap fee accrual uses swapFeeBps on swap notional — never mixed into accruedSlotRevenue or protocol take. Dynamic price (MVP): slotPrice may be updated onchain from x402 suggestedAsk via setSlotPriceFromIntel(ask, attestation) within [slotPriceMin, slotPriceMax] bounds (defaults: 50%–200% of deploy slotPrice).

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
MVP User Stories (complete — no stretch withhold)
MVP (law)
As a deployer, I launch one pair with one λ, epoch = block (or N-block), active/passive split. 1b. As an LP, I deposit assets; pool records my liquidity; λ + epoch set active/passive; active becomes the Cadence capacity budget sold as ERC-1155 slots. 1c. As an LP, I view deposited liquidity, active/passive allocation, available capacity, slot sales, earned slot revenue, withdrawable liquidity; I withdraw only within active/passive + safety rules. Slot-sale proceeds → LP revenue share; swap fees stay separate.
As a buyer, I mint ERC-1155 Cadence slots for the current epoch only at a fixed primary price — public mint path (demo lead) or Private Cadence Intent path below.
Private Cadence Intent (MVP): commit H = hash(size, epochId, salt) → mint Cadence slot against commitment (size not public on mint) → at beforeSwap reveal (size, salt) → verify hash → consume slot ≥ trade size → swap against active only.
As a trader, beforeSwap requires Cadence slot ≥ size; burns/locks slot; quotes active only.
As a judge, I see reject for: no Cadence slot / oversize / same-block passive unlock attempt.
As a user, Graph panel shows mint/burn/consume plus commit→reveal (live Studio, no mocks). Events: SlotCommitted / SlotRevealed — not private forever.
As a user, I complete ≥1 Hedera x402 paid intel call that writes the Cadence-slot ask (unchanged).
Demo ≤4 min; beat #1 = buy → swap → reject without; privacy beat #2 ≤30s (commitment-only mint then reveal-on-consume); multi-commit git.
MVP (continued) — formerly stretch; now required
As a trader, I trade Cadence slots on a secondary CLOB (limit buy/sell of ERC-1155 epoch slots) after primary mint.
As a trader, I use a multi-pool router to buy capacity / swap across registered Cadence pools.
As an LP/judge, I see a rich LVR / markout tracking panel (Graph-composed).
As a deployer/oracle path, dynamic onchain slotPrice updates from x402 intel (with bounds).
As a buyer, I may mint via stealth / ephemeral payer wallet (one-shot address).
As a desk, I may run Chainlink CRE TEE confidential ask (toxicity model private; public ask + attestation).
As a privacy user, I may shield funds / notes via Aztec or Railgun path before paying for slots (does not darken the AMM swap itself).
Protocol accrues a configurable take-rate on slot sales (protocolTakeBps); remainder to LPs.
Forbidden (NOT product features — do not build / do not brand)
Fake APY / invented yield claims / world’s-best language / invented TAM
Dock / Berth / Dockyard / kitchen / Apron branding
World ID / KYC / verify-as-privacy story
Escapement merge · LATCH merge · PULSE confusion
Veil-class sealed-fill / dark swap of the AMM trade (breaks reject-without-slot WOW)
Privacy sticker (toggle with no commitment / no real privacy object)
Dropping Hedera x402
Forever-private Graph (must index commit→reveal and capacity supply)
Claiming to be TAP / Aqua Conditional Access / Dockyard / Parity
Extended Cadence Capabilities (MVP — full detail)
All items below are required MVP. Each is wired: Story · Data · API · UX · Codegen.

1. Secondary Cadence-slot CLOB
Story: After primary mint, holders post limit orders to buy/sell ERC-1155 slots for the current epochId; matching transfers slots + quote token escrow.
Data: ClobOrder{ id, maker, side, epochId, size, price, filled, status }; ClobTrade{ buyOrder, sellOrder, size, price, ts }.
API: placeOrder(side, epochId, size, price) · cancelOrder(id) · match (batch or hook-triggered) · settle ERC-1155 + proceeds. Cancel/expire all open orders on epoch refresh.
UX: /clob — order book for current epoch, place/cancel, my orders, fills. Copy: “Trade Cadence slots — capacity tickets, not LP shares.”
Codegen: contracts/Clob.sol + app/clob/page.tsx; Graph entities ClobOrder/ClobTrade; Foundry match tests.
2. Multi-pool router
Story: User selects size/epoch intent; router finds registered Cadence pools, compares remaining capacity + slotPrice, mints/buys slot and routes swap.
Data: PoolRegistry{ poolId, pair, hooks, active }; RouteQuote{ poolId, slotCost, expectedActiveFill, path }.
API: registerPool(pool) · quote(size, tokenIn, tokenOut) · execute(routeId) (mint/buy slot if needed + swap).
UX: /router — quote comparison table + one-click execute.
Codegen: contracts/CadenceRouter.sol + registry; UI page; never silent cross-pool without showing poolId.
3. Rich LVR / markout panel
Story: LP and judges see estimated LVR reduction / markout proxy vs unprotected CFMM using Graph DEX compose + Cadence consume events.
Data: LvrSample{ poolId, epochId, markoutBps, volumeActive, ts } (computed offchain indexer or subgraph mapping).
API: Route Handler GET /api/lvr?poolId= aggregating Graph.
UX: /lp and /graph panels — charts for epoch markout, capacity sold vs budget.
Codegen: app/api/lvr/route.ts + chart component; document FACT vs HYPOTHESIS on proxy quality.
4. Dynamic onchain slot price from x402
Story: Paid intel returns suggestedAsk; keeper/deployer/permissioned role pushes onchain update inside bounds.
Data: slotPrice, slotPriceMin, slotPriceMax, lastIntelAsk, lastIntelTs, intelAttestationHash.
API: setSlotPriceFromIntel(ask, receiptHash) — requires recent x402 payment proof; reverts outside bounds; emits SlotPriceUpdated.
UX: /intel shows suggested vs onchain price + “Apply ask” (authorized).
Codegen: extend PoolConfig + x402 Route Handler to call contract after pay.
5. Stealth / ephemeral payer wallets
Story: Buyer generates one-shot wallet (Privy or local ephemeral key), funds it, mints slot / pays x402, optionally sweeps remainder.
Data: StealthSession{ ephemeralAddress, createdAt, linkedCommitmentH? }.
API: client SDK createEphemeral() · fund · commitMint/mint from ephemeral · optional sweep(to).
UX: /privacy toggle “Mint from stealth wallet”; show address + fund instructions.
Codegen: lib/stealth/ + Privy or viem account abstraction; never require World/KYC.
6. Chainlink CRE TEE confidential ask
Story: Toxicity/capacity model runs in CRE Confidential Workflow; only public ask + attestation hits Cadence; x402 still pays for the request.
Data: ConfidentialAsk{ ask, attestation, workflowId, asOf } replacing or wrapping IntelQuote when CRE path enabled.
API: Route Handler invokes CRE workflow with private inputs; returns ask+attestation; feeds setSlotPriceFromIntel or UI.
UX: /intel mode “Confidential ask (CRE)” vs “Public x402 model”.
Codegen: app/api/x402/cre-ask/route.ts; document CRE secrets in server env; keep Uni+Graph+Hedera as primary bounty map (CRE is capability, not a 4th forced prize swap unless Kartik chooses).
7. Aztec / Railgun privacy path (funds — not dark AMM)
Status: **DEFERRED** (qa-3, Pass-2 — product sign-off required to re-open). The
adapters (`lib/shield/adapter.ts`, `lib/aztec`, `lib/railgun`) throw
`NotWired` and never fake a transaction; /privacy states the adapter is not
wired. A real integration needs @aztec/aztec.js or @railgun-community/quickstart
plus proof/viewing-key setup and a funded testnet wallet — wire it with a
skip-when-unset smoke, or keep this deferred. README/UI must not imply a
working shield path while NotWired.
Story: User shields assets in Railgun/Aztec, then unshields/pays into Cadence mint or stealth funder. Cadence swap + reject path stay public.
Data: ShieldBridgeTx{ protocol: Aztec|Railgun, inTx, outTx, amount }.
API: integration adapters shield() / unshieldTo(ephemeral) — offchain SDK + documented tx flow.
UX: /privacy steps: Shield → Fund Cadence → Commit/Mint. Explicit copy: “Shields funds, not the swap.”
Codegen: lib/railgun/ and/or lib/aztec/ adapters; do not implement Veil sealed-fill of beforeSwap.
8. Protocol take-rate on slot sales
Story: Treasury receives protocolTakeBps of each SlotSold; LPs receive the rest; both visible on dashboard.
Data: protocolTreasury, protocolTakeBps, accruedProtocolRevenue.
API: on SlotSold split proceeds; withdrawProtocolRevenue(to) (owner).
UX: LP dashboard shows LP revenue vs protocol cut; /admin treasury view.
Codegen: update mint/CLOB settle accounting; Foundry tests for 90/10 split defaults.
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
Schedule risk	Full MVP surface (CLOB+router+CRE+Aztec/Railgun+stealth+dynamic price+LVR) likely exceeds Sun Sep 13 12:00pm EDT solo clock — ship core LP→slots→reject→privacy→x402→Graph first for demo, but all Extended Capabilities remain in-repo MVP acceptance (no intentional withhold). Parallelize or extend submit strategy honestly.
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
  Extended MVP: CLOB · multi-pool router · dynamic slotPrice · LVR panel ·
                stealth payer · CRE confidential ask · Aztec/Railgun fund path · protocol take

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

IntelQuote (x402) / ConfidentialAsk (CRE)
asOf, pair, suggestedAsk, toxicityScore, rationale, paymentReceipt, optional attestation, workflowId.

ClobOrder / ClobTrade / PoolRegistry / RouteQuote / StealthSession / ShieldBridgeTx / ProtocolTreasury
As specified in Extended Cadence Capabilities §§1–8.

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
H. Secondary CLOB
placeOrder / cancelOrder / match / epoch-cancel — see Extended §1.

I. Multi-pool router
registerPool / quote / execute — see Extended §2.

J. Dynamic slot price
setSlotPriceFromIntel(ask, receiptHash) within min/max — see Extended §4.

K. Stealth / CRE / Aztec-Railgun / protocol take
See Extended §§5–8.

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
Near-black, one accent (mint or amber — pick one), serif titles, mono for sizes/epoch/Cadence-slot balances. No purple SaaS. Layout: LP | Buy | Swap | CLOB | Router | Reject log | Graph/LVR | Intel (x402 + CRE) | Privacy (commit + stealth + Aztec/Railgun) | Admin (protocol take).

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
Secondary CLOB + multi-pool router + LVR panel + dynamic slotPrice + stealth + CRE ask + Aztec/Railgun fund path + protocol take-rate (all in MVP DoD)
Submit before Sun Sep 13 2026 12:00pm EDT (schedule risk: parallelize; do not delete features from spec)
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
Deadline: Sun Sep 13 2026 12:00pm EDT (ETHOnline From Scratch).

Schedule risk (honest): Full MVP (core + CLOB + router + CRE + Aztec/Railgun + stealth + dynamic price + LVR + take-rate) is larger than a typical solo week. Do not delete features from this agent.md. Parallelize workstreams; if demo day arrives early, demo core LP→slots→reject→privacy→x402→Graph, while remaining MVP modules stay in-repo and in DoD as incomplete-but-required until done.

Wave	Ship
W0	Next+Foundry scaffold; PoolConfig; LP deposit; λ split; capacity budget
W1	ERC-1155 mint; beforeSwap gate; rejects; slot revenue + protocol take
W2	Private Cadence Intent; Graph; x402 intel; LP dashboard/withdraw
W3	Dynamic slotPrice; LVR panel; stealth payer
W4	Secondary CLOB; multi-pool router
W5	CRE confidential ask; Aztec/Railgun fund path; Admin treasury
W6	Demo video; polish; submit
Never drop: Cadence-slot gate, reject demos, Graph visibility, x402. Never “cut to stretch” — there is no stretch bucket.

Function Inventory (completeness matrix)
Every Cadence function is MVP. Each row must be implemented (Story + Data + API + UX + Codegen). There is no out-of-MVP / stretch withhold list.

Function	Story	Data	API	UX	Codegen
Deploy pair + λ + epoch	1	PoolConfig	init	readme	contracts
LP deposit	1b	LPPosition	deposit	/lp	contracts+app
λ split + capacity budget	1b	EpochCapacityBudget	refresh	/lp	contracts
Public ERC-1155 mint	2	CadenceSlotToken	mint	/buy	contracts+app
Private Cadence Intent	3	CadenceCommitment	commit/reveal	/privacy	contracts+app
beforeSwap gate active-only	4	—	hook	/swap	contracts
Reject paths + codes	5	SwapRejected	reverts	Reject log	contracts+app
Slot expire EOE	LP flow	CapacityExpired	refresh	/lp	contracts
Slot revenue ≠ swap fees	1c	accrued*	SlotRevenueAccrued	/lp	contracts+app
LP withdraw safety	1c	withdrawable	withdraw	/lp	contracts+app
Graph indexing	6	events	subgraph	/graph	subgraph+api
Hedera x402 intel	7	IntelQuote	/api/x402	/intel	app/api
Secondary slot CLOB	9	ClobOrder/Trade	place/match	/clob	Clob.sol+app
Multi-pool router	10	PoolRegistry	quote/execute	/router	Router.sol+app
LVR/markout panel	11	LvrSample	/api/lvr	/graph /lp	api+charts
Dynamic slotPrice from x402	12	slotPrice*	setSlotPriceFromIntel	/intel	contracts+api
Stealth/ephemeral payer	13	StealthSession	createEphemeral	/privacy	lib/stealth
CRE TEE confidential ask	14	ConfidentialAsk	/api/x402/cre-ask	/intel	CRE+api
Aztec/Railgun fund path	15	ShieldBridgeTx	shield/unshield	/privacy	lib adapters
Protocol take-rate	16	protocolTreasury	split + withdraw	/admin /lp	contracts
Demo + multi-commit	8	—	—	Demo script	git
Not in inventory (Forbidden — never implement as Cadence): fake APY, Dock/Berth/Apron branding, World/KYC privacy, Escapement/LATCH merge, Veil sealed-fill AMM swap, privacy sticker, forever-private Graph, drop x402.

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
Follow Uniswap v4 hook docs. Do not invent PoolManager semantics. Host on Vercel. Next.js App Router stack lock unchanged. Escapement / LATCH are Forbidden merges (not Cadence modules).
App routes: / · /lp · /buy · /swap · /clob · /router · /privacy · /graph · /intel · /admin. Reject log on /swap.
Implement Extended Capabilities §§1–8 fully (CLOB, router, LVR, dynamic price, stealth, CRE, Aztec/Railgun fund path, protocol take).
Do not create an “out-of-MVP” folder or skip list. Forbidden items stay unimplemented.
Suggested layout (single Next app — UI + API colocated):

apps/web/                 # Next.js App Router
  app/                    # /, /lp, /buy, /swap, /clob, /router, /privacy, /graph, /intel, /admin
  app/api/graph/route.ts
  app/api/lvr/route.ts
  app/api/x402/quote/route.ts
  app/api/x402/cre-ask/route.ts
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
MVP (complete, no stretch withhold): core LP→slots→reject→privacy→Graph→x402 PLUS secondary CLOB, multi-pool router, LVR panel, dynamic slotPrice, stealth payer, CRE confidential ask, Aztec/Railgun fund path, protocol take-rate
Bounties: Uniswap v4 hook, Graph, Hedera x402
Forbidden: fake APY, Dock/Berth/Apron branding, World/KYC, Escapement/LATCH merge, Veil sealed-fill AMM, privacy sticker, forever-private Graph, drop x402, world’s-best/invented TAM (Aztec/Railgun fund path is MVP; sealed-fill AMM is not)
Demo lead: Cadence-slot object + reject path; privacy second
Explicit not TAP; Escapement/LATCH untouched
Protocol constants + Function Inventory completeness pass 2026-09-09; zero out-of-MVP withhold pass 2026-09-09
Deadline: Sun Sep 13 2026 12:00pm EDT
Honesty: no “world’s best” language