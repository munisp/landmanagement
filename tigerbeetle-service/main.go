package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"net"
	"os"
	"os/signal"
	"syscall"
	"time"

	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/health"
	"google.golang.org/grpc/health/grpc_health_v1"
	"google.golang.org/grpc/reflection"
	"google.golang.org/grpc/status"

	pb "github.com/idlr-pts/tigerbeetle-service/proto"
	tb "github.com/tigerbeetle/tigerbeetle-go"
	"github.com/tigerbeetle/tigerbeetle-go/pkg/types"
)

var (
	port              = flag.Int("port", 50051, "The server port")
	tigerBeetleAddr   = flag.String("tigerbeetle-addr", "3000", "TigerBeetle cluster address")
	tigerBeetleCluster = flag.Uint("tigerbeetle-cluster", 0, "TigerBeetle cluster ID")
)

// server implements the LedgerService gRPC server
type server struct {
	pb.UnimplementedLedgerServiceServer
	client tb.Client
}

// NewServer creates a new LedgerService server
func NewServer(client tb.Client) *server {
	return &server{
		client: client,
	}
}

// CreateAccount creates a new account in the ledger
func (s *server) CreateAccount(ctx context.Context, req *pb.CreateAccountRequest) (*pb.CreateAccountResponse, error) {
	log.Printf("CreateAccount: account_id=%s, ledger_id=%d, code=%d, type=%v",
		req.AccountId, req.LedgerId, req.Code, req.Type)

	// Parse account ID (UUID)
	accountID, err := parseUUID(req.AccountId)
	if err != nil {
		return &pb.CreateAccountResponse{
			Success: false,
			Error:   fmt.Sprintf("invalid account_id: %v", err),
		}, nil
	}

	// Parse user data
	userData, err := parseUserData(req.UserData_128)
	if err != nil {
		return &pb.CreateAccountResponse{
			Success: false,
			Error:   fmt.Sprintf("invalid user_data: %v", err),
		}, nil
	}

	// Map account type to TigerBeetle flags
	flags := accountTypeToFlags(req.Type)

	// Create TigerBeetle account
	account := types.Account{
		ID:             accountID,
		UserData128:    userData,
		UserData64:     0,
		UserData32:     0,
		Ledger:         req.LedgerId,
		Code:           uint16(req.Code),
		Flags:          flags,
		DebitsPending:  0,
		DebitsPosted:   0,
		CreditsPending: 0,
		CreditsPosted:  0,
		Timestamp:      0, // TigerBeetle will set this
	}

	// Submit account creation
	result, err := s.client.CreateAccounts([]types.Account{account})
	if err != nil {
		return &pb.CreateAccountResponse{
			Success: false,
			Error:   fmt.Sprintf("failed to create account: %v", err),
		}, nil
	}

	// Check for errors
	if len(result) > 0 {
		return &pb.CreateAccountResponse{
			Success: false,
			Error:   fmt.Sprintf("account creation failed: %v", result[0].Result),
		}, nil
	}

	// Return success
	return &pb.CreateAccountResponse{
		Success: true,
		Account: &pb.Account{
			AccountId:       req.AccountId,
			LedgerId:        req.LedgerId,
			Code:            req.Code,
			Type:            req.Type,
			DebitsPosted:    0,
			CreditsPosted:   0,
			DebitsPending:   0,
			CreditsPending:  0,
			UserData_128:    req.UserData_128,
			Timestamp:       time.Now().UnixNano(),
		},
	}, nil
}

