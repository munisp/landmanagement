package main

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"sort"
	"strconv"
	"strings"
	"sync/atomic"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

const (
	serviceName       = "vector-tile-service"
	capabilityIssuer  = "idlr-geospatial-platform"
	capabilityVersion = 1
	maxCapabilityTTL  = int64(600)
	maxTileCoordinate = (1 << 22) - 1
)

type capability struct {
	Issuer  string  `json:"iss"`
	Version int     `json:"ver"`
	Audience string `json:"aud"`
	Subject string  `json:"sub"`
	ID      string  `json:"jti"`
	IssuedAt int64  `json:"iat"`
	ExpiresAt int64 `json:"exp"`
	Parcels []int32 `json:"parcels"`
	Purpose string  `json:"purpose"`
}

type config struct {
	port           string
	databaseURL    string
	capabilityKey  []byte
	queryTimeout   time.Duration
	readinessLimit time.Duration
}

type metrics struct {
	tileRequests atomic.Uint64
	tileErrors   atomic.Uint64
	denied       atomic.Uint64
	latencyNanos atomic.Uint64
}

func loadConfig() (config, error) {
	secret := strings.TrimSpace(os.Getenv("GEO_DELIVERY_CAPABILITY_SECRET"))
	if len(secret) < 32 {
		return config{}, errors.New("GEO_DELIVERY_CAPABILITY_SECRET must contain at least 32 characters")
	}
	databaseURL := strings.TrimSpace(firstNonEmpty(os.Getenv("GEO_TILE_DATABASE_URL"), os.Getenv("DATABASE_URL")))
	if databaseURL == "" {
		return config{}, errors.New("GEO_TILE_DATABASE_URL or DATABASE_URL must be configured")
	}
	port := strings.TrimSpace(os.Getenv("PORT"))
	if port == "" {
		port = "7021"
	}
	return config{
		port:           port,
		databaseURL:    databaseURL,
		capabilityKey:  []byte(secret),
		queryTimeout:   durationEnv("GEO_TILE_QUERY_TIMEOUT", 8*time.Second),
		readinessLimit: durationEnv("GEO_TILE_READINESS_TIMEOUT", 2*time.Second),
	}, nil
}

func durationEnv(key string, fallback time.Duration) time.Duration {
	if raw := strings.TrimSpace(os.Getenv(key)); raw != "" {
		if parsed, err := time.ParseDuration(raw); err == nil && parsed > 0 {
			return parsed
		}
	}
	return fallback
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}

func parseCapability(token string, secret []byte, now time.Time) (capability, error) {
	parts := strings.Split(strings.TrimSpace(token), ".")
	if len(parts) != 2 || parts[0] == "" || parts[1] == "" {
		return capability{}, errors.New("invalid capability format")
	}
	providedSignature, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return capability{}, errors.New("invalid capability signature encoding")
	}
	mac := hmac.New(sha256.New, secret)
	_, _ = mac.Write([]byte(parts[0]))
	expectedSignature := mac.Sum(nil)
	if len(providedSignature) != len(expectedSignature) || subtle.ConstantTimeCompare(providedSignature, expectedSignature) != 1 {
		return capability{}, errors.New("invalid capability signature")
	}
	payload, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return capability{}, errors.New("invalid capability payload encoding")
	}
	var parsed capability
	if err := json.Unmarshal(payload, &parsed); err != nil {
		return capability{}, errors.New("invalid capability payload")
	}
	if parsed.Issuer != capabilityIssuer || parsed.Version != capabilityVersion || parsed.Audience != "vector_tiles" {
		return capability{}, errors.New("capability audience or issuer mismatch")
	}
	if parsed.Subject == "" || parsed.ID == "" || parsed.Purpose == "" || len(parsed.Parcels) == 0 || len(parsed.Parcels) > 512 {
		return capability{}, errors.New("capability contains an incomplete scope")
	}
	if parsed.IssuedAt > now.Unix()+60 || parsed.ExpiresAt <= now.Unix() || parsed.ExpiresAt-parsed.IssuedAt > maxCapabilityTTL {
		return capability{}, errors.New("capability has expired or has an invalid lifetime")
	}
	last := int32(0)
	for index, parcelID := range parsed.Parcels {
		if parcelID <= 0 || (index > 0 && parcelID <= last) {
			return capability{}, errors.New("capability parcel scope is invalid")
		}
		last = parcelID
	}
	return parsed, nil
}

func bearerToken(header string) (string, error) {
	const prefix = "Bearer "
	if !strings.HasPrefix(header, prefix) || strings.TrimSpace(strings.TrimPrefix(header, prefix)) == "" {
		return "", errors.New("missing bearer capability")
	}
	return strings.TrimSpace(strings.TrimPrefix(header, prefix)), nil
}

