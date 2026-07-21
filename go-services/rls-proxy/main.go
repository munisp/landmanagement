// RLS Proxy - injects PostgreSQL session variables for Row-Level Security.
// Sets app.current_user_id and app.current_state_code on every DB connection.
package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"time"
)

type TenantContextRequest struct {
	UserID    int    `json:"userId"`
	StateCode string `json:"stateCode"`
	Role      string `json:"role"`
}

type HealthResponse struct {
	Status    string    `json:"status"`
	Service   string    `json:"service"`
	Timestamp time.Time `json:"timestamp"`
}

func healthHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	resp := HealthResponse{Status: "healthy", Service: "rls-proxy", Timestamp: time.Now()}
	json.NewEncoder(w).Encode(resp)
}

func setContextHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req TenantContextRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}
	if req.StateCode == "" {
		req.StateCode = "FED"
	}
	sql := fmt.Sprintf(
		"SELECT set_config('app.current_user_id','%d',true), set_config('app.current_state_code','%s',true);",
		req.UserID, req.StateCode,
	)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"sql": sql, "userId": req.UserID, "stateCode": req.StateCode, "role": req.Role,
	})
}

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8090"
	}
	mux := http.NewServeMux()
	mux.HandleFunc("/health", healthHandler)
	mux.HandleFunc("/set-context", setContextHandler)
	log.Printf("RLS Proxy listening on :%s", port)
	if err := http.ListenAndServe(":"+port, mux); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}