// GetAccount retrieves account details
func (s *server) GetAccount(ctx context.Context, req *pb.GetAccountRequest) (*pb.GetAccountResponse, error) {
	log.Printf("GetAccount: account_id=%s", req.AccountId)

	accountID, err := parseUUID(req.AccountId)
	if err != nil {
		return &pb.GetAccountResponse{
			Success: false,
			Error:   fmt.Sprintf("invalid account_id: %v", err),
		}, nil
	}

	// Lookup account
	accounts, err := s.client.LookupAccounts([]types.Uint128{accountID})
	if err != nil {
		return &pb.GetAccountResponse{
			Success: false,
			Error:   fmt.Sprintf("failed to lookup account: %v", err),
		}, nil
	}

	if len(accounts) == 0 {
		return &pb.GetAccountResponse{
			Success: false,
			Error:   "account not found",
		}, nil
	}

	account := accounts[0]
	accountType := flagsToAccountType(account.Flags)

	return &pb.GetAccountResponse{
		Success: true,
		Account: &pb.Account{
			AccountId:       req.AccountId,
			LedgerId:        account.Ledger,
			Code:            uint32(account.Code),
			Type:            accountType,
			DebitsPosted:    int64(account.DebitsPosted),
			CreditsPosted:   int64(account.CreditsPosted),
			DebitsPending:   int64(account.DebitsPending),
			CreditsPending:  int64(account.CreditsPending),
			UserData_128:    formatUserData(account.UserData128),
			Timestamp:       int64(account.Timestamp),
		},
	}, nil
}

// GetAccountBalance retrieves account balance
func (s *server) GetAccountBalance(ctx context.Context, req *pb.GetAccountBalanceRequest) (*pb.GetAccountBalanceResponse, error) {
	log.Printf("GetAccountBalance: account_id=%s", req.AccountId)

	accountID, err := parseUUID(req.AccountId)
	if err != nil {
		return &pb.GetAccountBalanceResponse{
			Success: false,
			Error:   fmt.Sprintf("invalid account_id: %v", err),
		}, nil
	}

	accounts, err := s.client.LookupAccounts([]types.Uint128{accountID})
	if err != nil {
		return &pb.GetAccountBalanceResponse{
			Success: false,
			Error:   fmt.Sprintf("failed to lookup account: %v", err),
		}, nil
	}

	if len(accounts) == 0 {
		return &pb.GetAccountBalanceResponse{
			Success: false,
			Error:   "account not found",
		}, nil
	}

	account := accounts[0]
	balance := int64(account.CreditsPosted) - int64(account.DebitsPosted)

	return &pb.GetAccountBalanceResponse{
		Success:         true,
		DebitsPosted:    int64(account.DebitsPosted),
		CreditsPosted:   int64(account.CreditsPosted),
		DebitsPending:   int64(account.DebitsPending),
		CreditsPending:  int64(account.CreditsPending),
		Balance:         balance,
	}, nil
}

// CreateTransfer creates an immediate transfer
func (s *server) CreateTransfer(ctx context.Context, req *pb.CreateTransferRequest) (*pb.CreateTransferResponse, error) {
	log.Printf("CreateTransfer: transfer_id=%s, debit=%s, credit=%s, amount=%d",
		req.TransferId, req.DebitAccountId, req.CreditAccountId, req.Amount)

	transferID, err := parseUUID(req.TransferId)
	if err != nil {
		return &pb.CreateTransferResponse{
			Success: false,
			Error:   fmt.Sprintf("invalid transfer_id: %v", err),
		}, nil
	}

	debitAccountID, err := parseUUID(req.DebitAccountId)
	if err != nil {
		return &pb.CreateTransferResponse{
			Success: false,
			Error:   fmt.Sprintf("invalid debit_account_id: %v", err),
		}, nil
	}

	creditAccountID, err := parseUUID(req.CreditAccountId)
	if err != nil {
		return &pb.CreateTransferResponse{
			Success: false,
			Error:   fmt.Sprintf("invalid credit_account_id: %v", err),
		}, nil
	}

	userData, err := parseUserData(req.UserData_128)
	if err != nil {
		return &pb.CreateTransferResponse{
			Success: false,
			Error:   fmt.Sprintf("invalid user_data: %v", err),
		}, nil
	}

	transfer := types.Transfer{
		ID:              transferID,
		DebitAccountID:  debitAccountID,
		CreditAccountID: creditAccountID,
		Amount:          types.ToUint128(uint64(req.Amount)),
		UserData128:     userData,
		UserData64:      0,
		UserData32:      0,
		Timeout:         uint32(req.Timeout),
		Ledger:          req.LedgerId,
		Code:            uint16(req.Code),
		Flags:           0, // Immediate transfer
		Timestamp:       0,
	}

	result, err := s.client.CreateTransfers([]types.Transfer{transfer})
	if err != nil {
		return &pb.CreateTransferResponse{
			Success: false,
			Error:   fmt.Sprintf("failed to create transfer: %v", err),
		}, nil
	}

	if len(result) > 0 {
		return &pb.CreateTransferResponse{
			Success: false,
			Error:   fmt.Sprintf("transfer creation failed: %v", result[0].Result),
		}, nil
	}

	return &pb.CreateTransferResponse{
		Success: true,
		Transfer: &pb.Transfer{
			TransferId:       req.TransferId,
			DebitAccountId:   req.DebitAccountId,
			CreditAccountId:  req.CreditAccountId,
			Amount:           req.Amount,
			LedgerId:         req.LedgerId,
			Code:             req.Code,
			Status:           pb.TransferStatus_TRANSFER_STATUS_POSTED,
			UserData_128:     req.UserData_128,
			Timestamp:        time.Now().UnixNano(),
		},
	}, nil
}

