# Deploy runbook — Cadence

Single source of truth for deploying / redeploying the venue: contracts,
subgraph, web app. Env var names only — never paste key values into docs,
commits, or tickets.

## 0. Prerequisites

- Foundry (`foundryup`), Node 24, a funded Sepolia deployer key.
- Secrets live in the host secret store (Vercel env / shell env) — never in git.
- After ANY secret exposure: rotate first (see `SECURITY.md`), deploy after.

## 1. Contracts (Sepolia)

```bash
cd contracts
cp .env.example .env            # fill names below, values in secret store
forge test                       # green before every deploy
bash ../scripts/demo/deploy-live.sh
```

Env names (see root `.env.example` for the full list):

- `PRIVATE_KEY` — deployer EOA (funded Sepolia ETH)
- `SEPOLIA_RPC_URL` — RPC endpoint
- `LAMBDA_BPS`, `EPOCH_LENGTH`, `SLOT_PRICE_ETH`, `SEED_ETH`, `SEED_USDC`,
  `SWAP_FEE_BPS`, `PROTOCOL_TAKE_BPS`, `POOLMANAGER`

The deploy script prints and writes `contracts/deployments/11155111.json`.
Copy it into the app:

```bash
cp contracts/deployments/11155111.json public/deployments/11155111.json
```

**Manifest discipline:** `public/deployments/<chainId>.json` is the single
source of truth for live addresses (the intel merchant reads the hook from
here — a stale hardcoded address reads the wrong pool). Commit the manifest
in the same PR as the deploy. Contracts are immutable (no UUPS) — address
changes are redeploys + a new manifest, never upgrades.

## 2. Subgraph (The Graph Studio)

1. `cd subgraph && pnpm install && pnpm codegen` (regenerates types from the
   refreshed ABIs under `subgraph/abis/`), then `pnpm build`.
2. Confirm `subgraph.yaml` addresses match `public/deployments/<chainId>.json`
   exactly (hook + slots). **Fast-sync tip:** `startBlock` ≤ deploy block
   keeps full history, but when the entity set is empty anyway (demo) set it
   to a recent block so the re-publish catches up instantly — the current
   yaml uses the fresh demo-tx block so live mints/consumes/swaps appear
   without a days-long crawl.
3. `graph auth <STUDIO_DEPLOY_KEY>` (deploy-scope token — NOT the query
   `GRAPH_API_KEY`), then publish to Studio (`pnpm deploy` /
   `graph deploy --studio <slug>`).
4. Run ≥1 public mint + one commit/reveal/consume on the deployed contracts
   and re-query until `mints`/`commits`/`reveals`/`consumes`/`swaps` are
   non-empty (H5 — a healthy proxy with empty entities is flagged by
   `/api/health` as `graph.detail = "synced-but-empty"`). NOTE: every
   re-publish creates a NEW version URL (e.g. `.../cadence/v2.0.0`) — the
   old version URL stops resolving, so `GRAPH_ENDPOINT` must be updated to
   the newest version in the app env (Vercel) at the same time.
5. Set `GRAPH_ENDPOINT` + `GRAPH_API_KEY` in the app env.

## 3. Web app (Vercel)

```bash
vercel --prod
```

Env names (all server-side unless prefixed `NEXT_PUBLIC_`):

- Core: `NEXT_PUBLIC_CHAIN_ID`, `HOOK_ADDRESS` (optional pin; falls back to
  the manifest), `RPC_URL`
- Graph: `GRAPH_ENDPOINT`, `GRAPH_API_KEY`
- x402 paid intel (server pays): `X402_INTEL_URL`, `X402_SCHEME`,
  `X402_NETWORK`, `X402_PRIVATE_KEY` — or the Hedera payer path:
  `HEDERA_ACCOUNT_ID`, `HEDERA_PRIVATE_KEY`, `HEDERA_NETWORK`
- x402 merchant (client pays): `X402_PAY_TO`, `X402_FEE_PAYER`,
  `X402_AMOUNT`, `FACILITATOR_URL`
- Chainlink CRE: `CRE_WORKFLOW_URL`, `CRE_API_KEY`
- Idempotency store (M-IDEM, recommended for multi-isolate correctness):
  `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` — when unset the
  store is single-isolate (demo-grade, documented)
- CSP: `CSP_CONNECT_SRC` if the deployment uses RPC/studio hosts beyond the
  defaults in `next.config.ts`

Honesty invariant: every integration 503s with a named error when its env is
unset (`intel_not_configured`, `cre_not_configured`, `graph_not_configured`,
`lvr_not_configured`, `intel_pool_unreadable`) — never a fabricated success.

## 4. Post-deploy smoke (do not skip)

- CI runs the smoke suite on every push; `bash scripts/demo/smoke.sh` is
  REQUIRED before release tags (`npm run demo`).
- Post-deploy: `GET /api/health` → 200 with `integrations` reflecting real
  readiness; `GET /api/x402/status` → 200; `GET /api/intel` → 405;
  `GET /api/intel-service/ask` → 402 challenge; `POST /api/graph
  {"op":"mints"}` → 200. CI's `prod-smoke` job automates these when
  `PROD_SMOKE_URL` is set.
- Never burn paid x402 paths while smoke-testing: unpaid probes (405/402)
  are free by design.

## 5. Rollback

1. **App:** `vercel rollback <deployment>` — minutes, no contract impact.
2. **Manifest pin:** if a bad contract deploy shipped, revert
   `public/deployments/<chainId>.json` to the previous manifest commit and
   redeploy the app — the previous hook/slots addresses stay live (immutable
   contracts keep working).
3. **Contracts:** no upgrades (immutable by design). Deploy a corrected
   version → new manifest → app redeploy. Never repoint a live manifest at a
   contract that has not passed `forge test` + the demo smoke.

## 6. Checklist before a release tag

- [ ] `forge test` green (contracts/)
- [ ] `npm test` green (web: reducer + route-handler suites)
- [ ] `npm run lint` + `npx tsc --noEmit` + `npm run build` green
- [ ] `npm run demo` (smoke) PASS
- [ ] `public/deployments/*.json` matches the live chain
- [ ] Subgraph synced with non-empty Cadence entities
- [ ] `/api/health` shows `healthy: true` for graph + intel + contracts
- [ ] No secrets printed in logs, docs, or commits
