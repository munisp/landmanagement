package main

import (
    "context"
    "crypto/hmac"
    "crypto/sha256"
    "database/sql"
    "encoding/base64"
    "encoding/json"
    "errors"
    "fmt"
    "log"
    "net/http"
    "os"
    "sort"
    "strconv"
    "strings"
    "sync/atomic"
    "time"

    _ "github.com/jackc/pgx/v5/stdlib"
)

type capability struct {
    V       int      `json:"v"`
    Aud     string   `json:"aud"`
    Sub     int      `json:"sub"`
    Layers  []string `json:"layers"`
    Purpose string   `json:"purpose"`
    Iat     int64    `json:"iat"`
    Exp     int64    `json:"exp"`
    JTI     string   `json:"jti"`
}

type event struct {
    ID              int64           `json:"id"`
    LayerKey        string          `json:"layerKey"`
    SourceEventKey  string          `json:"sourceEventKey"`
    SourceObserved  time.Time       `json:"sourceObservedAt"`
    SourceUpdated   *time.Time      `json:"sourceUpdatedAt,omitempty"`
    ExpiresAt       *time.Time      `json:"expiresAt,omitempty"`
    Severity        *string         `json:"severity,omitempty"`
    Urgency         *string         `json:"urgency,omitempty"`
    Geometry        json.RawMessage `json:"geometry"`
    Properties      json.RawMessage `json:"properties"`
    QualityState    string          `json:"qualityState"`
    Attribution     string          `json:"attribution"`
    SourceName      string          `json:"sourceName"`
}

var streamConnections atomic.Int64
var streamEvents atomic.Uint64
var streamDenied atomic.Uint64

func main() {
    dsn := required("DATABASE_URL")
    secret := required("CONTEXT_CAPABILITY_SECRET")
    if len(secret) < 32 { log.Fatal("CONTEXT_CAPABILITY_SECRET must contain at least 32 characters") }
    db, err := sql.Open("pgx", dsn)
    if err != nil { log.Fatalf("database initialization failed: %v", err) }
    defer db.Close()
    if err := db.Ping(); err != nil { log.Fatalf("database is unavailable: %v", err) }

    mux := http.NewServeMux()
    mux.HandleFunc("/health", func(w http.ResponseWriter, _ *http.Request) {
        if err := db.Ping(); err != nil { http.Error(w, `{"status":"degraded"}`, http.StatusServiceUnavailable); return }
        writeJSON(w, http.StatusOK, map[string]any{"status":"healthy", "service":"context-stream-gateway"})
    })
    mux.HandleFunc("/ready", func(w http.ResponseWriter, _ *http.Request) {
        if err := db.Ping(); err != nil { http.Error(w, `{"status":"not_ready"}`, http.StatusServiceUnavailable); return }
        writeJSON(w, http.StatusOK, map[string]any{"status":"ready"})
    })
    mux.HandleFunc("/metrics", func(w http.ResponseWriter, _ *http.Request) {
        w.Header().Set("Content-Type", "text/plain; version=0.0.4")
        fmt.Fprintf(w, "context_stream_connections %d\ncontext_stream_events_total %d\ncontext_stream_denied_total %d\n", streamConnections.Load(), streamEvents.Load(), streamDenied.Load())
    })
    mux.HandleFunc("/stream", streamHandler(db, []byte(secret)))
    port := os.Getenv("PORT")
    if port == "" { port = "8091" }
    server := &http.Server{Addr: ":" + port, Handler: requestID(mux), ReadHeaderTimeout: 5 * time.Second, IdleTimeout: 70 * time.Second}
    log.Printf("context stream gateway listening on %s", server.Addr)
    log.Fatal(server.ListenAndServe())
}

func streamHandler(db *sql.DB, secret []byte) http.HandlerFunc {
    return func(w http.ResponseWriter, r *http.Request) {
        token, err := bearer(r.Header.Get("Authorization"))
        if err != nil { streamDenied.Add(1); http.Error(w, `{"error":"context authorization failed"}`, http.StatusUnauthorized); return }
        cap, err := verifyCapability(token, secret, "context_stream", time.Now())
        if err != nil { streamDenied.Add(1); http.Error(w, `{"error":"context authorization failed"}`, http.StatusUnauthorized); return }
        layers, err := requestedLayers(r.URL.Query().Get("layers"), cap.Layers)
        if err != nil { http.Error(w, `{"error":"invalid context layers"}`, http.StatusBadRequest); return }
        flusher, ok := w.(http.Flusher)
        if !ok { http.Error(w, `{"error":"streaming unavailable"}`, http.StatusInternalServerError); return }
        w.Header().Set("Content-Type", "text/event-stream")
        w.Header().Set("Cache-Control", "no-store")
        w.Header().Set("Connection", "keep-alive")
        streamConnections.Add(1)
        defer streamConnections.Add(-1)
        fmt.Fprintf(w, "event: ready\ndata: {\"subject\":%d,\"layers\":%s}\n\n", cap.Sub, mustJSON(layers))
        flusher.Flush()
        var cursor int64
        if raw := r.URL.Query().Get("cursor"); raw != "" { cursor, err = strconv.ParseInt(raw, 10, 64); if err != nil || cursor < 0 { http.Error(w, `{"error":"invalid cursor"}`, http.StatusBadRequest); return } }
        ticker := time.NewTicker(2 * time.Second)
        defer ticker.Stop()
        for {
            events, err := readEvents(r.Context(), db, layers, cursor)
            if err != nil { fmt.Fprintf(w, "event: error\ndata: {\"error\":\"context stream temporarily unavailable\"}\n\n"); flusher.Flush(); return }
            for _, item := range events {
                cursor = item.ID
                payload, _ := json.Marshal(item)
                fmt.Fprintf(w, "id: %d\nevent: context\ndata: %s\n\n", item.ID, payload)
                streamEvents.Add(1)
            }
            if len(events) > 0 { flusher.Flush() }
            select {
            case <-r.Context().Done(): return
            case <-ticker.C: continue
            }
        }
    }
}

