package main

import (
	"encoding/json"
	"fmt"
	"time"

	"github.com/hyperledger/fabric-contract-api-go/contractapi"
)

// TitleTransferContract provides functions for managing property title transfers
type TitleTransferContract struct {
	contractapi.Contract
}

// PropertyTitle represents a property title on the blockchain
type PropertyTitle struct {
	ParcelID          string    `json:"parcelId"`
	TitleNumber       string    `json:"titleNumber"`
	CurrentOwner      string    `json:"currentOwner"`
	OwnerNIN          string    `json:"ownerNIN"`
	PreviousOwner     string    `json:"previousOwner"`
	AcquisitionDate   time.Time `json:"acquisitionDate"`
	TitleType         string    `json:"titleType"` // Freehold, Leasehold, Customary
	EncumbranceStatus string    `json:"encumbranceStatus"`
	Encumbrances      []string  `json:"encumbrances"`
	LandUse           string    `json:"landUse"`
	SizeSqm           float64   `json:"sizeSqm"`
	Location          Location  `json:"location"`
	Status            string    `json:"status"` // Active, Transferred, Disputed, Revoked
	CreatedAt         time.Time `json:"createdAt"`
	UpdatedAt         time.Time `json:"updatedAt"`
	TransactionHash   string    `json:"transactionHash"`
}

// Location represents geographic coordinates
type Location struct {
	State     string  `json:"state"`
	LGA       string  `json:"lga"`
	City      string  `json:"city"`
	Latitude  float64 `json:"latitude"`
	Longitude float64 `json:"longitude"`
}

// TransferRequest represents a title transfer request
type TransferRequest struct {
	RequestID       string    `json:"requestId"`
	ParcelID        string    `json:"parcelId"`
	TitleNumber     string    `json:"titleNumber"`
	FromOwner       string    `json:"fromOwner"`
	FromOwnerNIN    string    `json:"fromOwnerNIN"`
	ToOwner         string    `json:"toOwner"`
	ToOwnerNIN      string    `json:"toOwnerNIN"`
	TransferType    string    `json:"transferType"` // Sale, Gift, Inheritance, Court Order
	ConsiderationAmount float64 `json:"considerationAmount"`
	Currency        string    `json:"currency"`
	Status          string    `json:"status"` // Pending, Approved, Rejected, Completed
	InitiatedBy     string    `json:"initiatedBy"`
	InitiatedAt     time.Time `json:"initiatedAt"`
	ApprovedBy      string    `json:"approvedBy"`
	ApprovedAt      time.Time `json:"approvedAt"`
	CompletedAt     time.Time `json:"completedAt"`
	RejectionReason string    `json:"rejectionReason"`
	SupportingDocs  []string  `json:"supportingDocs"`
}

// InitLedger initializes the ledger with sample data
func (c *TitleTransferContract) InitLedger(ctx contractapi.TransactionContextInterface) error {
	titles := []PropertyTitle{
		{
			ParcelID:    "PARCEL-001",
			TitleNumber: "TITLE-LAG-001-2024",
			CurrentOwner: "John Doe",
			OwnerNIN:    "12345678901",
			PreviousOwner: "",
			AcquisitionDate: time.Now().AddDate(-2, 0, 0),
			TitleType:    "Freehold",
			EncumbranceStatus: "Clear",
			Encumbrances: []string{},
			LandUse:      "Residential",
			SizeSqm:      500.0,
			Location: Location{
				State:     "Lagos",
				LGA:       "Ikeja",
				City:      "Lagos",
				Latitude:  6.5244,
				Longitude: 3.3792,
			},
			Status:    "Active",
			CreatedAt: time.Now().AddDate(-2, 0, 0),
			UpdatedAt: time.Now(),
			TransactionHash: "",
		},
	}

	for _, title := range titles {
		titleJSON, err := json.Marshal(title)
		if err != nil {
			return err
		}

		err = ctx.GetStub().PutState(title.TitleNumber, titleJSON)
		if err != nil {
			return fmt.Errorf("failed to put title to world state: %v", err)
		}
	}

	return nil
}

// RegisterTitle registers a new property title
func (c *TitleTransferContract) RegisterTitle(ctx contractapi.TransactionContextInterface, titleJSON string) error {
	var title PropertyTitle
	err := json.Unmarshal([]byte(titleJSON), &title)
	if err != nil {
		return fmt.Errorf("failed to unmarshal title: %v", err)
	}

	// Check if title already exists
	existing, err := ctx.GetStub().GetState(title.TitleNumber)
	if err != nil {
		return fmt.Errorf("failed to read from world state: %v", err)
	}
	if existing != nil {
		return fmt.Errorf("title %s already exists", title.TitleNumber)
	}

	// Set timestamps
	title.CreatedAt = time.Now()
	title.UpdatedAt = time.Now()
	title.Status = "Active"
	title.TransactionHash = ctx.GetStub().GetTxID()

	titleBytes, err := json.Marshal(title)
	if err != nil {
		return fmt.Errorf("failed to marshal title: %v", err)
	}

	return ctx.GetStub().PutState(title.TitleNumber, titleBytes)
}

