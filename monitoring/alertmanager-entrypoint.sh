#!/bin/sh
set -eu

: "${ALERTMANAGER_WEBHOOK_URL:?ALERTMANAGER_WEBHOOK_URL is required}"
: "${ALERTMANAGER_WEBHOOK_TOKEN:?ALERTMANAGER_WEBHOOK_TOKEN is required}"

case "$ALERTMANAGER_WEBHOOK_URL" in
  https://*) ;;
  *) echo "ALERTMANAGER_WEBHOOK_URL must use HTTPS" >&2; exit 64 ;;
esac

case "$ALERTMANAGER_WEBHOOK_URL$ALERTMANAGER_WEBHOOK_TOKEN" in
  *"\n"*|*"\r"*|*"\""*|*"\\"*) echo "Alertmanager webhook configuration contains unsupported characters" >&2; exit 64 ;;
esac

sed \
  -e "s|__ALERTMANAGER_WEBHOOK_URL__|${ALERTMANAGER_WEBHOOK_URL}|g" \
  -e "s|__ALERTMANAGER_WEBHOOK_TOKEN__|${ALERTMANAGER_WEBHOOK_TOKEN}|g" \
  /etc/alertmanager-template/alertmanager.yml > /tmp/alertmanager.yml

exec /bin/alertmanager --config.file=/tmp/alertmanager.yml