// CreatePendingTransfer creates a two-phase transfer (pending)
func (s *server) CreatePendingTransfer(ctx context.Context, req *pb.CreatePendingTransferRequest) (*pb.CreatePendingTransferResponse, error) {
	log.Printf("CreatePendingTransfer: transfer_id=%s, amount=%d", req.TransferId, req.Amount)

	transferID, err := parseUUID(req.TransferId)
	if err != nil {
		return &pb.CreatePendingTransferResponse{
			Success: false,
			Error:   fmt.Sprintf("invalid transfer_id: %v", err),
		}, nil
	}

	debitAccountID, err := parseUUID(req.DebitAccountId)
	if err != nil {
		return &pb.CreatePendingTransferResponse{
			Success: false,
			Error:   fmt.Sprintf("invalid debit_account_id: %v", err),
		}, nil
	}

	creditAccountID, err := parseUUID(req.CreditAccountId)
	if err != nil {
		return &pb.CreatePendingTransferResponse{
			Success: false,
			Error:   fmt.Sprintf("invalid credit_account_id: %v", err),
		}, nil
	}

	userData, err := parseUserData(req.UserData_128)
	if err != nil {
		return &pb.CreatePendingTransferResponse{
			Success: false,
			Error:   fmt.Sprintf("invalid user_data: %v", err),
		}, nil
	}

	transfer := types.Transfer{
		ID:              transferID,
		DebitAccountID:  debitAccountID,
		CreditAccountID: creditAccountID,
		Amount:          types.ToUint128(uint64(req.Amount)),
		UserData128:     userData,
		UserData64:      0,
		UserData32:      0,
		Timeout:         uint32(req.Timeout),
		Ledger:          req.LedgerId,
		Code:            uint16(req.Code),
		Flags:           types.TransferFlags{Pending: true}.ToUint16(), // Pending flag
		Timestamp:       0,
	}

	result, err := s.client.CreateTransfers([]types.Transfer{transfer})
	if err != nil {
		return &pb.CreatePendingTransferResponse{
			Success: false,
			Error:   fmt.Sprintf("failed to create pending transfer: %v", err),
		}, nil
	}

	if len(result) > 0 {
		return &pb.CreatePendingTransferResponse{
			Success: false,
			Error:   fmt.Sprintf("pending transfer creation failed: %v", result[0].Result),
		}, nil
	}

	return &pb.CreatePendingTransferResponse{
		Success: true,
		Transfer: &pb.Transfer{
			TransferId:       req.TransferId,
			DebitAccountId:   req.DebitAccountId,
			CreditAccountId:  req.CreditAccountId,
			Amount:           req.Amount,
			LedgerId:         req.LedgerId,
			Code:             req.Code,
			Status:           pb.TransferStatus_TRANSFER_STATUS_PENDING,
			UserData_128:     req.UserData_128,
			Timestamp:        time.Now().UnixNano(),
		},
	}, nil
}

