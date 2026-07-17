// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title Escrow
 * @dev Smart contract for managing escrow payments in property transactions
 */
contract Escrow is AccessControl, Pausable, ReentrancyGuard {
    bytes32 public constant ARBITER_ROLE = keccak256("ARBITER_ROLE");
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    enum EscrowState {
        Created,
        Funded,
        Released,
        Refunded,
        Disputed
    }

    struct EscrowDetails {
        string escrowId;
        address buyer;
        address seller;
        uint256 amount;
        EscrowState state;
        uint256 createdAt;
        uint256 expiresAt;
        string parcelId;
        bool exists;
    }

    // Mappings
    mapping(string => EscrowDetails) public escrows;
    mapping(address => string[]) public buyerEscrows;
    mapping(address => string[]) public sellerEscrows;

    // Events
    event EscrowCreated(string indexed escrowId, address indexed buyer, address indexed seller, uint256 amount, string parcelId);
    event EscrowFunded(string indexed escrowId, address indexed buyer, uint256 amount);
    event EscrowReleased(string indexed escrowId, address indexed seller, uint256 amount);
    event EscrowRefunded(string indexed escrowId, address indexed buyer, uint256 amount);
    event EscrowDisputed(string indexed escrowId, address indexed initiator);

    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ADMIN_ROLE, msg.sender);
        _grantRole(ARBITER_ROLE, msg.sender);
    }

    /**
     * @dev Create a new escrow
     */
    function createEscrow(
        string memory escrowId,
        address seller,
        uint256 amount,
        string memory parcelId,
        uint256 durationDays
    ) external whenNotPaused {
        require(!escrows[escrowId].exists, "Escrow already exists");
        require(seller != address(0), "Invalid seller address");
        require(seller != msg.sender, "Buyer and seller cannot be the same");
        require(amount > 0, "Amount must be greater than zero");
        require(durationDays > 0 && durationDays <= 365, "Invalid duration");

        uint256 expiresAt = block.timestamp + (durationDays * 1 days);

        escrows[escrowId] = EscrowDetails({
            escrowId: escrowId,
            buyer: msg.sender,
            seller: seller,
            amount: amount,
            state: EscrowState.Created,
            createdAt: block.timestamp,
            expiresAt: expiresAt,
            parcelId: parcelId,
            exists: true
        });

        buyerEscrows[msg.sender].push(escrowId);
        sellerEscrows[seller].push(escrowId);

        emit EscrowCreated(escrowId, msg.sender, seller, amount, parcelId);
    }

    /**
     * @dev Fund an escrow with ETH
     */
    function fundEscrow(string memory escrowId) external payable whenNotPaused nonReentrant {
        EscrowDetails storage escrow = escrows[escrowId];
        require(escrow.exists, "Escrow does not exist");
        require(escrow.buyer == msg.sender, "Only buyer can fund escrow");
        require(escrow.state == EscrowState.Created, "Escrow already funded or completed");
        require(msg.value == escrow.amount, "Incorrect amount sent");
        require(block.timestamp < escrow.expiresAt, "Escrow expired");

        escrow.state = EscrowState.Funded;

        emit EscrowFunded(escrowId, msg.sender, msg.value);
    }

    /**
     * @dev Release funds to seller (called by arbiter after verification)
     */
    function releaseEscrow(string memory escrowId) external onlyRole(ARBITER_ROLE) whenNotPaused nonReentrant {
        EscrowDetails storage escrow = escrows[escrowId];
        require(escrow.exists, "Escrow does not exist");
        require(escrow.state == EscrowState.Funded, "Escrow not funded");

        escrow.state = EscrowState.Released;

        (bool success, ) = escrow.seller.call{value: escrow.amount}("");
        require(success, "Transfer to seller failed");

        emit EscrowReleased(escrowId, escrow.seller, escrow.amount);
    }

    /**
     * @dev Refund buyer (called by arbiter in case of dispute resolution)
     */
    function refundEscrow(string memory escrowId) external onlyRole(ARBITER_ROLE) whenNotPaused nonReentrant {
        EscrowDetails storage escrow = escrows[escrowId];
        require(escrow.exists, "Escrow does not exist");
        require(escrow.state == EscrowState.Funded || escrow.state == EscrowState.Disputed, "Invalid escrow state");

        escrow.state = EscrowState.Refunded;

        (bool success, ) = escrow.buyer.call{value: escrow.amount}("");
        require(success, "Transfer to buyer failed");

        emit EscrowRefunded(escrowId, escrow.buyer, escrow.amount);
    }

    /**
     * @dev Initiate dispute
     */
    function disputeEscrow(string memory escrowId) external whenNotPaused {
        EscrowDetails storage escrow = escrows[escrowId];
        require(escrow.exists, "Escrow does not exist");
        require(escrow.state == EscrowState.Funded, "Escrow not funded");
        require(msg.sender == escrow.buyer || msg.sender == escrow.seller, "Not authorized");

        escrow.state = EscrowState.Disputed;

        emit EscrowDisputed(escrowId, msg.sender);
    }

    /**
     * @dev Auto-refund if escrow expires
     */
    function autoRefundExpired(string memory escrowId) external nonReentrant {
        EscrowDetails storage escrow = escrows[escrowId];
        require(escrow.exists, "Escrow does not exist");
        require(escrow.state == EscrowState.Funded, "Escrow not funded");
        require(block.timestamp >= escrow.expiresAt, "Escrow not expired");

        escrow.state = EscrowState.Refunded;

        (bool success, ) = escrow.buyer.call{value: escrow.amount}("");
        require(success, "Transfer to buyer failed");

        emit EscrowRefunded(escrowId, escrow.buyer, escrow.amount);
    }

    /**
     * @dev Get escrow details
     */
    function getEscrow(string memory escrowId) external view returns (EscrowDetails memory) {
        require(escrows[escrowId].exists, "Escrow does not exist");
        return escrows[escrowId];
    }

    /**
     * @dev Get buyer's escrows
     */
    function getBuyerEscrows(address buyer) external view returns (string[] memory) {
        return buyerEscrows[buyer];
    }

    /**
     * @dev Get seller's escrows
     */
    function getSellerEscrows(address seller) external view returns (string[] memory) {
        return sellerEscrows[seller];
    }

    /**
     * @dev Pause contract (admin only)
     */
    function pause() external onlyRole(ADMIN_ROLE) {
        _pause();
    }

    /**
     * @dev Unpause contract (admin only)
     */
    function unpause() external onlyRole(ADMIN_ROLE) {
        _unpause();
    }

    /**
     * @dev Grant arbiter role
     */
    function grantArbiterRole(address account) external onlyRole(ADMIN_ROLE) {
        grantRole(ARBITER_ROLE, account);
    }

    /**
     * @dev Revoke arbiter role
     */
    function revokeArbiterRole(address account) external onlyRole(ADMIN_ROLE) {
        revokeRole(ARBITER_ROLE, account);
    }

    /**
     * @dev Receive function to accept ETH
     */
    receive() external payable {}
}
