package main

import (
    "crypto/hmac"
    "crypto/sha256"
    "encoding/base64"
    "encoding/json"
    "testing"
    "time"
)

func signedCapability(t *testing.T, secret []byte, audience string, layers []string) string {
    t.Helper()
    payload, err := json.Marshal(capability{V: 1, Aud: audience, Sub: 7, Layers: layers, Purpose: "context-globe.test", Iat: time.Now().Add(-time.Minute).Unix(), Exp: time.Now().Add(time.Minute).Unix(), JTI: "test-capability"})
    if err != nil { t.Fatal(err) }
    encoded := base64.RawURLEncoding.EncodeToString(payload)
    mac := hmac.New(sha256.New, secret); mac.Write([]byte(encoded))
    return encoded + "." + base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}

func TestVerifyContextCapabilityConfinement(t *testing.T) {
    secret := []byte("01234567890123456789012345678901")
    token := signedCapability(t, secret, "context_stream", []string{"weather-alerts", "seismic"})
    verified, err := verifyCapability(token, secret, "context_stream", time.Now())
    if err != nil { t.Fatalf("expected capability to verify: %v", err) }
    if verified.Sub != 7 || len(verified.Layers) != 2 || verified.Layers[0] != "seismic" { t.Fatalf("unexpected capability %#v", verified) }
    if _, err := verifyCapability(token, secret, "context_tiles", time.Now()); err == nil { t.Fatal("expected audience mismatch to fail") }
}

func TestRejectsNoncanonicalSignatureAndOutOfScopeLayer(t *testing.T) {
    secret := []byte("01234567890123456789012345678901")
    token := signedCapability(t, secret, "context_stream", []string{"seismic"})
    if _, err := verifyCapability(token+"A", secret, "context_stream", time.Now()); err == nil { t.Fatal("expected noncanonical signature to fail") }
    if _, err := requestedLayers("weather-alerts", []string{"seismic"}); err == nil { t.Fatal("expected out-of-scope layer to fail") }
}

func TestCanonicalLayers(t *testing.T) {
    layers, err := canonicalLayers([]string{"Seismic", "seismic", "weather-alerts"})
    if err != nil { t.Fatal(err) }
    if len(layers) != 2 || layers[0] != "seismic" || layers[1] != "weather-alerts" { t.Fatalf("unexpected canonical layers %#v", layers) }
    if _, err := canonicalLayers([]string{"../../private"}); err == nil { t.Fatal("expected malformed layer to fail") }
}