// PostPendingTransfer commits a pending transfer
func (s *server) PostPendingTransfer(ctx context.Context, req *pb.PostPendingTransferRequest) (*pb.PostPendingTransferResponse, error) {
	log.Printf("PostPendingTransfer: transfer_id=%s", req.TransferId)

	transferID, err := parseUUID(req.TransferId)
	if err != nil {
		return &pb.PostPendingTransferResponse{
			Success: false,
			Error:   fmt.Sprintf("invalid transfer_id: %v", err),
		}, nil
	}

	// Create a post-pending transfer (commits the pending transfer)
	postTransfer := types.Transfer{
		ID:              types.ToUint128(0), // New ID for the post operation
		PendingID:       transferID,
		Flags:           types.TransferFlags{PostPendingTransfer: true}.ToUint16(),
		Timestamp:       0,
	}

	result, err := s.client.CreateTransfers([]types.Transfer{postTransfer})
	if err != nil {
		return &pb.PostPendingTransferResponse{
			Success: false,
			Error:   fmt.Sprintf("failed to post pending transfer: %v", err),
		}, nil
	}

	if len(result) > 0 {
		return &pb.PostPendingTransferResponse{
			Success: false,
			Error:   fmt.Sprintf("post pending transfer failed: %v", result[0].Result),
		}, nil
	}

	return &pb.PostPendingTransferResponse{
		Success: true,
	}, nil
}

// VoidPendingTransfer cancels a pending transfer
func (s *server) VoidPendingTransfer(ctx context.Context, req *pb.VoidPendingTransferRequest) (*pb.VoidPendingTransferResponse, error) {
	log.Printf("VoidPendingTransfer: transfer_id=%s", req.TransferId)

	transferID, err := parseUUID(req.TransferId)
	if err != nil {
		return &pb.VoidPendingTransferResponse{
			Success: false,
			Error:   fmt.Sprintf("invalid transfer_id: %v", err),
		}, nil
	}

	// Create a void-pending transfer (cancels the pending transfer)
	voidTransfer := types.Transfer{
		ID:              types.ToUint128(0), // New ID for the void operation
		PendingID:       transferID,
		Flags:           types.TransferFlags{VoidPendingTransfer: true}.ToUint16(),
		Timestamp:       0,
	}

	result, err := s.client.CreateTransfers([]types.Transfer{voidTransfer})
	if err != nil {
		return &pb.VoidPendingTransferResponse{
			Success: false,
			Error:   fmt.Sprintf("failed to void pending transfer: %v", err),
		}, nil
	}

	if len(result) > 0 {
		return &pb.VoidPendingTransferResponse{
			Success: false,
			Error:   fmt.Sprintf("void pending transfer failed: %v", result[0].Result),
		}, nil
	}

	return &pb.VoidPendingTransferResponse{
		Success: true,
	}, nil
}

// ReconcilePayment reconciles a Mojaloop payment with blockchain transaction
func (s *server) ReconcilePayment(ctx context.Context, req *pb.ReconcilePaymentRequest) (*pb.ReconcilePaymentResponse, error) {
	log.Printf("ReconcilePayment: payment_id=%s, tx_hash=%s, amount=%d",
		req.PaymentId, req.TransactionHash, req.Amount)

	// Generate transfer ID from payment ID
	transferID, err := generateUUIDFromString(req.PaymentId)
	if err != nil {
		return &pb.ReconcilePaymentResponse{
			Success: false,
			Error:   fmt.Sprintf("failed to generate transfer_id: %v", err),
		}, nil
	}

	debitAccountID, err := parseUUID(req.DebitAccountId)
	if err != nil {
		return &pb.ReconcilePaymentResponse{
			Success: false,
			Error:   fmt.Sprintf("invalid debit_account_id: %v", err),
		}, nil
	}

	creditAccountID, err := parseUUID(req.CreditAccountId)
	if err != nil {
		return &pb.ReconcilePaymentResponse{
			Success: false,
			Error:   fmt.Sprintf("invalid credit_account_id: %v", err),
		}, nil
	}

	// Store metadata in user_data_128
	metadata := fmt.Sprintf("payment:%s|tx:%s", req.PaymentId, req.TransactionHash)
	userData, err := parseUserData(metadata)
	if err != nil {
		return &pb.ReconcilePaymentResponse{
			Success: false,
			Error:   fmt.Sprintf("invalid metadata: %v", err),
		}, nil
	}

	transfer := types.Transfer{
		ID:              transferID,
		DebitAccountID:  debitAccountID,
		CreditAccountID: creditAccountID,
		Amount:          types.ToUint128(uint64(req.Amount)),
		UserData128:     userData,
		UserData64:      0,
		UserData32:      0,
		Timeout:         0,
		Ledger:          1, // Main ledger
		Code:            uint16(req.Code),
		Flags:           0, // Immediate transfer
		Timestamp:       0,
	}

	result, err := s.client.CreateTransfers([]types.Transfer{transfer})
	if err != nil {
		return &pb.ReconcilePaymentResponse{
			Success: false,
			Error:   fmt.Sprintf("failed to reconcile payment: %v", err),
		}, nil
	}

	if len(result) > 0 {
		return &pb.ReconcilePaymentResponse{
			Success: false,
			Error:   fmt.Sprintf("payment reconciliation failed: %v", result[0].Result),
		}, nil
	}

	return &pb.ReconcilePaymentResponse{
		Success:    true,
		TransferId: formatUUID(transferID),
		Timestamp:  time.Now().UnixNano(),
	}, nil
}

