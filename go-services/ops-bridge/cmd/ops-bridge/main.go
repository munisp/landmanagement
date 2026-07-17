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

func main() {
	mux := http.NewServeMux()
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		services := collectHealth()
		status := "healthy"
		for _, svc := range services {
			if svc.Configured && !svc.Reachable {
				status = "degraded"
				break
			}
		}
		writeJSON(w, http.StatusOK, HealthResponse{Status: status, Services: services})
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