// QueryTitle retrieves a title by title number
func (c *TitleTransferContract) QueryTitle(ctx contractapi.TransactionContextInterface, titleNumber string) (*PropertyTitle, error) {
	titleJSON, err := ctx.GetStub().GetState(titleNumber)
	if err != nil {
		return nil, fmt.Errorf("failed to read from world state: %v", err)
	}
	if titleJSON == nil {
		return nil, fmt.Errorf("title %s does not exist", titleNumber)
	}

	var title PropertyTitle
	err = json.Unmarshal(titleJSON, &title)
	if err != nil {
		return nil, fmt.Errorf("failed to unmarshal title: %v", err)
	}

	return &title, nil
}

// InitiateTransfer initiates a title transfer request
func (c *TitleTransferContract) InitiateTransfer(ctx contractapi.TransactionContextInterface, requestJSON string) error {
	var request TransferRequest
	err := json.Unmarshal([]byte(requestJSON), &request)
	if err != nil {
		return fmt.Errorf("failed to unmarshal transfer request: %v", err)
	}

	// Verify title exists and current owner matches
	title, err := c.QueryTitle(ctx, request.TitleNumber)
	if err != nil {
		return err
	}

	if title.CurrentOwner != request.FromOwner || title.OwnerNIN != request.FromOwnerNIN {
		return fmt.Errorf("owner mismatch: expected %s (%s)", title.CurrentOwner, title.OwnerNIN)
	}

	if title.Status != "Active" {
		return fmt.Errorf("title is not active: current status is %s", title.Status)
	}

	// Create transfer request
	request.Status = "Pending"
	request.InitiatedAt = time.Now()
	request.InitiatedBy = request.FromOwner

	requestBytes, err := json.Marshal(request)
	if err != nil {
		return fmt.Errorf("failed to marshal transfer request: %v", err)
	}

	// Store transfer request with composite key
	requestKey := fmt.Sprintf("TRANSFER_%s", request.RequestID)
	return ctx.GetStub().PutState(requestKey, requestBytes)
}

// ApproveTransfer approves a transfer request (Government organization only)
func (c *TitleTransferContract) ApproveTransfer(ctx contractapi.TransactionContextInterface, requestID string, approverID string) error {
	// Get MSP ID to verify organization
	mspID, err := ctx.GetClientIdentity().GetMSPID()
	if err != nil {
		return fmt.Errorf("failed to get MSP ID: %v", err)
	}

	// Only Government organization can approve
	if mspID != "GovernmentMSP" {
		return fmt.Errorf("only Government organization can approve transfers")
	}

	// Get transfer request
	requestKey := fmt.Sprintf("TRANSFER_%s", requestID)
	requestJSON, err := ctx.GetStub().GetState(requestKey)
	if err != nil {
		return fmt.Errorf("failed to read transfer request: %v", err)
	}
	if requestJSON == nil {
		return fmt.Errorf("transfer request %s does not exist", requestID)
	}

	var request TransferRequest
	err = json.Unmarshal(requestJSON, &request)
	if err != nil {
		return fmt.Errorf("failed to unmarshal transfer request: %v", err)
	}

	if request.Status != "Pending" {
		return fmt.Errorf("transfer request is not pending: current status is %s", request.Status)
	}

	// Update request status
	request.Status = "Approved"
	request.ApprovedBy = approverID
	request.ApprovedAt = time.Now()

	requestBytes, err := json.Marshal(request)
	if err != nil {
		return fmt.Errorf("failed to marshal transfer request: %v", err)
	}

	return ctx.GetStub().PutState(requestKey, requestBytes)
}

