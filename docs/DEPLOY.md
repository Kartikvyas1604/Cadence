# Deployment Runbook — Cadence

Deadline context: ETHOnline 2026 submission (Sun Sep 13 2026 12:00pm EDT).
Everything below is runnable; the two steps marked **[needs key]** require
credentials only the team can provide.

## 0. Prereqs

```bash
npm install
# Foundry: https://book.getfoundry.sh
forge --version
```

## 1. Contracts — Sepolia

```bash
cd contracts
cp ../.env.example .env   # then edit .env
# [needs key] PRIVATE_KEY=<cast wallet new> — fund with ~0.5 Sepolia ETH
#             (faucets: alchemy.sepolia.faucet, poap faucet, quicknode)
export PRIVATE_KEY=...
forge script script/DeployCadence.s.sol \
  --rpc-url $SEPOLIA_RPC_URL --broadcast --slow --verify --verifier etherscan \
  --etherscan-api-key $ETHERSCAN_KEY    # verification optional
cat deployments/11155111.json
cp deployments/11155111.json ../public/deployments/
```

The script mines the hook address for the `beforeSwap | beforeSwapReturnDelta`
permission flags (CREATE2, deterministic), wires slots↔hook, initializes the
ETH/USDC pool and seeds λ-partitioned reserves.

## 2. Local Anvil (demo fallback / development)

```bash
cd contracts
anvil                       # predeploys the CREATE2 deployer
export PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
forge script script/DeployCadence.s.sol --rpc-url http://localhost:8545 --broadcast --slow
cp deployments/31337.json ../public/deployments/
```

Smoke (same epoch — epoch length is 12 blocks):

```bash
# buy slot, swap with slot, swap without slot (reverts NoCadenceSlot),
# commitMint(H) + sellEthPrivate (reveal path) — see README "Run it locally"
```

## 3. The Graph — Studio **[needs key]**

1. Create a subgraph at <https://thegraph.com/studio> (build folder: `subgraph/`).
2. `graph auth <STUDIO_DEPLOY_KEY>`
3. Point `subgraph/subgraph.yaml` at the deployed `slots` + `hook` addresses
   (step 1), set `network` + `startBlock: <seedBlock>`.
4. `cd subgraph && npm i && graph codegen && graph build && graph deploy --studio cadence`
5. Set app env: `GRAPH_ENDPOINT=<studio query url>`, `GRAPH_API_KEY=<key>`.

## 4. Hedera x402 intel **[needs key]**

Paid capacity/toxicity intel through Blocky402 (x402 v2, `@x402/hedera`):

- `X402_INTEL_URL` — a protected resource endpoint that returns
  `{ "suggestedAskPerEth": <number>, "rationale": "...", "source": "..." }`
- `HEDERA_ACCOUNT_ID`, `HEDERA_PRIVATE_KEY` (ECDSA, testnet), `HEDERA_NETWORK=hedera:testnet`
- Facilitators: x402.org (testnet) or `api.blocky402.com`. The payer account
  needs USDC on Hedera testnet (token association required).

One `GET /api/intel` from the UI performs the full 402 → sign → retry dance
and writes the cadence-slot ask. Without credentials the route returns an
honest `503 intel_not_configured` — no fake quotes are ever served.

## 5. App — self-host

```bash
cp .env.example .env.local   # then edit:
#   NEXT_PUBLIC_CHAIN_ID=11155111
#   GRAPH_ENDPOINT=...          GRAPH_API_KEY=...
#   X402_INTEL_URL=...          HEDERA_ACCOUNT_ID=...  HEDERA_PRIVATE_KEY=...
npm run build
npm start                    # serves at :3000 behind your own proxy/TLS
```

Security headers (`X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`,
`Permissions-Policy`) are set by the app's `next.config.ts`. Put the instance
behind HTTPS — wallet flows and x402 settlement require it.

## 6. Post-deploy checks

| Check | Command / place |
|---|---|
| Health | `curl https://<app>/api/health` → `{"ok":true,...}` |
| Contracts wired | `/console` shows non-zero reserves and the written ask |
| Reject demo | swap without slot → reject log shows `NoCadenceSlot` |
| Privacy demo | commit → explorer shows only `H` → reveal at fill |
| Subgraph | `/graph` panel live (entity counts > 0) |
| Intel | intel panel shows paid quote + settlement status |

## 7. Rollback

- App: redeploy the previous git tag (`git checkout <tag> && npm run build && npm start`) — under 5 min.
- Contracts: immutable by design — no proxy, no upgrade path. A venue bug
  means deploying a NEW hook + pool; slots are epoch-scoped so exposure is
  bounded by one epoch. This is a deliberate testnet-era choice; production
  would add a timelocked migration path instead of in-place upgrades.

## 8. Known gaps before real funds

See [SECURITY.md](../SECURITY.md) — the short version: unaudited, single-EOA
admin, escrow leaks an upper bound, subgraph + intel endpoints pending keys.
Testnet only until those are closed.
