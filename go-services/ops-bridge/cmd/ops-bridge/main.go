package main

import (
	"encoding/json"
	"net"
	"net/http"
	"os"
	"strings"
	"time"
)

type ServiceHealth struct {
	Name       string `json:"name"`
	Configured bool   `json:"configured"`
	Reachable  bool   `json:"reachable"`
	Message    string `json:"message,omitempty"`
}

type HealthResponse struct {
	Status   string          `json:"status"`
	Services []ServiceHealth `json:"services"`
}

type ReadinessDomain struct {
	Name    string          `json:"name"`
	Status  string          `json:"status"`
	Score   int             `json:"score"`
	Summary string          `json:"summary"`
	Items   []ServiceHealth `json:"items"`
}

type SyntheticJourney struct {
	Name         string   `json:"name"`
	Status       string   `json:"status"`
	Score        int      `json:"score"`
	Dependencies []string `json:"dependencies"`
}

type ReadinessResponse struct {
	GeneratedAt string             `json:"generatedAt"`
	Overall     string             `json:"overall"`
	Domains     []ReadinessDomain  `json:"domains"`
	Journeys    []SyntheticJourney `json:"journeys"`
}

func main() {
	mux := http.NewServeMux()
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		services := collectHealth()
		status := overallStatus(services)
		writeJSON(w, http.StatusOK, HealthResponse{Status: status, Services: services})
	})

	mux.HandleFunc("/readiness", func(w http.ResponseWriter, r *http.Request) {
		services := collectHealth()
		readiness := buildReadiness(services)
		writeJSON(w, http.StatusOK, readiness)
	})

	mux.HandleFunc("/synthetic", func(w http.ResponseWriter, r *http.Request) {
		services := collectHealth()
		readiness := buildReadiness(services)
		writeJSON(w, http.StatusOK, map[string]any{
			"generatedAt": readiness.GeneratedAt,
			"overall":     readiness.Overall,
			"journeys":    readiness.Journeys,
		})
	})

	mux.HandleFunc("/check/", func(w http.ResponseWriter, r *http.Request) {
		service := strings.TrimPrefix(r.URL.Path, "/check/")
		for _, svc := range collectHealth() {
			if svc.Name == service {
				writeJSON(w, http.StatusOK, svc)
				return
			}
		}
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "unknown service"})
	})

	port := os.Getenv("PORT")
	if port == "" {
		port = "7011"
	}
	_ = http.ListenAndServe(":"+port, mux)
}

func collectHealth() []ServiceHealth {
	return []ServiceHealth{
		checkTCP("postgres", firstNonEmpty(os.Getenv("POSTGRES_TCP_ADDR"), hostPortFromDSN(firstNonEmpty(os.Getenv("POSTGRES_URL"), os.Getenv("DATABASE_URL"))))),
		checkTCP("redis", firstNonEmpty(os.Getenv("REDIS_TCP_ADDR"), hostPortFromRedisURL(os.Getenv("REDIS_URL")))),
		checkTCP("tigerbeetle", os.Getenv("TIGERBEETLE_GRPC_URL")),
		checkTCP("temporal", os.Getenv("TEMPORAL_ADDRESS")),
	}
}

func overallStatus(services []ServiceHealth) string {
	for _, svc := range services {
		if svc.Configured && !svc.Reachable {
			return "degraded"
		}
	}
	return "healthy"
}

func buildReadiness(services []ServiceHealth) ReadinessResponse {
	data := ReadinessResponse{
		GeneratedAt: time.Now().UTC().Format(time.RFC3339),
		Overall:     overallStatus(services),
	}

	data.Domains = []ReadinessDomain{
		summarizeDomain("Data Plane", filterServices(services, "postgres", "redis")),
		summarizeDomain("Workflow Plane", filterServices(services, "temporal")),
		summarizeDomain("Settlement Plane", filterServices(services, "tigerbeetle")),
	}
	data.Journeys = []SyntheticJourney{
		buildJourney("Field sync recovery", []string{"Workflow Plane", "Data Plane"}, data.Domains),
		buildJourney("Settlement confirmation", []string{"Settlement Plane", "Workflow Plane"}, data.Domains),
		buildJourney("Operational recovery", []string{"Data Plane"}, data.Domains),
	}

	return data
}