// GetTransfer retrieves transfer details
func (s *server) GetTransfer(ctx context.Context, req *pb.GetTransferRequest) (*pb.GetTransferResponse, error) {
	log.Printf("GetTransfer: transfer_id=%s", req.TransferId)

	transferID, err := parseUUID(req.TransferId)
	if err != nil {
		return &pb.GetTransferResponse{
			Success: false,
			Error:   fmt.Sprintf("invalid transfer_id: %v", err),
		}, nil
	}

	transfers, err := s.client.LookupTransfers([]types.Uint128{transferID})
	if err != nil {
		return &pb.GetTransferResponse{
			Success: false,
			Error:   fmt.Sprintf("failed to lookup transfer: %v", err),
		}, nil
	}

	if len(transfers) == 0 {
		return &pb.GetTransferResponse{
			Success: false,
			Error:   "transfer not found",
		}, nil
	}

	transfer := transfers[0]
	status := transferStatusFromFlags(transfer.Flags)

	return &pb.GetTransferResponse{
		Success: true,
		Transfer: &pb.Transfer{
			TransferId:       req.TransferId,
			DebitAccountId:   formatUUID(transfer.DebitAccountID),
			CreditAccountId:  formatUUID(transfer.CreditAccountID),
			Amount:           int64(types.BigIntFromUint128(transfer.Amount).Uint64()),
			LedgerId:         transfer.Ledger,
			Code:             uint32(transfer.Code),
			Status:           status,
			UserData_128:     formatUserData(transfer.UserData128),
			Timestamp:        int64(transfer.Timestamp),
		},
	}, nil
}

// GetAccountTransfers retrieves transfers for an account
func (s *server) GetAccountTransfers(ctx context.Context, req *pb.GetAccountTransfersRequest) (*pb.GetAccountTransfersResponse, error) {
	log.Printf("GetAccountTransfers: account_id=%s, limit=%d", req.AccountId, req.Limit)

	// Note: TigerBeetle doesn't have a direct "get transfers by account" query
	// This would need to be implemented using a secondary index or separate tracking
	// For now, return a not implemented error
	return &pb.GetAccountTransfersResponse{
		Success: false,
		Error:   "GetAccountTransfers not yet implemented - requires secondary indexing",
	}, status.Error(codes.Unimplemented, "method not implemented")
}

// GetLedgerBalance retrieves total ledger balance
func (s *server) GetLedgerBalance(ctx context.Context, req *pb.GetLedgerBalanceRequest) (*pb.GetLedgerBalanceResponse, error) {
	log.Printf("GetLedgerBalance: ledger_id=%d", req.LedgerId)

	// Note: TigerBeetle doesn't have a direct "get ledger balance" query
	// This would need to be calculated by summing all accounts in the ledger
	// For now, return a not implemented error
	return &pb.GetLedgerBalanceResponse{
		Success: false,
		Error:   "GetLedgerBalance not yet implemented - requires account aggregation",
	}, status.Error(codes.Unimplemented, "method not implemented")
}

