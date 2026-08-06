#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

command -v docker >/dev/null 2>&1 || {
  printf 'WARNING: docker is unavailable; Compose interpolation must be validated in CI.\n' >&2
  exit 0
}

AUDIT_ENV="$(mktemp)"
trap 'rm -f "$AUDIT_ENV"' EXIT

# Compose never starts during this check. Values are disposable syntactic inputs,
# deliberately not deployment secrets.
grep -hoE '\$\{[A-Z][A-Z0-9_]*' docker-compose*.yml 2>/dev/null \
  | sed 's/^${//' \
  | sort -u \
  | while IFS= read -r key; do
      [ -n "$key" ] && printf '%s=audit_%s\n' "$key" "$(printf '%s' "$key" | tr '[:upper:]' '[:lower:]')"
    done > "$AUDIT_ENV"

# Preserve boolean-sensitive and numeric template fields with valid audit values.
cat >> "$AUDIT_ENV" <<'EOF'
NODE_ENV=production
DB_SSL=true
DB_SSL_REJECT_UNAUTHORIZED=true
TEMPORAL_TLS_ENABLED=true
KEYCLOAK_ALLOW_HTTP=false
DAPR_TIMEOUT_MS=5000
KEYCLOAK_TIMEOUT_MS=10000
PERMIFY_TIMEOUT_MS=5000
DOCUMENT_VERIFIER_TIMEOUT_MS=15000
EOF

docker compose --env-file "$AUDIT_ENV" -f docker-compose.production.yml config >/dev/null
printf 'Resolved production Compose topology passed audit interpolation validation.\n'
