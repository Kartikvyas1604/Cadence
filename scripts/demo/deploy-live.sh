#!/usr/bin/env bash
# Deploy the full Cadence venue to a live chain (default: Sepolia).
# Reads .env at the repo root. NEVER prints or commits the key.
set -euo pipefail
cd "$(dirname "$0")/../.."

RPC=${SEPOLIA_RPC_URL:-https://ethereum-sepolia-rpc.publicnode.com}
# export every config var from .env into the environment
set -a; source .env 2>/dev/null; set +a
export PRIVATE_KEY=$(grep -E "^PRIVATE_KEY=0x[0-9a-fA-F]+" .env | head -1 | cut -d= -f2)
[ -n "$PRIVATE_KEY" ] || { echo "PRIVATE_KEY empty in .env — paste your funded deployer key first."; exit 1; }
RPC=${SEPOLIA_RPC_URL:-$RPC}

echo "deploying to $RPC (chain 11155111)…"
cd contracts
forge script script/DeployCadence.s.sol \
  --rpc-url "$RPC" --broadcast --slow \
  --verify --verifier etherscan --etherscan-api-key "${ETHERSCAN_KEY:-}" 2>/dev/null \
  || forge script script/DeployCadence.s.sol --rpc-url "$RPC" --broadcast --slow

CHAIN_ID=$(cast chain-id --rpc-url "$RPC")
cp "deployments/$CHAIN_ID.json" "../public/deployments/$CHAIN_ID.json"
echo "manifest: public/deployments/$CHAIN_ID.json"
python3 -m json.tool "../public/deployments/$CHAIN_ID.json"
echo ""
echo "chainId $CHAIN_ID live — open the app, connect your wallet to this chain."
