#!/usr/bin/env python3
"""Static audit of frontend tRPC namespace usage and backend router registration."""
from __future__ import annotations

import json
import re
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SERVER_ROUTERS = ROOT / "server" / "routers.ts"
API_ROUTER_DIR = ROOT / "server" / "api" / "routers"
CLIENT_ROOT = ROOT / "client" / "src"
OUT = ROOT / ".manus" / "audit" / "trpc_wiring.json"

IMPORT_RE = re.compile(r"import\s*\{?\s*([A-Za-z0-9_]+Router)\s*\}?\s*from\s*[\"']([^\"']+)[\"']")
ROUTER_KEY_RE = re.compile(r"^\s*([A-Za-z][A-Za-z0-9_]*)\s*:\s*([A-Za-z0-9_]+Router)\s*,?\s*$", re.M)
TRPC_RE = re.compile(r"\btrpc\.([A-Za-z][A-Za-z0-9_]*)\.([A-Za-z][A-Za-z0-9_]*)")
EXPORT_RE = re.compile(r"export\s+const\s+([A-Za-z0-9_]+Router)\s*=")


def main() -> None:
    server_text = SERVER_ROUTERS.read_text(encoding="utf-8")
    imports = {name: path for name, path in IMPORT_RE.findall(server_text)}
    router_pairs = ROUTER_KEY_RE.findall(server_text)
    registered = {key: router for key, router in router_pairs}

    client_usage: Counter[tuple[str, str]] = Counter()
    usage_files: dict[str, set[str]] = {}
    for source in CLIENT_ROOT.rglob("*.tsx"):
        text = source.read_text(encoding="utf-8", errors="replace")
        for namespace, procedure in TRPC_RE.findall(text):
            client_usage[(namespace, procedure)] += 1
            usage_files.setdefault(f"{namespace}.{procedure}", set()).add(str(source.relative_to(ROOT)))

    api_router_files: dict[str, str] = {}
    for source in API_ROUTER_DIR.glob("*.ts"):
        text = source.read_text(encoding="utf-8", errors="replace")
        for exported in EXPORT_RE.findall(text):
            api_router_files[exported] = str(source.relative_to(ROOT))

    registered_names = set(registered)
    used_namespaces = sorted({namespace for namespace, _ in client_usage})
    client_unknown_namespaces = sorted(set(used_namespaces) - registered_names)
    unmounted_api_routers = {
        export: file
        for export, file in api_router_files.items()
        if export not in imports and export not in registered.values()
    }

    payload = {
        "registered_routers": registered,
        "router_imports": imports,
        "client_usage": [
            {
                "namespace": namespace,
                "procedure": procedure,
                "usage_count": count,
                "files": sorted(usage_files[f"{namespace}.{procedure}"]),
                "namespace_registered": namespace in registered_names,
            }
            for (namespace, procedure), count in sorted(client_usage.items())
        ],
        "summary": {
            "registered_router_count": len(registered),
            "client_procedure_count": len(client_usage),
            "client_unknown_namespaces": client_unknown_namespaces,
            "unmounted_api_routers": unmounted_api_routers,
        },
    }
    OUT.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(payload["summary"], indent=2))


if __name__ == "__main__":
    main()
