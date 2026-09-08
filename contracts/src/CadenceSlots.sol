// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title CadenceSlots
 * @notice ERC-1155 tickets for scarce per-epoch execution capacity.
 * Token id = epoch id; balance = capacity notional in wei of ETH.
 *
 * Two mint paths:
 *  - Public (demo lead):  fixed-price mint for the CURRENT epoch only, size visible.
 *  - Private Cadence Intent: commitMint(H) where H = hash(size, epochId, salt).
 *    Size is never in the public mint payload; the escrow shows only an upper
 *    bound. The hook calls revealAndConsume at fill time, which verifies the
 *    preimage, emits SlotRevealed, consumes capacity and refunds the unused
 *    escrow.
 *
 * Named risk (honesty): unused Cadence slots expire worthless at epoch end.
 * A Cadence slot is NOT an LP share — it grants no claim on reserves.
 */
contract CadenceSlots is ERC1155, Ownable, ReentrancyGuard {
    using Address for address;

    enum CommitmentStatus {
        None,
        Committed,
        Revealed,
        Expired
    }

    struct Commitment {
        address payer;
        uint256 epochId;
        uint256 escrow;
        uint256 reserved;
        CommitmentStatus status;
    }

    /// @notice Reveal preimage does not hash to a live commitment, or caller is not the payer.
    error BadReveal();
    /// @notice Escrow is below the mint cost for the revealed size.
    error InsufficientEscrow();
    /// @notice Mint would exceed this epoch's capacity budget.
    error CapacityExceeded();
    /// @notice Zero size.
    error ZeroSize();

    event SlotMinted(uint256 indexed epochId, address indexed buyer, uint256 size, uint256 pricePaid);
    event SlotCommitted(uint256 indexed epochId, bytes32 indexed H, address indexed payer, uint256 escrow);
    event SlotRevealed(
        uint256 indexed epochId, bytes32 indexed H, address indexed trader, uint256 size, uint256 consumed
    );
    event SlotConsumed(uint256 indexed epochId, address indexed trader, uint256 size);
    event SlotExpired(uint256 indexed epochId, address indexed holder, uint256 size);
    event CommitmentExpired(uint256 indexed epochId, bytes32 indexed H, address indexed payer, uint256 escrowRefunded);

    /// @notice Ask per ETH of capacity, written by the intel pipeline (owner).
    uint256 public pricePerEth;
    // §4 dynamic price: bounded updates from paid intel
    uint256 public slotPriceMin;
    uint256 public slotPriceMax;
    uint256 public lastIntelAsk;
    uint256 public lastIntelTs;
    bytes32 public intelAttestationHash;

    event SlotPriceUpdated(uint256 ask, bytes32 receiptHash);

    /// @notice Ask outside the deploy-time [50%, 200%] bounds.
    error AskOutOfBounds();
    /// @notice Missing x402 payment proof (receipt hash).
    error MissingReceipt();
    /// @notice Minimum escrow accepted on commitMint — bounds the leak of size
    ///  through the escrow (size itself is never in the payload).
    uint256 public minEscrow;

    /// @notice Set after deploy: the PA-AMM hook. It is the only caller
    ///         allowed to consume capacity, and it defines the epoch clock
    ///         and capacity budget.
    address public hook;

    /// @notice epoch => total capacity sold via public mint.
    mapping(uint256 epochId => uint256) public mintedCapacity;
    /// @notice epoch => capacity reserved by live commitments.
    mapping(uint256 epochId => uint256) public committedCapacity;
    /// @notice H => commitment
    mapping(bytes32 H => Commitment) public commitments;

    /// @param owner_ the deploying admin (passed explicitly — salted CREATE2
    ///         deploys construct from the factory, not the deployer EOA).
    constructor(uint256 pricePerEth_, uint256 minEscrow_, string memory uri_, address owner_)
        ERC1155(uri_)
        Ownable(owner_)
    {
        pricePerEth = pricePerEth_;
        minEscrow = minEscrow_;
        // deploy-time bounds: 50%–200% of the deploy ask
        slotPriceMin = pricePerEth_ / 2;
        slotPriceMax = pricePerEth_ * 2;
    }

    modifier onlyHook() {
        require(msg.sender == hook, "CadenceSlots: not hook");
        _;
    }

    function setHook(address hook_) external onlyOwner {
        require(hook_ != address(0), "CadenceSlots: zero hook");
        hook = hook_;
    }

    function _hookView() internal view returns (ICadenceHook) {
        return ICadenceHook(hook);
    }

    function setPricePerEth(uint256 pricePerEth_) external onlyOwner {
        require(pricePerEth_ > 0, "CadenceSlots: zero price");
        pricePerEth = pricePerEth_;
    }

    function setMinEscrow(uint256 minEscrow_) external onlyOwner {
        minEscrow = minEscrow_;
    }

    /// @notice §4: push a paid-intel ask onchain. Owner/keeper only. The ask
    ///         must carry an x402 payment receipt hash and sit inside the
    ///         deploy-time [50%, 200%] bounds — intel never silently mutates
    ///         pool config.
    function setSlotPriceFromIntel(uint256 ask, bytes32 receiptHash) external onlyOwner {
        if (ask < slotPriceMin || ask > slotPriceMax) revert AskOutOfBounds();
        if (receiptHash == 0) revert MissingReceipt();
        pricePerEth = ask;
        lastIntelAsk = ask;
        lastIntelTs = block.timestamp;
        intelAttestationHash = receiptHash;
        emit SlotPriceUpdated(ask, receiptHash);
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    /// @notice Capacity notional held by `owner` for the CURRENT epoch.
    function slotOf(address owner) external view returns (uint256) {
        return balanceOf(owner, currentEpoch());
    }

    /// @notice Epoch the chain is currently in.
    function currentEpoch() public view returns (uint256) {
        return block.number / _hookView().epochLengthBlocks();
    }

    /// @notice Remaining mintable capacity budget for the current epoch.
    ///         Public mint + live commitments draw from the same budget.
    function remainingCapacity() public view returns (uint256) {
        uint256 epochId = currentEpoch();
        uint256 budget = _hookView().epochCapacityEth(epochId);
        uint256 used = mintedCapacity[epochId] + committedCapacity[epochId];
        return budget > used ? budget - used : 0;
    }

    // ---------------------------------------------------------------------
    // Public mint (demo lead) — B
    // ---------------------------------------------------------------------

    /// @notice Pay fixed price and mint capacity for the CURRENT epoch only.
    ///         Size is visible on mint. Excess value is refunded.
    function mintPublic(uint256 size) external payable returns (uint256 epochId) {
        if (size == 0) revert ZeroSize();
        _hookView().refreshEpoch();
        epochId = currentEpoch();

        // capacity bound FIRST — it also bounds the cost arithmetic below
        uint256 remaining = remainingCapacity();
        if (size > remaining) revert CapacityExceeded();

        uint256 cost = (size * pricePerEth) / 1e18;
        if (msg.value < cost) revert InsufficientEscrow();

        mintedCapacity[epochId] += size;
        _mint(msg.sender, epochId, size, "");
        Address.sendValue(payable(msg.sender), msg.value - cost);
        // sale proceeds flow to the hook — LP slot revenue (≠ swap fees)
        Address.sendValue(payable(hook), cost);

        emit SlotMinted(epochId, msg.sender, size, cost);
    }

    // ---------------------------------------------------------------------
    // Private Cadence Intent — B2: commit H, reveal at consume
    // ---------------------------------------------------------------------

    /// @notice Commit-mint against H = hash(size, epochId, salt). Size is NOT
    ///         in the public payload; the escrow shows only an upper bound
    ///         (escrow/price). Buyer must escrow >= size * price; unused
    ///         escrow refunds at reveal. Capacity budget is reserved
    ///         conservatively against the escrow bound.
    function commitMint(bytes32 H) external payable nonReentrant {
        if (msg.value < minEscrow) revert InsufficientEscrow();
        if (commitments[H].status != CommitmentStatus.None) revert BadReveal();
        _hookView().refreshEpoch();

        uint256 epochId = currentEpoch();
        uint256 reserved = (msg.value * 1e18) / pricePerEth;
        uint256 remaining = remainingCapacity();
        if (reserved > remaining) revert CapacityExceeded();

        committedCapacity[epochId] += reserved;
        commitments[H] = Commitment({
            payer: msg.sender,
            epochId: epochId,
            escrow: msg.value,
            reserved: reserved,
            status: CommitmentStatus.Committed
        });

        emit SlotCommitted(epochId, H, msg.sender, msg.value);
    }

    /// @notice Verify the revealed preimage, emit SlotRevealed, consume the
    ///         reserved capacity and refund the unused escrow. Only the hook,
    ///         only at fill time (beforeSwap reveal path).
    /// @return consumed capacity in wei of ETH.
    function revealAndConsume(address trader, uint256 size, bytes32 salt)
        external
        onlyHook
        nonReentrant
        returns (uint256 consumed)
    {
        uint256 epochId = currentEpoch();
        bytes32 H = commitHash(size, epochId, salt);
        Commitment storage c = commitments[H];

        if (c.status != CommitmentStatus.Committed) revert BadReveal();
        if (c.payer != trader) revert BadReveal();

        uint256 cost = (size * pricePerEth) / 1e18;
        if (c.escrow < cost) revert InsufficientEscrow();

        c.status = CommitmentStatus.Revealed;
        committedCapacity[epochId] -= c.reserved;
        // the sale completes at reveal: the consumed size counts against the
        // epoch budget (same ledger as public mints)
        mintedCapacity[epochId] += size;
        Address.sendValue(payable(trader), c.escrow - cost);
        Address.sendValue(payable(hook), cost);
        emit SlotRevealed(epochId, H, trader, size, cost);
        return size;
    }

    /// @notice Same hash function the client uses to derive H: keccak(size, epochId, salt).
    function commitHash(uint256 size, uint256 epochId, bytes32 salt) public pure returns (bytes32) {
        return keccak256(abi.encode(size, epochId, salt));
    }

    // ---------------------------------------------------------------------
    // Consumption — C: only the hook, at fill time
    // ---------------------------------------------------------------------

    /// @notice Burn `size` capacity from `trader`'s current-epoch balance.
    ///         Old-epoch balances are rejected upstream (slot >= size check
    ///         against the CURRENT epoch id).
    function consume(address trader, uint256 size) external onlyHook {
        uint256 epochId = currentEpoch();
        if (size == 0) revert ZeroSize();
        if (balanceOf(trader, epochId) < size) revert BadReveal();
        _burn(trader, epochId, size);
        emit SlotConsumed(epochId, trader, size);
    }

    // ---------------------------------------------------------------------
    // Expiry — honesty: unused Cadence slots expire
    // ---------------------------------------------------------------------

    /// @notice Burn all capacity held for a PAST epoch. Permissionless.
    function expire(uint256 epochId) external {
        require(epochId != currentEpoch(), "CadenceSlots: epoch active");
        uint256 size = balanceOf(msg.sender, epochId);
        if (size == 0) revert ZeroSize();
        _burn(msg.sender, epochId, size);
        emit SlotExpired(epochId, msg.sender, size);
    }

    /// @notice Refund and expire a commitment that was never revealed
    ///         (epoch passed). Refunds the full escrow. Permissionless.
    function expireCommitment(bytes32 H) external nonReentrant {
        Commitment storage c = commitments[H];
        require(c.status == CommitmentStatus.Committed, "CadenceSlots: not committed");
        require(c.epochId != currentEpoch(), "CadenceSlots: epoch active");
        c.status = CommitmentStatus.Expired;
        committedCapacity[c.epochId] -= c.reserved;
        Address.sendValue(payable(c.payer), c.escrow);
        emit CommitmentExpired(c.epochId, H, c.payer, c.escrow);
    }
}

/// @notice Minimal surface CadenceSlots reads from the hook to derive epochs
///         and capacity budgets without a circular constructor.
interface ICadenceHook {
    function epochLengthBlocks() external view returns (uint256);
    function epochCapacityEth(uint256 epochId) external view returns (uint256);
    function refreshEpoch() external;
}
