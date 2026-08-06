package main

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"sync/atomic"
	"time"
)

type inboundEvent struct {
	EventKey        string          `json:"eventKey"`
	AccountKey      string          `json:"accountKey"`
	ProductKey      string          `json:"productKey"`
	EventType       string          `json:"eventType"`
	Purpose         string          `json:"purpose"`
	SourceReference string          `json:"sourceReference"`
	OccurredAt      time.Time       `json:"occurredAt"`
	Payload         json.RawMessage `json:"payload"`
}
type envelope struct {
	IdempotencyKey string       `json:"idempotencyKey"`
	Data           inboundEvent `json:"data"`
	PublishedAt    time.Time    `json:"publishedAt"`
}

var accepted atomic.Uint64
var denied atomic.Uint64
var published atomic.Uint64
var allowedProducts = map[string]bool{"registry-operations-cloud": true, "right-of-way-manager": true, "valuation-tax-operations": true, "acquisition-intelligence": true, "resilience-exposure-monitor": true, "property-data-api": true, "planning-analytics": true, "rural-agribusiness-hub": true, "trusted-service-directory": true, "stakeholder-journey-engine": true}
var allowedTypes = map[string]bool{"workflow.created": true, "workflow.reviewed": true, "workflow.closed": true, "evidence.recorded": true, "consent.recorded": true, "exposure.snapshot": true, "api.usage": true, "planning.report": true, "billing.usage": true}

func required(name string) string {
	v := strings.TrimSpace(os.Getenv(name))
	if v == "" {
		log.Fatalf("%s is required", name)
	}
	return v
}
func main() {
	secret := []byte(required("PORTFOLIO_INTEGRATION_SECRET"))
	if len(secret) < 32 {
		log.Fatal("PORTFOLIO_INTEGRATION_SECRET must be at least 32 characters")
	}
	if strings.TrimSpace(os.Getenv("DAPR_PORTFOLIO_PUBLISH_URL")) == "" {
		log.Fatal("DAPR_PORTFOLIO_PUBLISH_URL is required; middleware event delivery must not silently no-op")
	}
	mux := http.NewServeMux()
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, 200, map[string]any{"status": "healthy", "service": "portfolio-integration-gateway"})
	})
	mux.HandleFunc("/ready", func(w http.ResponseWriter, r *http.Request) { writeJSON(w, 200, map[string]any{"status": "ready"}) })
	mux.HandleFunc("/metrics", metrics)
	mux.HandleFunc("/v1/events", eventHandler(secret))
	port := os.Getenv("PORT")
	if port == "" {
		port = "8096"
	}
	s := &http.Server{Addr: ":" + port, Handler: requestID(mux), ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 10 * time.Second, WriteTimeout: 15 * time.Second, IdleTimeout: 60 * time.Second}
	log.Printf("portfolio integration gateway listening on %s", s.Addr)
	log.Fatal(s.ListenAndServe())
}
func eventHandler(secret []byte) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			w.Header().Set("Allow", "POST")
			http.Error(w, "method not allowed", 405)
			return
		}
		body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 256*1024))
		if err != nil {
			http.Error(w, "payload too large", 413)
			return
		}
		if err := verify(r, body, secret); err != nil {
			denied.Add(1)
			http.Error(w, "integration authentication failed", 401)
			return
		}
		var event inboundEvent
		if json.Unmarshal(body, &event) != nil || !valid(event) {
			http.Error(w, "invalid portfolio event", 400)
			return
		}
		out := envelope{IdempotencyKey: event.EventKey, Data: event, PublishedAt: time.Now().UTC()}
		if err := publish(r.Context(), out); err != nil {
			http.Error(w, "event publication unavailable", 503)
			return
		}
		accepted.Add(1)
		published.Add(1)
		writeJSON(w, 202, map[string]any{"accepted": true, "eventKey": event.EventKey})
	}
}
func valid(e inboundEvent) bool {
	return len(e.EventKey) >= 8 && len(e.EventKey) <= 96 && allowedProducts[e.ProductKey] && allowedTypes[e.EventType] && len(e.AccountKey) >= 8 && len(e.AccountKey) <= 96 && len(strings.TrimSpace(e.Purpose)) >= 3 && len(e.Purpose) <= 400 && len(strings.TrimSpace(e.SourceReference)) >= 2 && len(e.SourceReference) <= 160 && !e.OccurredAt.IsZero() && len(e.Payload) > 1 && len(e.Payload) <= 192*1024
}
func verify(r *http.Request, body, secret []byte) error {
	ts := r.Header.Get("X-Portfolio-Timestamp")
	sig := r.Header.Get("X-Portfolio-Signature")
	if ts == "" || sig == "" {
		return errors.New("missing signature")
	}
	t, err := time.Parse(time.RFC3339, ts)
	if err != nil || time.Since(t) > 5*time.Minute || t.After(time.Now().Add(time.Minute)) {
		return errors.New("invalid timestamp")
	}
	mac := hmac.New(sha256.New, secret)
	mac.Write([]byte(ts))
	mac.Write([]byte("."))
	mac.Write(body)
	expected := hex.EncodeToString(mac.Sum(nil))
	if len(sig) != len(expected) || subtle.ConstantTimeCompare([]byte(sig), []byte(expected)) != 1 {
		return errors.New("invalid signature")
	}
	return nil
}
func publish(ctx context.Context, event envelope) error {
	endpoint := strings.TrimSpace(os.Getenv("DAPR_PORTFOLIO_PUBLISH_URL"))
	if endpoint == "" {
		return errors.New("DAPR_PORTFOLIO_PUBLISH_URL is required")
	}
	raw, err := json.Marshal(event)
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, "POST", endpoint, bytes.NewReader(raw))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("ce-type", "portfolio.event.v1")
	client := &http.Client{Timeout: 5 * time.Second}
	res, err := client.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode < 200 || res.StatusCode > 299 {
		return fmt.Errorf("dapr publish status %d", res.StatusCode)
	}
	return nil
}
func metrics(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/plain; version=0.0.4")
	fmt.Fprintf(w, "portfolio_integration_events_accepted_total %d\nportfolio_integration_events_denied_total %d\nportfolio_integration_events_published_total %d\n", accepted.Load(), denied.Load(), published.Load())
}
func writeJSON(w http.ResponseWriter, status int, p any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(p)
}
func requestID(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("X-Request-Id") == "" {
			r.Header.Set("X-Request-Id", fmt.Sprintf("portfolio-%d", time.Now().UnixNano()))
		}
		next.ServeHTTP(w, r)
	})
}
