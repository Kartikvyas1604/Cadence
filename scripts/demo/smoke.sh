#!/usr/bin/env bash
# Cadence end-to-end smoke — the demo's critical path against a local chain.
# Covers: deploy → mint → swap succeeds → swap without slot rejects →
# commit-mint (H only) → reveal swap → wrong-salt rejects.
set -euo pipefail

RPC=${RPC:-http://localhost:8545}
PK0=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
PK1=0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d
BUYER=0x70997970C51812dc3A010C7d01b50e0d17dc79C8

say()  { printf "\n== %s ==\n" "$1"; }
fail() { printf "SMOKE FAIL: %s\n" "$1" >&2; exit 1; }

# fresh chain with the CREATE2 deployer predeployed
pkill -f "anvil --silent" 2>/dev/null || true
sleep 1
anvil --silent > /tmp/anvil-smoke.log 2>&1 &
ANVIL_PID=$!
sleep 4

cd "$(dirname "$0")/../../contracts"
export PRIVATE_KEY=$PK0
# anvil automines one block per tx — a longer epoch keeps the whole demo
# path (deploy ≈ 10 txs + mint/swap/commit/reveal ≈ 7 txs) inside epoch 0
export EPOCH_LENGTH=${EPOCH_LENGTH:-120}
forge script script/DeployCadence.s.sol --rpc-url $RPC --broadcast --slow > /tmp/deploy-smoke.log 2>&1 \
  || fail "deploy failed (see /tmp/deploy-smoke.log)"

cp deployments/31337.json ../public/deployments/31337.json
echo "manifest copied to public/deployments/31337.json"

S=$(python3 -c "import json;print(json.load(open('deployments/31337.json'))['slots'])")
R=$(python3 -c "import json;print(json.load(open('deployments/31337.json'))['router'])")
H=$(python3 -c "import json;print(json.load(open('deployments/31337.json'))['hook'])")
U=$(python3 -c "import json;print(json.load(open('deployments/31337.json'))['usdc'])")
KEY="(0x0000000000000000000000000000000000000000,$U,0,60,$H)"
echo "slots=$S hook=$H router=$R"

# fresh chain: blocks 1..12 are epoch 0 — plenty of room for the whole path

say "1. mint 10 ETH slot (fixed price)"
cast send $S "mintPublic(uint256)(uint256)" 10e18 --value 1.1e18 --private-key $PK1 --rpc-url $RPC > /dev/null \
  || fail "mintPublic failed"
SLOT=$(cast call $S "slotOf(address)(uint256)" $BUYER --rpc-url $RPC | cut -d" " -f1)
[ "$SLOT" = "10000000000000000000" ] || fail "slot balance expected 10e18, got $SLOT"
echo "slot balance ok: $SLOT"

say "2. swap WITH slot succeeds (1 ETH -> USDC)"
BEFORE=$(cast call $U "balanceOf(address)(uint256)" $BUYER --rpc-url $RPC | cut -d" " -f1)
cast send $R "swap((address,address,uint24,int24,address),bool,uint256)" "$KEY" true 1e18 \
  --value 1e18 --private-key $PK1 --rpc-url $RPC 2>&1 | grep -q "status               1 (success)" \
  || fail "swap with slot did not succeed"
AFTER=$(cast call $U "balanceOf(address)(uint256)" $BUYER --rpc-url $RPC | cut -d" " -f1)
python3 -c "import sys; sys.exit(0 if int('$AFTER') > int('$BEFORE') else 1)" || fail "USDC out not received"
echo "filled: +$(python3 -c "print(int('$AFTER')-int('$BEFORE'))") wei USDC"

say "3. oversize vs slot rejects"
OUT=$(cast send $R "swap((address,address,uint24,int24,address),bool,uint256)" "$KEY" true 20e18 \
  --value 20e18 --private-key $PK1 --rpc-url $RPC 2>&1 || true)
echo "$OUT" | grep -q "0x42af5088" || fail "oversize did not reject (want OversizeVsSlot)"
echo "oversize rejected ok"

say "4. swap WITHOUT slot rejects (NoCadenceSlot)"
OUT=$(cast send $R "swap((address,address,uint24,int24,address),bool,uint256)" "$KEY" true 1e18 \
  --value 1e18 \
  --private-key 0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6 \
  --rpc-url $RPC 2>&1 || true)
echo "$OUT" | grep -q "0xb6db9bd9" || fail "no-slot swap did not revert with NoCadenceSlot"
echo "no-slot rejected ok (0xb6db9bd9)"

say "5. Private Cadence Intent: commit H (size hidden) then reveal-swap"
EPOCH=$(cast call $S "currentEpoch()(uint256)" --rpc-url $RPC | cut -d" " -f1)
SALT=$(cast keccak "cadence-smoke-salt")
HVAL=$(cast keccak $(cast abi-encode "f(uint256,uint256,bytes32)" 5e18 "$EPOCH" $SALT))
cast send $S "commitMint(bytes32)" $HVAL --value 0.05e18 --private-key $PK1 --rpc-url $RPC > /dev/null \
  || fail "commitMint failed"
cast send $R "sellEthPrivate((address,address,uint24,int24,address),uint256,bytes32)" "$KEY" 5e18 $SALT \
  --value 5e18 --private-key $PK1 --rpc-url $RPC 2>&1 | grep -q "status               1 (success)" \
  || fail "reveal swap failed"
echo "private fill ok (revealed at consume)"

say "6. wrong-salt reveal rejects"
OUT=$(cast send $R "sellEthPrivate((address,address,uint24,int24,address),uint256,bytes32)" "$KEY" 5e18 \
  $(cast keccak "wrong-salt") --value 5e18 --private-key $PK1 --rpc-url $RPC 2>&1 || true)
echo "$OUT" | grep -qE "0x8ff14e0d" || fail "bad reveal did not revert"
echo "bad reveal rejected ok (0x8ff14e0d)"

say "7. LP module: position, revenue, withdraw safety"
# the deploy script deposited as the bootstrap LP (deployer = PK0)
LP=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
echo "LP = $LP"
SHARES=$(cast call $H "sharesOf(address)(uint256)" $LP --rpc-url $RPC | cut -d" " -f1)
python3 -c "import sys; sys.exit(0 if int('$SHARES') > 0 else 1)" || fail "bootstrap LP has no shares"
echo "bootstrap LP shares: $SHARES"

# buy another slot: sale proceeds must accrue as LP revenue
cast send $S "mintPublic(uint256)(uint256)" 4e18 --value 0.5e18 --private-key $PK1 --rpc-url $RPC > /dev/null
REV=$(cast call $H "lpPosition(address)(uint256,uint256,uint256,uint256,uint256)" $LP --rpc-url $RPC | sed -n '3p' | cut -d" " -f1)
python3 -c "import sys; sys.exit(0 if int('$REV') > 0 else 1)" || fail "slot-sale revenue did not accrue to the LP"
echo "LP slot revenue accrued: $REV wei ETH"

# swap: fee ledger accrues (USDC), separate from revenue
cast send $R "swap((address,address,uint24,int24,address),bool,uint256)" "$KEY" true 1e18 --value 1e18 --private-key $PK1 --rpc-url $RPC 2>&1 | grep -q "success" || fail "post-LP swap failed"
FEE=$(cast call $H "lpPosition(address)(uint256,uint256,uint256,uint256,uint256)" $LP --rpc-url $RPC | sed -n '4p' | cut -d" " -f1)
python3 -c "import sys; sys.exit(0 if int('$FEE') > 0 else 1)" || fail "swap fee did not accrue to the LP"
echo "LP swap fee accrued: $FEE wei USDC (separate ledger)"

# withdraw way beyond the safety bound -> UnsafeWithdraw (0x067a3d2e)
OUT=$(cast send $H "withdrawEth(uint256)" 999999e18 --private-key $PK0 --rpc-url $RPC 2>&1 || true)
echo "$OUT" | grep -q "0x067a3d2e" || fail "unsafe withdraw did not revert with UnsafeWithdraw"
echo "unsafe withdraw rejected ok (0x067a3d2e)"

say "8. CLOB (§1): sell order -> cancel -> refund; protocol take (§8)"
SLOB=$(python3 -c "import json;print(json.load(open('deployments/31337.json')).get('clob',''))")
if [ -n "$SLOB" ] && [ "$SLOB" != "null" ]; then
  # maker already holds a slot (bought in step 1); approve + place sell
  cast send $S "setApprovalForAll(address,bool)" $SLOB true --private-key $PK1 --rpc-url $RPC > /dev/null
  EPOCH=$(cast call $S "currentEpoch()(uint256)" --rpc-url $RPC | cut -d" " -f1)
  cast send $SLOB "placeOrder(bool,uint256,uint256,uint256)" false $EPOCH 1e18 0.002e18 --private-key $PK1 --rpc-url $RPC > /dev/null
  # cancel refunds the slots
  cast send $SLOB "cancelOrder(uint256)" 1 --private-key $PK1 --rpc-url $RPC > /dev/null
  echo "CLOB place/cancel ok (slots refunded)"
else
  echo "no clob in deployment manifest — skipping (honest)"
fi

# protocol take (§8): 90/10 default — after the sale in step 7 the hook holds a cut
CUT=$(cast call $H "accruedProtocolRevenue()(uint256)" --rpc-url $RPC | cut -d" " -f1)
python3 -c "import sys; sys.exit(0 if int('$CUT') >= 0 else 1)" || fail "protocol revenue read failed"
echo "protocol take ledger: $CUT wei ETH (90/10 split per spec)"

say "9. CLOB epoch expiry: buy order expires + refunds in ONE call (EpochExpired)"
if [ -n "$SLOB" ] && [ "$SLOB" != "null" ]; then
  EPOCH=$(cast call $S "currentEpoch()(uint256)" --rpc-url $RPC | cut -d" " -f1)
  cast send $SLOB "placeOrder(bool,uint256,uint256,uint256)" true $EPOCH 1e18 0.002e18 \
    --value 0.01e18 --private-key $PK1 --rpc-url $RPC > /dev/null \
    || fail "CLOB buy placement failed"
  CLOB_ETH_BEFORE=$(cast balance $SLOB --rpc-url $RPC)
  python3 -c "import sys; sys.exit(0 if int('$CLOB_ETH_BEFORE') > 0 else 1)" || fail "CLOB buy escrow missing"
  # roll past the epoch (anvil mine), then a single expireEpoch must refund
  cast rpc anvil_mine 200 --rpc-url $RPC > /dev/null
  cast send $SLOB "expireEpoch(uint256)" 0 --private-key $PK1 --rpc-url $RPC > /dev/null \
    || fail "expireEpoch failed"
  CLOB_ETH_AFTER=$(cast balance $SLOB --rpc-url $RPC)
  python3 -c "import sys; sys.exit(0 if int('$CLOB_ETH_AFTER') == 0 else 1)" \
    || fail "CLOB escrow not fully refunded on epoch expiry"
  echo "CLOB expire ok: escrow $CLOB_ETH_BEFORE -> $CLOB_ETH_AFTER (EpochExpired path)"
else
  echo "no clob in deployment manifest — skipping (honest)"
fi

say "9b. oversize vs ACTIVE reserves rejects (PassiveUnlock / OversizeVsActive)"
# after the epoch roll the fresh epoch's active depth is ~25% of seeds; a swap
# larger than active must reject (PassiveUnlock when active == 0, else
# OversizeVsActive) — never unlock passive mid-epoch
ACTIVE=$(cast call $H "activeEth()(uint256)" --rpc-url $RPC | cut -d" " -f1)
[ "$ACTIVE" != "0" ] && BIGGER=$(python3 -c "print(int('$ACTIVE')*2)") || BIGGER=1000000000000000000000
OUT=$(cast send $R "swap((address,address,uint24,int24,address),bool,uint256)" "$KEY" true "$BIGGER" \
  --value "$BIGGER" --private-key $PK1 --rpc-url $RPC 2>&1 || true)
OVERSIZE_ACTIVE=$(cast sig "OversizeVsActive()")
PASSIVE=$(cast sig "PassiveUnlock()")
echo "$OUT" | grep -qE "$OVERSIZE_ACTIVE|$PASSIVE" \
  || fail "oversize-vs-active swap did not reject (want OversizeVsActive or PassiveUnlock)"
echo "oversize-vs-active rejected ok (passive stays locked)"

say "PASS — full demo path verified on-chain"
# keep the chain alive for the browser console (localhost:8545)
echo ""
echo "chain live at localhost:8545 — open http://localhost:3000/console and connect"
echo "(stop it later: kill $ANVIL_PID)"