// CompleteTransfer completes the title transfer
func (c *TitleTransferContract) CompleteTransfer(ctx contractapi.TransactionContextInterface, requestID string) error {
	// Get transfer request
	requestKey := fmt.Sprintf("TRANSFER_%s", requestID)
	requestJSON, err := ctx.GetStub().GetState(requestKey)
	if err != nil {
		return fmt.Errorf("failed to read transfer request: %v", err)
	}
	if requestJSON == nil {
		return fmt.Errorf("transfer request %s does not exist", requestID)
	}

	var request TransferRequest
	err = json.Unmarshal(requestJSON, &request)
	if err != nil {
		return fmt.Errorf("failed to unmarshal transfer request: %v", err)
	}

	if request.Status != "Approved" {
		return fmt.Errorf("transfer request is not approved: current status is %s", request.Status)
	}

	// Get current title
	title, err := c.QueryTitle(ctx, request.TitleNumber)
	if err != nil {
		return err
	}

	// Update title ownership
	title.PreviousOwner = title.CurrentOwner
	title.CurrentOwner = request.ToOwner
	title.OwnerNIN = request.ToOwnerNIN
	title.AcquisitionDate = time.Now()
	title.UpdatedAt = time.Now()
	title.TransactionHash = ctx.GetStub().GetTxID()

	titleBytes, err := json.Marshal(title)
	if err != nil {
		return fmt.Errorf("failed to marshal title: %v", err)
	}

	err = ctx.GetStub().PutState(title.TitleNumber, titleBytes)
	if err != nil {
		return fmt.Errorf("failed to update title: %v", err)
	}

	// Update transfer request
	request.Status = "Completed"
	request.CompletedAt = time.Now()

	requestBytes, err := json.Marshal(request)
	if err != nil {
		return fmt.Errorf("failed to marshal transfer request: %v", err)
	}

	return ctx.GetStub().PutState(requestKey, requestBytes)
}

// QueryTransferRequest retrieves a transfer request
func (c *TitleTransferContract) QueryTransferRequest(ctx contractapi.TransactionContextInterface, requestID string) (*TransferRequest, error) {
	requestKey := fmt.Sprintf("TRANSFER_%s", requestID)
	requestJSON, err := ctx.GetStub().GetState(requestKey)
	if err != nil {
		return nil, fmt.Errorf("failed to read transfer request: %v", err)
	}
	if requestJSON == nil {
		return nil, fmt.Errorf("transfer request %s does not exist", requestID)
	}

	var request TransferRequest
	err = json.Unmarshal(requestJSON, &request)
	if err != nil {
		return nil, fmt.Errorf("failed to unmarshal transfer request: %v", err)
	}

	return &request, nil
}

// GetTitleHistory returns the history of a title
func (c *TitleTransferContract) GetTitleHistory(ctx contractapi.TransactionContextInterface, titleNumber string) ([]PropertyTitle, error) {
	resultsIterator, err := ctx.GetStub().GetHistoryForKey(titleNumber)
	if err != nil {
		return nil, fmt.Errorf("failed to get history: %v", err)
	}
	defer resultsIterator.Close()

	var history []PropertyTitle
	for resultsIterator.HasNext() {
		response, err := resultsIterator.Next()
		if err != nil {
			return nil, fmt.Errorf("failed to iterate history: %v", err)
		}

		var title PropertyTitle
		err = json.Unmarshal(response.Value, &title)
		if err != nil {
			return nil, fmt.Errorf("failed to unmarshal title: %v", err)
		}

		history = append(history, title)
	}

	return history, nil
}

// AddEncumbrance adds an encumbrance to a title
func (c *TitleTransferContract) AddEncumbrance(ctx contractapi.TransactionContextInterface, titleNumber string, encumbrance string) error {
	title, err := c.QueryTitle(ctx, titleNumber)
	if err != nil {
		return err
	}

	title.Encumbrances = append(title.Encumbrances, encumbrance)
	title.EncumbranceStatus = "Encumbered"
	title.UpdatedAt = time.Now()

	titleBytes, err := json.Marshal(title)
	if err != nil {
		return fmt.Errorf("failed to marshal title: %v", err)
	}

	return ctx.GetStub().PutState(title.TitleNumber, titleBytes)
}

// RemoveEncumbrance removes an encumbrance from a title
func (c *TitleTransferContract) RemoveEncumbrance(ctx contractapi.TransactionContextInterface, titleNumber string, encumbrance string) error {
	title, err := c.QueryTitle(ctx, titleNumber)
	if err != nil {
		return err
	}

	// Remove encumbrance from list
	var newEncumbrances []string
	for _, enc := range title.Encumbrances {
		if enc != encumbrance {
			newEncumbrances = append(newEncumbrances, enc)
		}
	}

	title.Encumbrances = newEncumbrances
	if len(newEncumbrances) == 0 {
		title.EncumbranceStatus = "Clear"
	}
	title.UpdatedAt = time.Now()

	titleBytes, err := json.Marshal(title)
	if err != nil {
		return fmt.Errorf("failed to marshal title: %v", err)
	}

	return ctx.GetStub().PutState(title.TitleNumber, titleBytes)
}

func main() {
	chaincode, err := contractapi.NewChaincode(&TitleTransferContract{})
	if err != nil {
		fmt.Printf("Error creating title transfer chaincode: %v\n", err)
		return
	}

	if err := chaincode.Start(); err != nil {
		fmt.Printf("Error starting title transfer chaincode: %v\n", err)
	}
}
