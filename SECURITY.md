# Security

**Status: testnet-grade. Do not point this at real funds without the items below.**

## What's in place

- Foundry test suite (22 tests) covering all four reject paths, commit→reveal,
  epoch refresh, capacity budget, and the passive-lock invariant — including a
  regression test for the dust-seed re-partition exploit found during the
  production-readiness audit.
- Reentrancy guard on every CadenceSlots state-changing entry point; hook
  settlement rides v4-core's locked-manager protections.
- `onlyPoolManager` on hook entry points; only the authorized router may pass
  trader identities in `hookData`; only the hook may consume slot capacity.
- Secrets (Graph API key, x402 payer keys) stay in server-side route handlers,
  never in client bundles. Public routes are rate-limited and zod-validated.

## Known limitations (disclosed, deliberate for testnet)

1. **No third-party audit.** The hook uses the custom-curve accounting pattern
   (take specified / settle unspecified, zero-liquidity pool) mirroring audited
   base implementations, but this specific combination is not audited.
2. **Single-EOA admin.** `CadenceSlots` owner (price setter, hook wiring) is the
   deployer EOA. Production: multisig + timelock, or renounce after freezing
   the ask.
3. **Escrow upper-bound leak.** `commitMint(H)` hides the size, but the escrow
   value is an upper bound (`escrow / price`). Documented in the UI; an exact
   private fill needs a different escrow design (e.g. RPV, not in scope here).
4. **Trader identity is hookData-asserted.** A malicious router could burn a
   third party's slot (griefing only — it pays that party's input and gains
   nothing). Production: route through a router that signs the identity.
5. **Transitive dependency risk.** `@x402/hedera` pulls `@hiero-ledger/sdk`
   (high-severity advisories in its transitive chain as of Sep 2026). It is
   dynamically imported and unused unless the intel route is configured.
6. **No price oracle.** The slot ask is admin-written (after a paid intel call).
   A manipulated ask is bounded by `mintPublic`'s capacity budget and refund
   logic, but ask-setting is still trusted.

## Disclosure

Found a bug? Email the team or open a private GitHub security advisory — do
not open a public issue. Testnet bounties considered case by case; mainnet
deployment ships with a formal bounty program.
