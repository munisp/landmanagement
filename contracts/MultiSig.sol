// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title MultiSig
 * @dev Multi-signature wallet for property transfer approvals
 */
contract MultiSig is AccessControl, Pausable {
    bytes32 public constant SIGNER_ROLE = keccak256("SIGNER_ROLE");
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    uint256 public requiredSignatures;
    uint256 public transactionCount;

    struct Transaction {
        uint256 id;
        string parcelId;
        address from;
        address to;
        uint256 amount;
        string description;
        bool executed;
        uint256 confirmations;
        uint256 createdAt;
    }

    // Mappings
    mapping(uint256 => Transaction) public transactions;
    mapping(uint256 => mapping(address => bool)) public confirmations;
    mapping(address => bool) public isAuthorized;

    // Events
    event TransactionSubmitted(uint256 indexed transactionId, string parcelId, address indexed from, address indexed to, uint256 amount);
    event TransactionConfirmed(uint256 indexed transactionId, address indexed signer);
    event TransactionRevoked(uint256 indexed transactionId, address indexed signer);
    event TransactionExecuted(uint256 indexed transactionId);
    event RequiredSignaturesChanged(uint256 oldRequired, uint256 newRequired);
    event SignerAdded(address indexed signer);
    event SignerRemoved(address indexed signer);

    constructor(address[] memory initialSigners, uint256 _requiredSignatures) {
        require(initialSigners.length > 0, "Signers required");
        require(_requiredSignatures > 0 && _requiredSignatures <= initialSigners.length, "Invalid required signatures");

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ADMIN_ROLE, msg.sender);

        for (uint256 i = 0; i < initialSigners.length; i++) {
            address signer = initialSigners[i];
            require(signer != address(0), "Invalid signer address");
            require(!isAuthorized[signer], "Duplicate signer");

            _grantRole(SIGNER_ROLE, signer);
            isAuthorized[signer] = true;
            emit SignerAdded(signer);
        }

        requiredSignatures = _requiredSignatures;
    }

    /**
     * @dev Submit a new transaction for approval
     */
    function submitTransaction(
        string memory parcelId,
        address from,
        address to,
        uint256 amount,
        string memory description
    ) external onlyRole(SIGNER_ROLE) whenNotPaused returns (uint256) {
        require(from != address(0) && to != address(0), "Invalid addresses");
        require(bytes(parcelId).length > 0, "Invalid parcel ID");

        uint256 transactionId = transactionCount;
        transactionCount++;

        transactions[transactionId] = Transaction({
            id: transactionId,
            parcelId: parcelId,
            from: from,
            to: to,
            amount: amount,
            description: description,
            executed: false,
            confirmations: 0,
            createdAt: block.timestamp
        });

        emit TransactionSubmitted(transactionId, parcelId, from, to, amount);

        // Auto-confirm by submitter
        confirmTransaction(transactionId);

        return transactionId;
    }

    /**
     * @dev Confirm a transaction
     */
    function confirmTransaction(uint256 transactionId) public onlyRole(SIGNER_ROLE) whenNotPaused {
        require(transactionId < transactionCount, "Transaction does not exist");
        require(!transactions[transactionId].executed, "Transaction already executed");
        require(!confirmations[transactionId][msg.sender], "Transaction already confirmed");

        confirmations[transactionId][msg.sender] = true;
        transactions[transactionId].confirmations++;

        emit TransactionConfirmed(transactionId, msg.sender);

        // Auto-execute if threshold reached
        if (transactions[transactionId].confirmations >= requiredSignatures) {
            executeTransaction(transactionId);
        }
    }

    /**
     * @dev Revoke confirmation
     */
    function revokeConfirmation(uint256 transactionId) external onlyRole(SIGNER_ROLE) whenNotPaused {
        require(transactionId < transactionCount, "Transaction does not exist");
        require(!transactions[transactionId].executed, "Transaction already executed");
        require(confirmations[transactionId][msg.sender], "Transaction not confirmed");

        confirmations[transactionId][msg.sender] = false;
        transactions[transactionId].confirmations--;

        emit TransactionRevoked(transactionId, msg.sender);
    }

    /**
     * @dev Execute a transaction
     */
    function executeTransaction(uint256 transactionId) public onlyRole(SIGNER_ROLE) whenNotPaused {
        require(transactionId < transactionCount, "Transaction does not exist");
        require(!transactions[transactionId].executed, "Transaction already executed");
        require(transactions[transactionId].confirmations >= requiredSignatures, "Insufficient confirmations");

        transactions[transactionId].executed = true;

        emit TransactionExecuted(transactionId);
    }

    /**
     * @dev Get transaction details
     */
    function getTransaction(uint256 transactionId) external view returns (Transaction memory) {
        require(transactionId < transactionCount, "Transaction does not exist");
        return transactions[transactionId];
    }

    /**
     * @dev Check if transaction is confirmed by signer
     */
    function isConfirmed(uint256 transactionId, address signer) external view returns (bool) {
        return confirmations[transactionId][signer];
    }

    /**
     * @dev Get confirmation count for transaction
     */
    function getConfirmationCount(uint256 transactionId) external view returns (uint256) {
        require(transactionId < transactionCount, "Transaction does not exist");
        return transactions[transactionId].confirmations;
    }

    /**
     * @dev Get list of signers who confirmed a transaction
     */
    function getConfirmations(uint256 transactionId) external view returns (address[] memory) {
        require(transactionId < transactionCount, "Transaction does not exist");

        address[] memory signers = new address[](getRoleMemberCount(SIGNER_ROLE));
        uint256 count = 0;

        for (uint256 i = 0; i < getRoleMemberCount(SIGNER_ROLE); i++) {
            address signer = getRoleMember(SIGNER_ROLE, i);
            if (confirmations[transactionId][signer]) {
                signers[count] = signer;
                count++;
            }
        }

        // Resize array to actual count
        address[] memory result = new address[](count);
        for (uint256 i = 0; i < count; i++) {
            result[i] = signers[i];
        }

        return result;
    }

    /**
     * @dev Add a new signer
     */
    function addSigner(address signer) external onlyRole(ADMIN_ROLE) {
        require(signer != address(0), "Invalid signer address");
        require(!isAuthorized[signer], "Already a signer");

        _grantRole(SIGNER_ROLE, signer);
        isAuthorized[signer] = true;

        emit SignerAdded(signer);
    }

    /**
     * @dev Remove a signer
     */
    function removeSigner(address signer) external onlyRole(ADMIN_ROLE) {
        require(isAuthorized[signer], "Not a signer");
        require(getRoleMemberCount(SIGNER_ROLE) - 1 >= requiredSignatures, "Cannot remove signer: would fall below required signatures");

        _revokeRole(SIGNER_ROLE, signer);
        isAuthorized[signer] = false;

        emit SignerRemoved(signer);
    }

    /**
     * @dev Change required signatures
     */
    function changeRequiredSignatures(uint256 _requiredSignatures) external onlyRole(ADMIN_ROLE) {
        require(_requiredSignatures > 0, "Required signatures must be greater than zero");
        require(_requiredSignatures <= getRoleMemberCount(SIGNER_ROLE), "Required signatures exceeds signer count");

        uint256 oldRequired = requiredSignatures;
        requiredSignatures = _requiredSignatures;

        emit RequiredSignaturesChanged(oldRequired, _requiredSignatures);
    }

    /**
     * @dev Get signer count
     */
    function getSignerCount() external view returns (uint256) {
        return getRoleMemberCount(SIGNER_ROLE);
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
}
