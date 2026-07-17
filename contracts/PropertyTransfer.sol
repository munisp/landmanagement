// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title PropertyTransfer
 * @dev Smart contract for managing property title transfers on blockchain
 */
contract PropertyTransfer is AccessControl, Pausable, ReentrancyGuard {
    bytes32 public constant REGISTRAR_ROLE = keccak256("REGISTRAR_ROLE");
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    struct Property {
        string parcelId;
        address owner;
        string titleNumber;
        uint256 registrationDate;
        bool exists;
    }

    struct Transfer {
        string parcelId;
        address from;
        address to;
        uint256 timestamp;
        uint256 amount;
        string transactionId;
        bool completed;
    }

    // Mappings
    mapping(string => Property) public properties;
    mapping(string => Transfer[]) public propertyTransfers;
    mapping(address => string[]) public ownerProperties;
    
    // Events
    event PropertyRegistered(string indexed parcelId, address indexed owner, string titleNumber, uint256 timestamp);
    event TransferInitiated(string indexed parcelId, address indexed from, address indexed to, uint256 amount, string transactionId);
    event TransferCompleted(string indexed parcelId, address indexed from, address indexed to, uint256 timestamp);
    event OwnershipTransferred(string indexed parcelId, address indexed previousOwner, address indexed newOwner);

    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ADMIN_ROLE, msg.sender);
        _grantRole(REGISTRAR_ROLE, msg.sender);
    }

    /**
     * @dev Register a new property on the blockchain
     */
    function registerProperty(
        string memory parcelId,
        address owner,
        string memory titleNumber
    ) external onlyRole(REGISTRAR_ROLE) whenNotPaused {
        require(!properties[parcelId].exists, "Property already registered");
        require(owner != address(0), "Invalid owner address");
        require(bytes(parcelId).length > 0, "Invalid parcel ID");

        properties[parcelId] = Property({
            parcelId: parcelId,
            owner: owner,
            titleNumber: titleNumber,
            registrationDate: block.timestamp,
            exists: true
        });

        ownerProperties[owner].push(parcelId);

        emit PropertyRegistered(parcelId, owner, titleNumber, block.timestamp);
    }

    /**
     * @dev Initiate a property transfer
     */
    function initiateTransfer(
        string memory parcelId,
        address to,
        uint256 amount,
        string memory transactionId
    ) external whenNotPaused nonReentrant {
        require(properties[parcelId].exists, "Property does not exist");
        require(properties[parcelId].owner == msg.sender, "Not property owner");
        require(to != address(0), "Invalid recipient address");
        require(to != msg.sender, "Cannot transfer to self");

        Transfer memory newTransfer = Transfer({
            parcelId: parcelId,
            from: msg.sender,
            to: to,
            timestamp: block.timestamp,
            amount: amount,
            transactionId: transactionId,
            completed: false
        });

        propertyTransfers[parcelId].push(newTransfer);

        emit TransferInitiated(parcelId, msg.sender, to, amount, transactionId);
    }

    /**
     * @dev Complete a property transfer (called by registrar after verification)
     */
    function completeTransfer(
        string memory parcelId,
        string memory transactionId
    ) external onlyRole(REGISTRAR_ROLE) whenNotPaused {
        require(properties[parcelId].exists, "Property does not exist");

        Transfer[] storage transfers = propertyTransfers[parcelId];
        require(transfers.length > 0, "No transfers found");

        // Find the matching transfer
        bool found = false;
        uint256 transferIndex;
        for (uint256 i = 0; i < transfers.length; i++) {
            if (keccak256(bytes(transfers[i].transactionId)) == keccak256(bytes(transactionId)) && !transfers[i].completed) {
                found = true;
                transferIndex = i;
                break;
            }
        }

        require(found, "Transfer not found or already completed");

        Transfer storage transfer = transfers[transferIndex];
        address previousOwner = properties[parcelId].owner;
        address newOwner = transfer.to;

        // Update property ownership
        properties[parcelId].owner = newOwner;
        transfer.completed = true;

        // Update owner properties list
        ownerProperties[newOwner].push(parcelId);

        emit TransferCompleted(parcelId, transfer.from, transfer.to, block.timestamp);
        emit OwnershipTransferred(parcelId, previousOwner, newOwner);
    }

    /**
     * @dev Get property details
     */
    function getProperty(string memory parcelId) external view returns (Property memory) {
        require(properties[parcelId].exists, "Property does not exist");
        return properties[parcelId];
    }

    /**
     * @dev Get transfer history for a property
     */
    function getTransferHistory(string memory parcelId) external view returns (Transfer[] memory) {
        return propertyTransfers[parcelId];
    }

    /**
     * @dev Get properties owned by an address
     */
    function getOwnerProperties(address owner) external view returns (string[] memory) {
        return ownerProperties[owner];
    }

    /**
     * @dev Get current property owner
     */
    function getPropertyOwner(string memory parcelId) external view returns (address) {
        require(properties[parcelId].exists, "Property does not exist");
        return properties[parcelId].owner;
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
     * @dev Grant registrar role
     */
    function grantRegistrarRole(address account) external onlyRole(ADMIN_ROLE) {
        grantRole(REGISTRAR_ROLE, account);
    }

    /**
     * @dev Revoke registrar role
     */
    function revokeRegistrarRole(address account) external onlyRole(ADMIN_ROLE) {
        revokeRole(REGISTRAR_ROLE, account);
    }
}
