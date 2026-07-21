package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
)

// ProductionReport holds a mineral production report for royalty calculation.
type ProductionReport struct {
	LicenseID       int     `json:"licenseId"`
	MineralType     string  `json:"mineralType"`
	VolumeExtracted float64 `json:"volumeExtracted"`
	Unit            string  `json:"unit"`
}

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8085"
	}

	mux := http.NewServeMux()

	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
	})

	mux.HandleFunc("/calculate-royalty", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		var report ProductionReport
		if err := json.NewDecoder(r.Body).Decode(&report); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		// Royalty calculation: 5% of market value
		// In production, market price would be fetched from a commodity pricing API
		royaltyRate := 0.05
		marketPricePerUnit := 100000.0 // NGN per tonne (simplified)
		royaltyAmount := report.VolumeExtracted * marketPricePerUnit * royaltyRate

		response := map[string]interface{}{
			"licenseId":        report.LicenseID,
			"mineralType":      report.MineralType,
			"volumeExtracted":  report.VolumeExtracted,
			"royaltyAmountNgn": royaltyAmount,
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(response)
	})

	mux.HandleFunc("/check-expiry", func(w http.ResponseWriter, r *http.Request) {
		// In production, this would query the DB for licenses expiring within 90 days
		// and emit Kafka events for renewal notifications
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"expiringLicenses": []interface{}{},
			"message":          "Expiry check completed",
		})
	})

	log.Printf("Mining registry service starting on port %s", port)
	if err := http.ListenAndServe(fmt.Sprintf(":%s", port), mux); err != nil {
		log.Fatal(err)
	}
}
