# Cadence Subgraph (The Graph Studio)

Indexes the Cadence venue events for the live Graph panel:

- `CadenceSlots`: `SlotMinted`, `SlotCommitted → SlotRevealed`, `SlotConsumed`
- `CadenceHook`: `CadenceSwap` (fills against ACTIVE reserves only), `EpochRefreshed`

Privacy model (honest): the commitment hash `H` is public at commit; the size
becomes public at `SlotRevealed` — never private forever.

## Deploy to Graph Studio

1. `npm install -g @graphprotocol/graph-cli`
2. `cd subgraph && graph auth <STUDIO_DEPLOY_KEY>`
3. Fill the two `source.address` fields in `subgraph.yaml` from
   `contracts/deployments/<chainId>.json` (`slots` and `hook`), set the
   `network` to the deployed chain (`sepolia`), and set `startBlock` to the
   deployment's `seedBlock`.
4. `graph codegen && graph build`
5. `graph deploy --studio <SUBGRAPH_SLUG>`

Then set `GRAPH_ENDPOINT` (Studio query URL) and `GRAPH_API_KEY` in the app
environment — the `/api/graph` route handler proxies Studio server-side so the
key never reaches the browser.
