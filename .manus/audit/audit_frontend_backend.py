#!/usr/bin/env python3
"""Static route and API-wiring audit for the IDLR-PTS frontend."""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
APP = ROOT / "client" / "src" / "App.tsx"
PAGES = ROOT / "client" / "src" / "pages"
OUT = ROOT / ".manus" / "audit" / "frontend_backend_wiring.json"

IMPORT_RE = re.compile(
    r"(?:import\s+(?P<name1>[A-Za-z0-9_]+)\s+from\s+[\"'](?P<path1>[^\"']+)[\"']|"
    r"const\s+(?P<name2>[A-Za-z0-9_]+)\s*=\s*lazy\(\(\)\s*=>\s*import\([\"'](?P<path2>[^\"']+)[\"']\)\))"
)
ROUTE_RE = re.compile(r"<Route\s+path=\{?['\"](?P<path>[^'\"]+)['\"]\}?\s+component=\{?(?P<component>[A-Za-z0-9_]+)\}?")
CALL_PATTERNS = {
    "trpc": re.compile(r"\btrpc\.[A-Za-z0-9_.]+"),
    "fetch": re.compile(r"\bfetch\s*\("),
    "axios": re.compile(r"\baxios\.(?:get|post|put|patch|delete)\s*\("),
    "query_client": re.compile(r"\buseQuery\s*\(|\buseMutation\s*\("),
}
SCAFFOLD = re.compile(r"\b(?:TODO|FIXME|mock(?:ed|ing)?|placeholder|simulate(?:d|s)?|stub(?:bed)?)\b", re.I)


def resolve_import(raw: str) -> Path | None:
    if raw.startswith("@/"):
        candidate = ROOT / "client" / "src" / raw[2:]
    elif raw.startswith("./") or raw.startswith("../"):
        candidate = APP.parent / raw
    else:
        return None
    for suffix in (".tsx", ".ts", ".jsx", ".js", "/index.tsx", "/index.ts"):
        target = Path(str(candidate) + suffix) if not suffix.startswith("/") else candidate / suffix[1:]
        if target.exists():
            return target.resolve()
    return None


def main() -> None:
    app_text = APP.read_text(encoding="utf-8")
    imports: dict[str, Path] = {}
    for match in IMPORT_RE.finditer(app_text):
        name = match.group("name1") or match.group("name2")
        raw = match.group("path1") or match.group("path2")
        if name and raw:
            resolved = resolve_import(raw)
            if resolved:
                imports[name] = resolved

    routes: list[dict[str, object]] = []
    for match in ROUTE_RE.finditer(app_text):
        component = match.group("component")
        page = imports.get(component)
        result: dict[str, object] = {
            "path": match.group("path"),
            "component": component,
            "file": str(page.relative_to(ROOT)) if page else None,
            "resolution": "resolved" if page else "unresolved",
            "api_patterns": {},
            "scaffold_markers": [],
        }
        if page and page.exists():
            text = page.read_text(encoding="utf-8", errors="replace")
            result["api_patterns"] = {key: len(pattern.findall(text)) for key, pattern in CALL_PATTERNS.items()}
            result["scaffold_markers"] = [m.group(0) for m in SCAFFOLD.finditer(text)][:20]
            if not any(result["api_patterns"].values()):
                result["integration_signal"] = "no_direct_api_pattern"
            else:
                result["integration_signal"] = "api_pattern_detected"
        else:
            result["integration_signal"] = "unresolved_component"
        routes.append(result)

    page_files = sorted(PAGES.glob("*.tsx"))
    routed_files = {ROOT / route["file"] for route in routes if route.get("file")}
    orphan_pages = [str(p.relative_to(ROOT)) for p in page_files if p.resolve() not in routed_files]
    payload = {
        "route_count": len(routes),
        "resolved_route_count": sum(1 for route in routes if route["resolution"] == "resolved"),
        "routes": routes,
        "orphan_page_files": orphan_pages,
        "summary": {
            "unresolved_components": [route["component"] for route in routes if route["resolution"] != "resolved"],
            "routes_without_direct_api_pattern": [route["path"] for route in routes if route["integration_signal"] == "no_direct_api_pattern"],
            "routes_with_scaffold_markers": [route["path"] for route in routes if route["scaffold_markers"]],
        },
    }
    OUT.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "route_count": payload["route_count"],
        "resolved_route_count": payload["resolved_route_count"],
        "unresolved_components": payload["summary"]["unresolved_components"],
        "routes_without_direct_api_pattern": len(payload["summary"]["routes_without_direct_api_pattern"]),
        "routes_with_scaffold_markers": len(payload["summary"]["routes_with_scaffold_markers"]),
        "orphan_page_files": len(orphan_pages),
    }, indent=2))


if __name__ == "__main__":
    main()