func parseTilePath(path string) (int, int, int, error) {
	trimmed := strings.TrimPrefix(path, "/tiles/")
	parts := strings.Split(trimmed, "/")
	if len(parts) != 3 || !strings.HasSuffix(parts[2], ".pbf") {
		return 0, 0, 0, errors.New("invalid tile path")
	}
	z, err := parseTilePart(parts[0])
	if err != nil || z > 22 {
		return 0, 0, 0, errors.New("invalid tile zoom")
	}
	x, err := parseTilePart(parts[1])
	if err != nil {
		return 0, 0, 0, errors.New("invalid tile x coordinate")
	}
	y, err := parseTilePart(strings.TrimSuffix(parts[2], ".pbf"))
	if err != nil {
		return 0, 0, 0, errors.New("invalid tile y coordinate")
	}
	matrixSize := 1 << z
	if x >= matrixSize || y >= matrixSize {
		return 0, 0, 0, errors.New("tile coordinate is outside its zoom matrix")
	}
	return z, x, y, nil
}

func parseTilePart(value string) (int, error) {
	if value == "" || len(value) > 8 {
		return 0, errors.New("invalid coordinate")
	}
	for _, char := range value {
		if char < '0' || char > '9' {
			return 0, errors.New("coordinate must be decimal")
		}
	}
	parsed, err := strconv.Atoi(value)
	if err != nil || parsed < 0 || parsed > maxTileCoordinate {
		return 0, errors.New("coordinate is outside the supported range")
	}
	return parsed, nil
}

const tileSQL = `
WITH tile_bounds AS (
  SELECT ST_TileEnvelope($1::integer, $2::integer, $3::integer) AS bbox
), source_geometry AS (
  SELECT
    id,
    parcel_id,
    parcel_number,
    status,
    land_use,
    estimated_value,
    state,
    lga,
    flood_risk_level,
    COALESCE(
      CASE
        WHEN geometry_geojson IS NOT NULL AND length(trim(geometry_geojson)) > 0
          THEN ST_SetSRID(ST_GeomFromGeoJSON(geometry_geojson), 4326)
      END,
      CASE
        WHEN longitude IS NOT NULL AND latitude IS NOT NULL
          THEN ST_SetSRID(ST_MakePoint(longitude::double precision, latitude::double precision), 4326)
      END
    ) AS geom_4326
  FROM parcels
  WHERE id = ANY($4::integer[])
), mvt_data AS (
  SELECT
    ST_AsMVTGeom(
      ST_Transform(geom_4326, 3857),
      (SELECT bbox FROM tile_bounds),
      4096,
      256,
      true
    ) AS geom,
    id,
    parcel_id,
    parcel_number,
    status,
    land_use,
    estimated_value,
    state,
    lga,
    flood_risk_level,
    GeometryType(geom_4326) AS geometry_type
  FROM source_geometry
  WHERE geom_4326 IS NOT NULL
    AND ST_Intersects(geom_4326, ST_Transform((SELECT bbox FROM tile_bounds), 4326))
)
SELECT COALESCE(ST_AsMVT(mvt_data.*, 'parcels', 4096, 'geom', 'id'), ''::bytea) AS tile
FROM mvt_data`

func main() {
	cfg, err := loadConfig()
	if err != nil {
		slog.Error("vector tile service configuration is invalid", "error", err.Error())
		os.Exit(1)
	}
	poolConfig, err := pgxpool.ParseConfig(cfg.databaseURL)
	if err != nil {
		slog.Error("vector tile database configuration is invalid", "error", err.Error())
		os.Exit(1)
	}
	poolConfig.MaxConns = int32(intEnv("GEO_TILE_DB_MAX_CONNS", 16, 1, 128))
	poolConfig.MinConns = int32(intEnv("GEO_TILE_DB_MIN_CONNS", 1, 0, 32))
	pool, err := pgxpool.NewWithConfig(context.Background(), poolConfig)
	if err != nil {
		slog.Error("vector tile database pool could not be created", "error", err.Error())
		os.Exit(1)
	}
	defer pool.Close()

	serviceMetrics := &metrics{}
	mux := http.NewServeMux()
	mux.HandleFunc("/health", healthHandler)
	mux.HandleFunc("/ready", readinessHandler(pool, cfg.readinessLimit))
	mux.HandleFunc("/metrics", metricsHandler(serviceMetrics))
	mux.HandleFunc("/tiles/", tileHandler(pool, cfg, serviceMetrics))

	server := &http.Server{
		Addr:              ":" + cfg.port,
		Handler:           securityHeaders(requestLogging(mux)),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       10 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       60 * time.Second,
	}
	slog.Info("vector tile service listening", "port", cfg.port, "service", serviceName)
	if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		slog.Error("vector tile service stopped", "error", err.Error())
		os.Exit(1)
	}
}

