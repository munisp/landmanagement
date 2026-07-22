#!/bin/sh
set -eu

KCADM="/opt/keycloak/bin/kcadm.sh"
: "${KEYCLOAK_BOOTSTRAP_ADMIN_USERNAME:?KEYCLOAK_BOOTSTRAP_ADMIN_USERNAME is required}"
: "${KEYCLOAK_BOOTSTRAP_ADMIN_PASSWORD:?KEYCLOAK_BOOTSTRAP_ADMIN_PASSWORD is required}"
: "${KEYCLOAK_REALM:?KEYCLOAK_REALM is required}"
: "${KEYCLOAK_CLIENT_ID:?KEYCLOAK_CLIENT_ID is required}"
: "${KEYCLOAK_CLIENT_SECRET:?KEYCLOAK_CLIENT_SECRET is required}"
: "${KEYCLOAK_ADMIN_CLIENT_ID:?KEYCLOAK_ADMIN_CLIENT_ID is required}"
: "${KEYCLOAK_ADMIN_CLIENT_SECRET:?KEYCLOAK_ADMIN_CLIENT_SECRET is required}"
: "${KEYCLOAK_REDIRECT_URIS:?KEYCLOAK_REDIRECT_URIS must be a JSON array of approved redirect URIs}"

base_url="${KEYCLOAK_BOOTSTRAP_URL:-http://keycloak:8080}"
realm="${KEYCLOAK_REALM}"

attempt=0
until "$KCADM" config credentials --server "$base_url" --realm master \
  --user "$KEYCLOAK_BOOTSTRAP_ADMIN_USERNAME" \
  --password "$KEYCLOAK_BOOTSTRAP_ADMIN_PASSWORD" >/dev/null 2>&1; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 60 ]; then
    echo "Keycloak administration endpoint did not become ready within 120 seconds" >&2
    exit 1
  fi
  sleep 2
done

if ! "$KCADM" get "realms/$realm" >/dev/null 2>&1; then
  "$KCADM" create realms \
    -s "realm=$realm" \
    -s enabled=true \
    -s registrationAllowed=false \
    -s resetPasswordAllowed=true \
    -s verifyEmail=true \
    -s loginWithEmailAllowed=true \
    -s duplicateEmailsAllowed=false >/dev/null
fi

roles="
user
surveyor
registrar
admin
land_citizen
land_surveyor
land_registrar
land_admin
mining_operator
mining_inspector
mining_registrar
mining_admin
petroleum_operator
petroleum_inspector
petroleum_registrar
petroleum_admin
water_rights_holder
water_inspector
water_registrar
water_admin
forestry_operator
forestry_inspector
forestry_registrar
forestry_admin
agri_operator
agri_inspector
agri_registrar
agri_admin
fisheries_operator
fisheries_inspector
fisheries_admin
energy_operator
energy_inspector
energy_admin
"
for role in $roles; do
  if ! "$KCADM" get "roles/$role" -r "$realm" >/dev/null 2>&1; then
    "$KCADM" create roles -r "$realm" -s "name=$role" >/dev/null
  fi
done

client_exists() {
  "$KCADM" get clients -r "$realm" -q "clientId=$1" 2>/dev/null | grep -q "\"clientId\"[[:space:]]*:[[:space:]]*\"$1\""
}

if ! client_exists "$KEYCLOAK_CLIENT_ID"; then
  "$KCADM" create clients -r "$realm" \
    -s "clientId=$KEYCLOAK_CLIENT_ID" \
    -s enabled=true \
    -s protocol=openid-connect \
    -s publicClient=false \
    -s clientAuthenticatorType=client-secret \
    -s "secret=$KEYCLOAK_CLIENT_SECRET" \
    -s standardFlowEnabled=true \
    -s directAccessGrantsEnabled=false \
    -s serviceAccountsEnabled=false \
    -s "redirectUris=$KEYCLOAK_REDIRECT_URIS" >/dev/null
fi

if ! client_exists "$KEYCLOAK_ADMIN_CLIENT_ID"; then
  "$KCADM" create clients -r "$realm" \
    -s "clientId=$KEYCLOAK_ADMIN_CLIENT_ID" \
    -s enabled=true \
    -s protocol=openid-connect \
    -s publicClient=false \
    -s clientAuthenticatorType=client-secret \
    -s "secret=$KEYCLOAK_ADMIN_CLIENT_SECRET" \
    -s standardFlowEnabled=false \
    -s directAccessGrantsEnabled=false \
    -s serviceAccountsEnabled=true >/dev/null
fi

service_account="service-account-${KEYCLOAK_ADMIN_CLIENT_ID}"
"$KCADM" add-roles -r "$realm" \
  --uusername "$service_account" \
  --cclientid realm-management \
  --rolename manage-users \
  --rolename view-users \
  --rolename query-users \
  --rolename view-realm >/dev/null

echo "Keycloak realm $realm is ready for IDLR platform provisioning"
