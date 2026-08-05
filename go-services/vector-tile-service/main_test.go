package main

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"strings"
	"testing"
	"time"
)

func signedToken(t *testing.T, secret []byte, value capability) string {
	t.Helper()
	encoded, err := json.Marshal(value)
	if err != nil {
		t.Fatalf("marshal capability: %v", err)
	}
	payload := base64.RawURLEncoding.EncodeToString(encoded)
	mac := hmac.New(sha256.New, secret)
	_, _ = mac.Write([]byte(payload))
	return payload + "." + base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}

func validCapability(now time.Time) capability {
	return capability{
		Issuer: capabilityIssuer, Version: capabilityVersion, Audience: "vector_tiles",
		Subject: "12", ID: "9d1f1e2c-9f6e-4e1a-b7ee-1c4bba5af72d", IssuedAt: now.Unix() - 1,
		ExpiresAt: now.Unix() + 300, Parcels: []int32{4, 8, 15}, Purpose: "maplibre.parcel-review",
	}
}

func TestParseCapabilityAcceptsScopedSignedCapability(t *testing.T) {
	now := time.Unix(1_770_000_000, 0)
	secret := []byte("0123456789abcdef0123456789abcdef")
	actual, err := parseCapability(signedToken(t, secret, validCapability(now)), secret, now)
	if err != nil {
		t.Fatalf("expected valid capability, got %v", err)
	}
	if len(actual.Parcels) != 3 || actual.Parcels[0] != 4 || actual.Audience != "vector_tiles" {
		t.Fatalf("unexpected parsed capability: %#v", actual)
	}
}

func TestParseCapabilityRejectsAudienceExpiryAndUnsortedScope(t *testing.T) {
	now := time.Unix(1_770_000_000, 0)
	secret := []byte("0123456789abcdef0123456789abcdef")
	cases := []struct {
		name   string
		mutate func(*capability)
	}{
		{"wrong audience", func(value *capability) { value.Audience = "cesium_assets" }},
		{"expired", func(value *capability) { value.ExpiresAt = now.Unix() - 1 }},
		{"overlong lifetime", func(value *capability) { value.ExpiresAt = value.IssuedAt + maxCapabilityTTL + 1 }},
		{"unsorted scope", func(value *capability) { value.Parcels = []int32{8, 4} }},
		{"duplicate scope", func(value *capability) { value.Parcels = []int32{4, 4} }},
	}
	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			value := validCapability(now)
			testCase.mutate(&value)
			if _, err := parseCapability(signedToken(t, secret, value), secret, now); err == nil {
				t.Fatal("expected capability rejection")
			}
		})
	}
}

func TestParseTilePathRejectsOutOfMatrixAndTraversal(t *testing.T) {
	z, x, y, err := parseTilePath("/tiles/3/4/5.pbf")
	if err != nil || z != 3 || x != 4 || y != 5 {
		t.Fatalf("expected valid tile path, got %d/%d/%d %v", z, x, y, err)
	}
	for _, path := range []string{"/tiles/3/8/5.pbf", "/tiles/3/4/../5.pbf", "/tiles/x/4/5.pbf", "/tiles/3/4/5.json"} {
		if _, _, _, err := parseTilePath(path); err == nil {
			t.Fatalf("expected rejection for %s", path)
		}
	}
}

func TestTileQueryUsesParameterizedParcelScope(t *testing.T) {
	if !strings.Contains(tileSQL, "id = ANY($4::integer[])") {
		t.Fatal("tile query must filter by the typed capability scope parameter")
	}
	if strings.Contains(tileSQL, "WHERE id IN (") {
		t.Fatal("tile query must not interpolate parcel IDs into SQL")
	}
}