func intEnv(key string, fallback, minimum, maximum int) int {
	raw := strings.TrimSpace(os.Getenv(key))
	if raw == "" {
		return fallback
	}
	parsed, err := strconv.Atoi(raw)
	if err != nil || parsed < minimum || parsed > maximum {
		return fallback
	}
	return parsed
}

func healthHandler(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "healthy", "service": serviceName})
}

func readinessHandler(pool *pgxpool.Pool, timeout time.Duration) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), timeout)
		defer cancel()
		if err := pool.Ping(ctx); err != nil {
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{"status": "unready", "service": serviceName})
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": "ready", "service": serviceName})
	}
}

func metricsHandler(metric *metrics) http.HandlerFunc {
	return func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
		requests := metric.tileRequests.Load()
		latency := metric.latencyNanos.Load()
		average := float64(0)
		if requests > 0 {
			average = float64(latency) / float64(requests) / float64(time.Millisecond)
		}
		_, _ = fmt.Fprintf(w, "# TYPE geospatial_vector_tile_requests_total counter\ngeospatial_vector_tile_requests_total %d\n", requests)
		_, _ = fmt.Fprintf(w, "# TYPE geospatial_vector_tile_errors_total counter\ngeospatial_vector_tile_errors_total %d\n", metric.tileErrors.Load())
		_, _ = fmt.Fprintf(w, "# TYPE geospatial_vector_tile_denied_total counter\ngeospatial_vector_tile_denied_total %d\n", metric.denied.Load())
		_, _ = fmt.Fprintf(w, "# TYPE geospatial_vector_tile_average_latency_milliseconds gauge\ngeospatial_vector_tile_average_latency_milliseconds %.3f\n", average)
	}
}

func tileHandler(pool *pgxpool.Pool, cfg config, metric *metrics) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		started := time.Now()
		metric.tileRequests.Add(1)
		requestID := correlationID(r)
		w.Header().Set("X-Request-Id", requestID)
		w.Header().Set("Vary", "Authorization")
		w.Header().Set("Cache-Control", "private, max-age=60, must-revalidate")
		if r.Method != http.MethodGet {
			w.Header().Set("Allow", http.MethodGet)
			writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed", "requestId": requestID})
			return
		}
		z, x, y, err := parseTilePath(r.URL.Path)
		if err != nil {
			metric.denied.Add(1)
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid tile request", "requestId": requestID})
			return
		}
		token, err := bearerToken(r.Header.Get("Authorization"))
		if err != nil {
			metric.denied.Add(1)
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "authorization required", "requestId": requestID})
			return
		}
		capability, err := parseCapability(token, cfg.capabilityKey, time.Now())
		if err != nil {
			metric.denied.Add(1)
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "authorization denied", "requestId": requestID})
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), cfg.queryTimeout)
		defer cancel()
		var tile []byte
		if err := pool.QueryRow(ctx, tileSQL, z, x, y, capability.Parcels).Scan(&tile); err != nil {
			metric.tileErrors.Add(1)
			slog.Error("vector tile query failed", "request_id", requestID, "error", err.Error())
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "tile service unavailable", "requestId": requestID})
			return
		}
		metric.latencyNanos.Add(uint64(time.Since(started).Nanoseconds()))
		w.Header().Set("Content-Type", "application/vnd.mapbox-vector-tile")
		w.Header().Set("Content-Length", strconv.Itoa(len(tile)))
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(tile)
	}
}

func correlationID(r *http.Request) string {
	candidate := strings.TrimSpace(r.Header.Get("X-Request-Id"))
	if candidate != "" && len(candidate) <= 128 {
		for _, char := range candidate {
			if !(char >= 'a' && char <= 'z') && !(char >= 'A' && char <= 'Z') && !(char >= '0' && char <= '9') && char != '.' && char != '_' && char != ':' && char != '-' {
				return strconv.FormatInt(time.Now().UnixNano(), 36)
			}
		}
		return candidate
	}
	return strconv.FormatInt(time.Now().UnixNano(), 36)
}

func securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "no-referrer")
		next.ServeHTTP(w, r)
	})
}

func requestLogging(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		started := time.Now()
		next.ServeHTTP(w, r)
		slog.Info("vector tile request completed", "method", r.Method, "path", r.URL.Path, "duration_ms", time.Since(started).Milliseconds())
	})
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func sortedInt32(values []int32) []int32 {
	copyValues := append([]int32(nil), values...)
	sort.Slice(copyValues, func(i, j int) bool { return copyValues[i] < copyValues[j] })
	return copyValues
}