func filterServices(services []ServiceHealth, names ...string) []ServiceHealth {
	allowed := make(map[string]struct{}, len(names))
	for _, name := range names {
		allowed[name] = struct{}{}
	}
	filtered := make([]ServiceHealth, 0, len(names))
	for _, svc := range services {
		if _, ok := allowed[svc.Name]; ok {
			filtered = append(filtered, svc)
		}
	}
	return filtered
}

func summarizeDomain(name string, items []ServiceHealth) ReadinessDomain {
	if len(items) == 0 {
		return ReadinessDomain{Name: name, Status: "degraded", Score: 40, Summary: name + " has no configured dependencies.", Items: items}
	}

	score := 0
	unreachable := 0
	for _, item := range items {
		score += serviceScore(item)
		if item.Configured && !item.Reachable {
			unreachable++
		}
	}
	score = score / len(items)
	status := normalizeStatus(score)
	summary := name + " is healthy and responsive."
	if unreachable > 0 {
		summary = name + " has dependency degradation that needs operator review."
	}
	return ReadinessDomain{Name: name, Status: status, Score: score, Summary: summary, Items: items}
}

func buildJourney(name string, dependencies []string, domains []ReadinessDomain) SyntheticJourney {
	score := 0
	matched := 0
	for _, dependency := range dependencies {
		for _, domain := range domains {
			if domain.Name == dependency {
				score += domain.Score
				matched++
			}
		}
	}
	if matched == 0 {
		score = 40
	} else {
		score = score / matched
	}
	return SyntheticJourney{Name: name, Status: journeyStatus(score), Score: score, Dependencies: dependencies}
}

func serviceScore(svc ServiceHealth) int {
	if !svc.Configured {
		return 35
	}
	if svc.Reachable {
		return 100
	}
	return 20
}

func normalizeStatus(score int) string {
	if score >= 80 {
		return "healthy"
	}
	if score >= 50 {
		return "degraded"
	}
	return "unhealthy"
}

func journeyStatus(score int) string {
	if score >= 80 {
		return "passing"
	}
	if score >= 50 {
		return "warning"
	}
	return "failing"
}

func firstNonEmpty(values ...string) string {
	for _, v := range values {
		if strings.TrimSpace(v) != "" {
			return v
		}
	}
	return ""
}

func hostPortFromDSN(dsn string) string {
	if dsn == "" {
		return ""
	}
	trimmed := strings.TrimPrefix(strings.TrimPrefix(dsn, "postgresql://"), "postgres://")
	parts := strings.SplitN(trimmed, "@", 2)
	if len(parts) == 2 {
		trimmed = parts[1]
	}
	hostPart := strings.SplitN(trimmed, "/", 2)[0]
	return hostPart
}

func hostPortFromRedisURL(url string) string {
	if url == "" {
		return ""
	}
	trimmed := strings.TrimPrefix(url, "redis://")
	trimmed = strings.TrimPrefix(trimmed, "rediss://")
	parts := strings.SplitN(trimmed, "@", 2)
	if len(parts) == 2 {
		trimmed = parts[1]
	}
	hostPart := strings.SplitN(trimmed, "/", 2)[0]
	return hostPart
}

func checkTCP(name, address string) ServiceHealth {
	if strings.TrimSpace(address) == "" {
		return ServiceHealth{Name: name, Configured: false, Reachable: false, Message: strings.ToUpper(name) + " endpoint not configured"}
	}
	if strings.Contains(address, "://") {
		parts := strings.SplitN(address, "://", 2)
		address = parts[1]
	}
	conn, err := net.DialTimeout("tcp", address, 3*time.Second)
	if err != nil {
		return ServiceHealth{Name: name, Configured: true, Reachable: false, Message: err.Error()}
	}
	_ = conn.Close()
	return ServiceHealth{Name: name, Configured: true, Reachable: true}
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}
