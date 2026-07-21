package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
)

// ComplianceCheckRequest is the input for a compliance check.
type ComplianceCheckRequest struct {
	EntityID   int    `json:"entityId"`
	SectorType string `json:"sectorType"`
}

// ComplianceResult is the output of a compliance check.
type ComplianceResult struct {
	EntityID    int    `json:"entityId"`
	SectorType  string `json:"sectorType"`
	IsCompliant bool   `json:"isCompliant"`
	RiskScore   int    `json:"riskScore"`
	Violations  []string `json:"violations"`
}

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8086"
	}

	mux := http.NewServeMux()

	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
	})

	mux.HandleFunc("/check-compliance", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		var req ComplianceCheckRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		// Sector-specific risk scoring
		// In production, this queries the DB for EIA status, violations, etc.
		riskScore := 10
		violations := []string{}
		isCompliant := true

		switch req.SectorType {
		case "oil_gas":
			riskScore = 70
			violations = append(violations, "Gas flaring above threshold")
			isCompliant = false
		case "mining":
			riskScore = 40
		case "forestry":
			riskScore = 30
		}

		result := ComplianceResult{
			EntityID:    req.EntityID,
			SectorType:  req.SectorType,
			IsCompliant: isCompliant,
			RiskScore:   riskScore,
			Violations:  violations,
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(result)
	})

	mux.HandleFunc("/emit-eia-alert", func(w http.ResponseWriter, r *http.Request) {
		// In production, this emits a Kafka event for EIA expiry alerts
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "alert emitted"})
	})

	log.Printf("Sector compliance service starting on port %s", port)
	if err := http.ListenAndServe(fmt.Sprintf(":%s", port), mux); err != nil {
		log.Fatal(err)
	}
}
