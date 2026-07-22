#!/bin/sh
set -eu

: "${APISIX_ADMIN_URL:?APISIX_ADMIN_URL is required}"
: "${APISIX_ADMIN_KEY:?APISIX_ADMIN_KEY is required}"
: "${APP_UPSTREAM_HOST:=app}"
: "${APP_UPSTREAM_PORT:=3000}"

admin_url="${APISIX_ADMIN_URL%/}"

attempt=0
until curl --fail --silent --show-error \
  -H "X-API-KEY: ${APISIX_ADMIN_KEY}" \
  "${admin_url}/apisix/admin/routes" >/dev/null; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 60 ]; then
    echo "APISIX Admin API did not become ready within 120 seconds" >&2
    exit 1
  fi
  sleep 2
done

cat <<EOF | curl --fail --silent --show-error \
  -X PUT \
  -H "Content-Type: application/json" \
  -H "X-API-KEY: ${APISIX_ADMIN_KEY}" \
  --data-binary @- \
  "${admin_url}/apisix/admin/routes/landmanagement-platform" >/dev/null
{
  "name": "landmanagement-platform",
  "uri": "/*",
  "priority": 0,
  "plugins": {
    "request-id": {
      "include_in_response": true,
      "header_name": "X-Request-Id"
    },
    "limit-req": {
      "rate": 100,
      "burst": 200,
      "rejected_code": 429,
      "key_type": "var",
      "key": "remote_addr"
    },
    "cors": {
      "allow_origins": "${CORS_ALLOW_ORIGINS:-*}",
      "allow_methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
      "allow_headers": "Authorization,Content-Type,X-Request-Id",
      "expose_headers": "X-Request-Id",
      "allow_credential": true,
      "max_age": 3600
    },
    "proxy-rewrite": {
      "headers": {
        "X-Forwarded-Proto": "https"
      }
    }
  },
  "upstream": {
    "type": "roundrobin",
    "scheme": "http",
    "pass_host": "pass",
    "nodes": {
      "${APP_UPSTREAM_HOST}:${APP_UPSTREAM_PORT}": 1
    },
    "checks": {
      "active": {
        "type": "http",
        "http_path": "/api/health",
        "healthy": { "interval": 2, "successes": 2 },
        "unhealthy": { "interval": 2, "http_failures": 2 }
      }
    }
  }
}
EOF

echo "APISIX route landmanagement-platform is configured"