func readEvents(ctx context.Context, db *sql.DB, layers []string, cursor int64) ([]event, error) {
    if len(layers) == 0 || len(layers) > 8 { return nil, errors.New("invalid layer scope") }
    placeholders := make([]string, len(layers))
    args := make([]any, 0, len(layers)+1)
    args = append(args, cursor)
    for i, layer := range layers { placeholders[i] = fmt.Sprintf("$%d", i+2); args = append(args, layer) }
    query := fmt.Sprintf(`SELECT e.id, l.layer_key, e.source_event_key, e.source_observed_at, e.source_updated_at, e.expires_at, e.severity, e.urgency, e.geometry, e.properties, e.quality_state, l.attribution, l.source_name
      FROM context_events e JOIN context_layers l ON l.id=e.layer_id
      WHERE e.id > $1 AND e.event_status='active' AND l.enabled=true AND l.layer_key IN (%s)
      ORDER BY e.id ASC LIMIT 200`, strings.Join(placeholders, ","))
    rows, err := db.QueryContext(ctx, query, args...)
    if err != nil { return nil, err }
    defer rows.Close()
    result := make([]event, 0)
    for rows.Next() {
        var item event
        if err := rows.Scan(&item.ID, &item.LayerKey, &item.SourceEventKey, &item.SourceObserved, &item.SourceUpdated, &item.ExpiresAt, &item.Severity, &item.Urgency, &item.Geometry, &item.Properties, &item.QualityState, &item.Attribution, &item.SourceName); err != nil { return nil, err }
        result = append(result, item)
    }
    return result, rows.Err()
}

func verifyCapability(raw string, secret []byte, audience string, now time.Time) (capability, error) {
    parts := strings.Split(raw, ".")
    if len(parts) != 2 || parts[0] == "" || parts[1] == "" { return capability{}, errors.New("invalid format") }
    payloadBytes, err := canonicalDecode(parts[0]); if err != nil { return capability{}, err }
    supplied, err := canonicalDecode(parts[1]); if err != nil { return capability{}, err }
    mac := hmac.New(sha256.New, secret); mac.Write([]byte(parts[0])); expected := mac.Sum(nil)
    if !hmac.Equal(supplied, expected) { return capability{}, errors.New("invalid signature") }
    var cap capability
    if err := json.Unmarshal(payloadBytes, &cap); err != nil { return capability{}, errors.New("invalid payload") }
    if cap.V != 1 || cap.Aud != audience || cap.Sub < 1 || cap.Exp <= cap.Iat || cap.Exp <= now.Unix() || cap.Iat > now.Add(time.Minute).Unix() || strings.TrimSpace(cap.Purpose) == "" || strings.TrimSpace(cap.JTI) == "" { return capability{}, errors.New("invalid claims") }
    cap.Layers, err = canonicalLayers(cap.Layers); if err != nil { return capability{}, err }
    return cap, nil
}

func requestedLayers(raw string, allowed []string) ([]string, error) {
    requested := allowed
    if strings.TrimSpace(raw) != "" { requested = strings.Split(raw, ",") }
    normalized, err := canonicalLayers(requested); if err != nil { return nil, err }
    permitted := map[string]bool{}; for _, item := range allowed { permitted[item] = true }
    for _, item := range normalized { if !permitted[item] { return nil, errors.New("layer outside scope") } }
    return normalized, nil
}

func canonicalLayers(input []string) ([]string, error) {
    seen := map[string]bool{}; result := make([]string, 0, len(input))
    for _, raw := range input { value := strings.ToLower(strings.TrimSpace(raw)); if len(value) < 2 || len(value) > 64 { return nil, errors.New("invalid layer") }; for _, r := range value { if !(r >= 'a' && r <= 'z' || r >= '0' && r <= '9' || r == '-') { return nil, errors.New("invalid layer") } }; if !seen[value] { seen[value] = true; result = append(result, value) } }
    if len(result) == 0 || len(result) > 8 { return nil, errors.New("invalid layer scope") }
    sort.Strings(result); return result, nil
}

func canonicalDecode(raw string) ([]byte, error) { value, err := base64.RawURLEncoding.DecodeString(raw); if err != nil || base64.RawURLEncoding.EncodeToString(value) != raw { return nil, errors.New("noncanonical base64url") }; return value, nil }
func bearer(header string) (string, error) { parts := strings.Fields(header); if len(parts) != 2 || parts[0] != "Bearer" { return "", errors.New("missing bearer") }; return parts[1], nil }
func mustJSON(value any) string { bytes, _ := json.Marshal(value); return string(bytes) }
func required(key string) string { value := strings.TrimSpace(os.Getenv(key)); if value == "" { log.Fatalf("%s is required", key) }; return value }
func writeJSON(w http.ResponseWriter, status int, payload any) { w.Header().Set("Content-Type", "application/json"); w.WriteHeader(status); _ = json.NewEncoder(w).Encode(payload) }
func requestID(next http.Handler) http.Handler { return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { if r.Header.Get("X-Request-Id") == "" { r.Header.Set("X-Request-Id", fmt.Sprintf("context-%d", time.Now().UnixNano())) }; next.ServeHTTP(w, r) }) }
