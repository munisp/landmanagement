#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

fail() {
  printf 'RELEASE CONTROL FAILED: %s\n' "$1" >&2
  exit 1
}

require_file() {
  [ -f "$1" ] || fail "required file is missing: $1"
}

require_file docker-compose.production.yml
require_file keycloak/bootstrap.sh
require_file dapr/components/pubsub.yaml
require_file dapr/components/statestore.yaml
require_file scripts/database/backup.sh
require_file scripts/database/restore.sh
if [ -f .github/workflows/nationwide-release-gates.yml ]; then
  WORKFLOW_STATE="installed"
else
  require_file docs/ci/nationwide-release-gates.yml
  WORKFLOW_STATE="installation_artifact"
fi
require_file scripts/release/write-sbom.mjs
require_file drizzle/schema.ts

if ! git diff --check; then
  fail "working tree contains whitespace errors"
fi

if [ "${RELEASE_ALLOW_DIRTY_WORKTREE:-false}" != "true" ]; then
  if [ -n "$(git status --porcelain --untracked-files=all -- . ':!artifacts')" ]; then
    fail "release provenance requires a clean reviewed worktree; commit or discard changes before generating final evidence"
  fi
fi

if [ "$WORKFLOW_STATE" = "installed" ] && find .github/workflows -type f -name '*.y*ml' -print0 | xargs -0 grep -nE 'continue-on-error:[[:space:]]*true|\|\|[[:space:]]*true' >/dev/null 2>&1; then
  fail "a live GitHub workflow contains a non-blocking quality gate"
fi

if [ "$WORKFLOW_STATE" = "installation_artifact" ]; then
  printf 'WARNING: nationwide release workflow is a reviewed installation artifact; GitHub Actions enforcement is not active until an administrator installs docs/ci/nationwide-release-gates.yml at .github/workflows/nationwide-release-gates.yml.\n' >&2
fi

if ! find drizzle -maxdepth 1 -type f -name '[0-9][0-9][0-9][0-9]_*.sql' | sort -V | awk '
  BEGIN { expected = -1; ok = 1 }
  {
    file = $0
    sub(/^.*\//, "", file)
    prefix = substr(file, 1, 4) + 0
    if (expected >= 0 && prefix != expected + 1) {
      printf "migration sequence gap: expected %04d but found %04d\n", expected + 1, prefix > "/dev/stderr"
      ok = 0
    }
    expected = prefix
  }
  END { exit(ok ? 0 : 1) }
'; then
  fail "ordered migration sequence is incomplete"
fi

bash -n keycloak/bootstrap.sh
bash -n scripts/database/backup.sh
bash -n scripts/database/restore.sh
bash -n scripts/release/verify-release.sh
bash -n scripts/release/write-component-inventory.sh
bash -n scripts/release/validate-compose-audit.sh
node --check scripts/release/write-sbom.mjs

scripts/release/validate-compose-audit.sh

if [ -n "$(git status --porcelain --untracked-files=all -- artifacts 2>/dev/null)" ]; then
  fail "generated artifacts must not be tracked or staged from artifacts/"
fi

if [ "${RELEASE_ALLOW_DIRTY_WORKTREE:-false}" = "true" ]; then
  printf 'Release controls passed for development worktree based on %s\n' "$(git rev-parse --short HEAD)"
else
  printf 'Release controls passed for clean release %s\n' "$(git rev-parse --short HEAD)"
fi
