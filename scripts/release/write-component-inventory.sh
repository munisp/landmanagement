#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUTPUT_DIR="${1:-$ROOT_DIR/artifacts}"
mkdir -p "$OUTPUT_DIR"
cd "$ROOT_DIR"

MANIFEST="$OUTPUT_DIR/release-provenance.json"
INVENTORY="$OUTPUT_DIR/component-inventory.txt"

commit="$(git rev-parse HEAD)"
tree="$(git rev-parse HEAD^{tree})"
created_at="$(git show -s --format=%cI HEAD)"

if [ -d .github/workflows ]; then
  WORKFLOW_DIR=".github/workflows"
  WORKFLOW_STATE="installed"
else
  WORKFLOW_DIR="docs/ci"
  WORKFLOW_STATE="installation_artifact"
fi

{
  printf 'release_commit=%s\n' "$commit"
  printf 'release_tree=%s\n' "$tree"
  printf 'commit_timestamp=%s\n' "$created_at"
  printf '\n[migrations]\n'
  find drizzle -maxdepth 1 -type f -name '*.sql' -print | sort -V | while read -r file; do
    sha256sum "$file"
  done
  printf '\n[workflow_%s]\n' "$WORKFLOW_STATE"
  find "$WORKFLOW_DIR" -maxdepth 1 -type f -name '*.y*ml' -print | sort | while read -r file; do
    sha256sum "$file"
  done
  printf '\n[typescript-services]\n'
  find server temporal -type f \( -name '*.ts' -o -name '*.tsx' \) -print 2>/dev/null | sort
  printf '\n[go-modules]\n'
  find go-services -name go.mod -print 2>/dev/null | sort
  printf '\n[rust-modules]\n'
  find rust-services -name Cargo.toml -print 2>/dev/null | sort
  printf '\n[python-entrypoints]\n'
  find lakehouse -type f \( -name 'main.py' -o -name '*service.py' \) -print 2>/dev/null | sort
} > "$INVENTORY"

migration_count="$(find drizzle -maxdepth 1 -type f -name '*.sql' -print | wc -l | tr -d ' ')"
workflow_count="$(find "$WORKFLOW_DIR" -maxdepth 1 -type f -name '*.y*ml' -print | wc -l | tr -d ' ')"
go_count="$(find go-services -name go.mod -print 2>/dev/null | wc -l | tr -d ' ')"
rust_count="$(find rust-services -name Cargo.toml -print 2>/dev/null | wc -l | tr -d ' ')"
python_count="$(find lakehouse -type f \( -name 'main.py' -o -name '*service.py' \) -print 2>/dev/null | wc -l | tr -d ' ')"
inventory_sha="$(sha256sum "$INVENTORY" | awk '{print $1}')"

cat > "$MANIFEST" <<EOF
{
  "schema_version": 1,
  "git_commit": "$commit",
  "git_tree": "$tree",
  "commit_timestamp": "$created_at",
  "migration_count": $migration_count,
  "workflow_count": $workflow_count,
  "workflow_state": "$WORKFLOW_STATE",
  "go_module_count": $go_count,
  "rust_module_count": $rust_count,
  "python_entrypoint_count": $python_count,
  "component_inventory_sha256": "$inventory_sha"
}
EOF

printf 'Wrote %s and %s\n' "$MANIFEST" "$INVENTORY"