func main() {
	flag.Parse()

	// Initialize TigerBeetle client
	log.Printf("Connecting to TigerBeetle at %s (cluster %d)...", *tigerBeetleAddr, *tigerBeetleCluster)
	
	client, err := tb.NewClient(uint128(*tigerBeetleCluster), []string{*tigerBeetleAddr}, 32)
	if err != nil {
		log.Fatalf("Failed to create TigerBeetle client: %v", err)
	}
	defer client.Close()

	log.Println("Connected to TigerBeetle successfully")

	// Create gRPC server
	lis, err := net.Listen("tcp", fmt.Sprintf(":%d", *port))
	if err != nil {
		log.Fatalf("Failed to listen: %v", err)
	}

	grpcServer := grpc.NewServer()
	
	// Register ledger service
	pb.RegisterLedgerServiceServer(grpcServer, NewServer(client))
	
	// Register health service
	healthServer := health.NewServer()
	grpc_health_v1.RegisterHealthServer(grpcServer, healthServer)
	healthServer.SetServingStatus("", grpc_health_v1.HealthCheckResponse_SERVING)
	
	// Register reflection service (for grpcurl)
	reflection.Register(grpcServer)

	log.Printf("gRPC server listening on port %d", *port)

	// Handle graceful shutdown
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, os.Interrupt, syscall.SIGTERM)

	go func() {
		<-sigCh
		log.Println("Shutting down gracefully...")
		grpcServer.GracefulStop()
	}()

	// Start server
	if err := grpcServer.Serve(lis); err != nil {
		log.Fatalf("Failed to serve: %v", err)
	}
}

// Helper function to convert UUID string to Uint128
func parseUUID(uuidStr string) (types.Uint128, error) {
	// Simple UUID parsing - in production use a proper UUID library
	// For now, use a hash of the string
	return generateUUIDFromString(uuidStr)
}

// Helper function to generate UUID from string
func generateUUIDFromString(s string) (types.Uint128, error) {
	// Use a simple hash for demo purposes
	// In production, use proper UUID v5 or similar
	hash := uint64(0)
	for _, c := range s {
		hash = hash*31 + uint64(c)
	}
	return types.ToUint128(hash), nil
}

// Helper function to format UUID
func formatUUID(id types.Uint128) string {
	return fmt.Sprintf("%d", types.BigIntFromUint128(id).Uint64())
}

// Helper function to parse user data
func parseUserData(data string) (types.Uint128, error) {
	// Store string as uint128 (simplified)
	hash := uint64(0)
	for _, c := range data {
		hash = hash*31 + uint64(c)
	}
	return types.ToUint128(hash), nil
}

// Helper function to format user data
func formatUserData(data types.Uint128) string {
	return fmt.Sprintf("%d", types.BigIntFromUint128(data).Uint64())
}

// Helper function to convert account type to flags
func accountTypeToFlags(accountType pb.AccountType) uint16 {
	switch accountType {
	case pb.AccountType_ACCOUNT_TYPE_ASSET:
		return types.AccountFlags{DebitsMustNotExceedCredits: false}.ToUint16()
	case pb.AccountType_ACCOUNT_TYPE_LIABILITY:
		return types.AccountFlags{CreditsMustNotExceedDebits: false}.ToUint16()
	case pb.AccountType_ACCOUNT_TYPE_EQUITY:
		return types.AccountFlags{CreditsMustNotExceedDebits: false}.ToUint16()
	case pb.AccountType_ACCOUNT_TYPE_REVENUE:
		return types.AccountFlags{CreditsMustNotExceedDebits: false}.ToUint16()
	case pb.AccountType_ACCOUNT_TYPE_EXPENSE:
		return types.AccountFlags{DebitsMustNotExceedCredits: false}.ToUint16()
	default:
		return 0
	}
}

// Helper function to convert flags to account type
func flagsToAccountType(flags uint16) pb.AccountType {
	// Simplified mapping - in production, store account type in user_data
	return pb.AccountType_ACCOUNT_TYPE_ASSET
}

// Helper function to get transfer status from flags
func transferStatusFromFlags(flags uint16) pb.TransferStatus {
	transferFlags := types.TransferFlags{}
	transferFlags.FromUint16(flags)
	
	if transferFlags.Pending {
		return pb.TransferStatus_TRANSFER_STATUS_PENDING
	} else if transferFlags.VoidPendingTransfer {
		return pb.TransferStatus_TRANSFER_STATUS_VOIDED
	}
	return pb.TransferStatus_TRANSFER_STATUS_POSTED
}

// Helper function to convert uint128 to uint64
func uint128(value uint64) types.Uint128 {
	return types.ToUint128(value)
}
