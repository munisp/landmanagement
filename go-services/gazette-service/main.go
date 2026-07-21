// Federal Government Gazette Publication Service
// Manages gazette notices for land-related legal publications.
// Implements Nigeria Official Gazette Act Cap O4 LFN 2004.
package main

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"
)

type GazetteNotice struct {
	GNN             string     `json:"gnn"`
	NoticeType      string     `json:"noticeType"`
	Status          string     `json:"status"`
	StateCode       string     `json:"stateCode"`
	Title           string     `json:"title"`
	Description     string     `json:"description,omitempty"`
	AuthorizedBy    string     `json:"authorizedBy"`
	AuthorizerTitle string     `json:"authorizerTitle"`
	ParcelIDs       []string   `json:"parcelIds"`
	SubmittedBy     int        `json:"submittedBy"`
	SubmittedAt     time.Time  `json:"submittedAt"`
	PublishedAt     *time.Time `json:"publishedAt,omitempty"`
	GazetteVolume   string     `json:"gazetteVolume,omitempty"`
	GazettePage     int        `json:"gazettePage,omitempty"`
	LegallyBinding  bool       `json:"legallyBinding"`
	LegalBasis      string     `json:"legalBasis,omitempty"`
	EffectiveDate   string     `json:"effectiveDate,omitempty"`
}

var (
	notices = make(map[string]*GazetteNotice)
	mu      sync.RWMutex
)

func generateGNN(stateCode string) string {
	b := make([]byte, 4)
	rand.Read(b)
	year := time.Now().Year()
	return fmt.Sprintf("GNN-%s-%d-%s", strings.ToUpper(stateCode), year, strings.ToUpper(hex.EncodeToString(b)))
}

func submitHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var notice GazetteNotice
	if err := json.NewDecoder(r.Body).Decode(&notice); err != nil {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}
	notice.GNN = generateGNN(notice.StateCode)
	notice.Status = "PENDING"
	notice.SubmittedAt = time.Now()
	notice.LegallyBinding = false
	mu.Lock()
	notices[notice.GNN] = &notice
	mu.Unlock()
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"gnn": notice.GNN, "status": "PENDING",
		"message": "Gazette notice submitted for review",
	})
}

func getNoticeHandler(w http.ResponseWriter, r *http.Request) {
	gnn := strings.TrimPrefix(r.URL.Path, "/gazette/")
	mu.RLock()
	notice, ok := notices[gnn]
	mu.RUnlock()
	if !ok {
		http.Error(w, `{"error":"Notice not found"}`, http.StatusNotFound)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(notice)
}

func pendingHandler(w http.ResponseWriter, r *http.Request) {
	mu.RLock()
	var pending []*GazetteNotice
	for _, n := range notices {
		if n.Status == "PENDING" {
			pending = append(pending, n)
		}
	}
	mu.RUnlock()
	if pending == nil {
		pending = []*GazetteNotice{}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"notices": pending, "count": len(pending)})
}

type ConfirmRequest struct {
	GNN    string `json:"gnn"`
	Volume string `json:"volume"`
	Page   int    `json:"page"`
}

func confirmHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req ConfirmRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}
	mu.Lock()
	notice, ok := notices[req.GNN]
	if ok {
		now := time.Now()
		notice.Status = "PUBLISHED"
		notice.PublishedAt = &now
		notice.GazetteVolume = req.Volume
		notice.GazettePage = req.Page
		notice.LegallyBinding = true
	}
	mu.Unlock()
	if !ok {
		http.Error(w, `{"error":"Notice not found"}`, http.StatusNotFound)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"gnn": req.GNN, "status": "PUBLISHED",
		"legallyBinding": true,
		"message": "Gazette notice published and is now legally binding",
	})
}

func healthHandler(w http.ResponseWriter, r *http.Request) {
	mu.RLock()
	count := len(notices)
	mu.RUnlock()
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status": "healthy", "service": "gazette-service",
		"noticeCount": count, "timestamp": time.Now(),
	})
}

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8093"
	}
	mux := http.NewServeMux()
	mux.HandleFunc("/health", healthHandler)
	mux.HandleFunc("/gazette/submit", submitHandler)
	mux.HandleFunc("/gazette/pending", pendingHandler)
	mux.HandleFunc("/gazette/confirm", confirmHandler)
	mux.HandleFunc("/gazette/", getNoticeHandler)
	log.Printf("Gazette Service listening on :%s", port)
	if err := http.ListenAndServe(":"+port, mux); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}
