"""Governed clean-room Context Globe ingestion for official public sources only."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from hashlib import sha256
import json
import os
from pathlib import Path
import re
import time
from typing import Any, Callable, Iterable
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from uuid import uuid4

import psycopg2
from psycopg2.extras import Json
from prometheus_client import Counter, Gauge, start_http_server

from catalog.iceberg_catalog import get_catalog_manager
from schemas.context_globe_schemas import initialize_context_globe_tables

USGS_SEISMIC_URL = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.geojson"
NWS_ALERT_URL = "https://api.weather.gov/alerts/active"
MAX_SOURCE_BYTES = 10 * 1024 * 1024
LAYER_SOURCES = {
    "seismic": (USGS_SEISMIC_URL, "USGS Earthquake Hazards Program"),
    "weather-alerts": (NWS_ALERT_URL, "National Weather Service"),
}
VALID_GEOMETRIES = {"Point", "LineString", "Polygon", "MultiPoint", "MultiLineString", "MultiPolygon"}

INGESTIONS = Counter("context_globe_ingestion_total", "Context Globe connector outcomes", ["layer", "outcome"])
EVENTS = Counter("context_globe_events_total", "Context Globe normalized events", ["layer", "quality"])
LAST_SUCCESS = Gauge("context_globe_last_success_unixtime", "Last successful Context Globe ingestion", ["layer"])


class ContextIngestionError(RuntimeError):
    """A public-source or lineage failure that must fail the ingestion cycle."""


@dataclass(frozen=True)
class SourceFetch:
    status: int
    body: bytes | None
    etag: str | None
    last_modified: str | None


@dataclass(frozen=True)
class NormalizedEvent:
    source_event_key: str
    source_url: str | None
    source_observed_at: datetime
    source_updated_at: datetime | None
    expires_at: datetime | None
    severity: str | None
    urgency: str | None
    geometry: dict[str, Any]
    bbox: list[float] | None
    properties: dict[str, Any]


def utc_now() -> datetime:
    return datetime.now(UTC)


def required_env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise ContextIngestionError(f"{name} must be configured")
    return value


def _parse_time(value: Any, *, field: str) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return datetime.fromtimestamp(float(value) / 1000, tz=UTC)
    if not isinstance(value, str):
        raise ContextIngestionError(f"{field} must be an ISO-8601 string or epoch milliseconds")
    normalized = value.replace("Z", "+00:00")
    parsed = datetime.fromisoformat(normalized)
    return parsed.replace(tzinfo=UTC) if parsed.tzinfo is None else parsed.astimezone(UTC)


def _safe_text(value: Any, *, field: str, maximum: int) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str):
        raise ContextIngestionError(f"{field} must be text")
    normalized = " ".join(value.split())
    if not normalized:
        return None
    if len(normalized) > maximum:
        raise ContextIngestionError(f"{field} exceeds maximum length")
    return normalized


def _validate_geometry(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict) or value.get("type") not in VALID_GEOMETRIES or "coordinates" not in value:
        raise ContextIngestionError("source feature geometry is unsupported or missing")
    coordinates = value["coordinates"]
    serialized = json.dumps(coordinates, separators=(",", ":"))
    if len(serialized) > 256_000:
        raise ContextIngestionError("source feature geometry exceeds maximum serialized size")
    normalized = {"type": value["type"], "coordinates": coordinates}
    if _bbox(normalized) is None:
        raise ContextIngestionError("source feature geometry has no valid WGS84 coordinates")
    return normalized


def _bbox(geometry: dict[str, Any]) -> list[float] | None:
    values: list[tuple[float, float]] = []

    def visit(value: Any) -> None:
        if isinstance(value, (list, tuple)) and len(value) >= 2 and isinstance(value[0], (int, float)) and isinstance(value[1], (int, float)):
            longitude, latitude = float(value[0]), float(value[1])
            if -180 <= longitude <= 180 and -90 <= latitude <= 90:
                values.append((longitude, latitude))
            return
        if isinstance(value, (list, tuple)):
            for child in value:
                visit(child)

    visit(geometry["coordinates"])
    if not values:
        return None
    longitudes, latitudes = zip(*values)
    return [min(longitudes), min(latitudes), max(longitudes), max(latitudes)]


def _reduced_properties(source: dict[str, Any], allowed: Iterable[str]) -> dict[str, Any]:
    output: dict[str, Any] = {}
    for key in allowed:
        value = source.get(key)
        if value is None or isinstance(value, (str, int, float, bool)):
            if isinstance(value, str) and len(value) > 2_000:
                value = value[:2_000]
            output[key] = value
    return output


def normalize_usgs(feature: Any) -> NormalizedEvent:
    if not isinstance(feature, dict) or not isinstance(feature.get("id"), str) or not isinstance(feature.get("properties"), dict):
        raise ContextIngestionError("USGS feature lacks a stable id or properties")
    properties = feature["properties"]
    observed = _parse_time(properties.get("time"), field="USGS time")
    if observed is None:
        raise ContextIngestionError("USGS time is required")
    return NormalizedEvent(
        source_event_key=feature["id"],
        source_url=_safe_text(properties.get("url"), field="USGS url", maximum=2_048),
        source_observed_at=observed,
        source_updated_at=_parse_time(properties.get("updated"), field="USGS updated"),
        expires_at=None,
        severity=_safe_text(properties.get("alert"), field="USGS alert", maximum=32),
        urgency=None,
        geometry=_validate_geometry(feature.get("geometry")),
        bbox=_bbox(_validate_geometry(feature.get("geometry"))),
        properties=_reduced_properties(properties, ("mag", "place", "type", "status", "tsunami", "sig", "magType", "felt", "mmi", "detail")),
    )


def normalize_nws(feature: Any) -> NormalizedEvent:
    if not isinstance(feature, dict) or not isinstance(feature.get("id"), str) or not isinstance(feature.get("properties"), dict):
        raise ContextIngestionError("NWS feature lacks a stable id or properties")
    properties = feature["properties"]
    observed = _parse_time(properties.get("sent") or properties.get("onset"), field="NWS sent/onset")
    if observed is None:
        raise ContextIngestionError("NWS sent or onset is required")
    geometry = feature.get("geometry")
    if geometry is None:
        # NWS can publish non-polygon alerts. Such records remain meaningful but
        # are excluded from the spatial catalog because Context Globe only renders valid geometry.
        raise ContextIngestionError("NWS feature has no renderable geometry")
    validated_geometry = _validate_geometry(geometry)
    return NormalizedEvent(
        source_event_key=feature["id"],
        source_url=_safe_text(properties.get("@id"), field="NWS @id", maximum=2_048),
        source_observed_at=observed,
        source_updated_at=_parse_time(properties.get("effective"), field="NWS effective"),
        expires_at=_parse_time(properties.get("expires") or properties.get("ends"), field="NWS expires/ends"),
        severity=_safe_text(properties.get("severity"), field="NWS severity", maximum=32),
        urgency=_safe_text(properties.get("urgency"), field="NWS urgency", maximum=32),
        geometry=validated_geometry,
        bbox=_bbox(validated_geometry),
        properties=_reduced_properties(properties, ("event", "headline", "description", "instruction", "certainty", "response", "messageType", "category", "areaDesc", "senderName")),
    )


def fetch_source(layer_key: str, etag: str | None, last_modified: str | None, opener: Callable[..., Any] = urlopen) -> SourceFetch:
    if layer_key not in LAYER_SOURCES:
        raise ContextIngestionError("Context Globe layer is not approved")
    url, _ = LAYER_SOURCES[layer_key]
    headers = {"Accept": "application/geo+json, application/json;q=0.9", "User-Agent": "IDLR-Context-Globe/1.0"}
    if layer_key == "weather-alerts":
        user_agent = required_env("CONTEXT_NWS_USER_AGENT")
        if "\r" in user_agent or "\n" in user_agent or len(user_agent) > 256:
            raise ContextIngestionError("CONTEXT_NWS_USER_AGENT is invalid")
        headers["User-Agent"] = user_agent
    if etag:
        headers["If-None-Match"] = etag
    if last_modified:
        headers["If-Modified-Since"] = last_modified
    request = Request(url, headers=headers, method="GET")
    try:
        with opener(request, timeout=15) as response:
            status = int(response.getcode())
            if status != 200:
                raise ContextIngestionError(f"Approved source returned unexpected HTTP {status}")
            body = response.read(MAX_SOURCE_BYTES + 1)
            if len(body) > MAX_SOURCE_BYTES:
                raise ContextIngestionError("Approved source exceeded maximum response size")
            return SourceFetch(status=status, body=body, etag=response.headers.get("ETag"), last_modified=response.headers.get("Last-Modified"))
    except HTTPError as error:
        if error.code == 304:
            return SourceFetch(status=304, body=None, etag=error.headers.get("ETag"), last_modified=error.headers.get("Last-Modified"))
        raise ContextIngestionError(f"Approved source returned HTTP {error.code}") from error


def _database_connection():
    return psycopg2.connect(required_env("DATABASE_URL"), connect_timeout=10)


def _layer_record(cursor: Any, layer_key: str) -> tuple[int, str | None, str | None]:
    cursor.execute("SELECT id, source_endpoint, source_name FROM context_layers WHERE layer_key=%s AND enabled=true", (layer_key,))
    row = cursor.fetchone()
    if not row:
        raise ContextIngestionError("Context Globe layer is unavailable")
    expected, _ = LAYER_SOURCES[layer_key]
    if row[1] != expected:
        raise ContextIngestionError("Context Globe layer source does not match the approved source contract")
    return int(row[0]), row[1], row[2]


def _latest_validators(cursor: Any, layer_id: int) -> tuple[str | None, str | None]:
    cursor.execute("SELECT source_etag, source_last_modified FROM context_ingestion_runs WHERE layer_id=%s AND http_status=200 ORDER BY started_at DESC LIMIT 1", (layer_id,))
    row = cursor.fetchone()
    return (row[0], row[1]) if row else (None, None)


def _write_iceberg(events: list[NormalizedEvent], layer_key: str, run_key: str, source_checksum: str | None, report: dict[str, Any]) -> None:
    import pyarrow as pa

    manager = get_catalog_manager()
    initialize_context_globe_tables(manager)
    now = utc_now()
    snapshots = [
        {
            "snapshot_id": f"{run_key}:{event.source_event_key}", "layer_key": layer_key, "source_event_key": event.source_event_key,
            "source_url": event.source_url, "source_observed_at": event.source_observed_at, "source_updated_at": event.source_updated_at,
            "expires_at": event.expires_at, "quality_state": "verified", "severity": event.severity, "urgency": event.urgency,
            "geometry_geojson": json.dumps(event.geometry, separators=(",", ":")), "properties_json": json.dumps(event.properties, separators=(",", ":")),
            "source_checksum_sha256": source_checksum or "", "ingested_at": now,
        }
        for event in events
    ]
    catalog = manager.get_catalog()
    if snapshots:
        catalog.load_table("events.context_globe_snapshots").append(pa.Table.from_pylist(snapshots))
    catalog.load_table("governance.context_globe_ingestion_runs").append(pa.Table.from_pylist([{
        "run_key": run_key, "layer_key": layer_key, "http_status": report["http_status"], "source_etag": report["source_etag"],
        "source_last_modified": report["source_last_modified"], "source_checksum_sha256": source_checksum,
        "received_count": report["received_count"], "accepted_count": report["accepted_count"], "rejected_count": report["rejected_count"],
        "quality_state": report["quality_state"], "failure_reason": report.get("failure_reason"), "started_at": report["started_at"], "completed_at": report["completed_at"],
    }]))


def _publish_dapr(layer_key: str, run_key: str, accepted_count: int) -> None:
    endpoint = os.getenv("DAPR_HTTP_ENDPOINT", "").strip()
    if not endpoint:
        return
    pubsub = os.getenv("CONTEXT_DAPR_PUBSUB", "pubsub").strip()
    if not re.fullmatch(r"[A-Za-z0-9_.-]{1,128}", pubsub):
        raise ContextIngestionError("CONTEXT_DAPR_PUBSUB is invalid")
    request = Request(
        f"{endpoint.rstrip('/')}/v1.0/publish/{pubsub}/context.events",
        data=json.dumps({"layerKey": layer_key, "runKey": run_key, "acceptedCount": accepted_count, "occurredAt": utc_now().isoformat()}).encode("utf-8"),
        headers={"Content-Type": "application/json", "User-Agent": "IDLR-Context-Globe/1.0"},
        method="POST",
    )
    try:
        with urlopen(request, timeout=8) as response:
            if response.getcode() not in {200, 204}:
                raise ContextIngestionError(f"Dapr publish returned HTTP {response.getcode()}")
    except Exception as exc:
        raise ContextIngestionError("Dapr context-event publish failed") from exc


def ingest_layer(layer_key: str, opener: Callable[..., Any] = urlopen) -> dict[str, Any]:
    if layer_key not in LAYER_SOURCES:
        raise ContextIngestionError("Context Globe layer is not approved")
    started_at = utc_now()
    run_key = f"context-{layer_key}-{uuid4()}"
    connection = _database_connection()
    try:
        with connection:
            with connection.cursor() as cursor:
                layer_id, _, _ = _layer_record(cursor, layer_key)
                etag, last_modified = _latest_validators(cursor, layer_id)
        fetched = fetch_source(layer_key, etag, last_modified, opener=opener)
        if fetched.status == 304:
            report = {"http_status": 304, "source_etag": fetched.etag or etag, "source_last_modified": fetched.last_modified or last_modified, "received_count": 0, "accepted_count": 0, "rejected_count": 0, "quality_state": "verified", "started_at": started_at, "completed_at": utc_now()}
            with connection:
                with connection.cursor() as cursor:
                    cursor.execute("INSERT INTO context_ingestion_runs (layer_id, run_key, source_etag, source_last_modified, http_status, received_count, accepted_count, rejected_count, quality_state, started_at, completed_at) VALUES (%s,%s,%s,%s,%s,0,0,0,'verified',%s,%s)", (layer_id, run_key, report["source_etag"], report["source_last_modified"], 304, report["started_at"], report["completed_at"]))
            _write_iceberg([], layer_key, run_key, None, report)
            INGESTIONS.labels(layer_key, "not_modified").inc(); LAST_SUCCESS.labels(layer_key).set(time.time()); return {"layerKey": layer_key, "runKey": run_key, **report}
        assert fetched.body is not None
        checksum = sha256(fetched.body).hexdigest()
        payload = json.loads(fetched.body.decode("utf-8"))
        features = payload.get("features") if isinstance(payload, dict) else None
        if not isinstance(features, list) or len(features) > 20_000:
            raise ContextIngestionError("Approved source response lacks a bounded GeoJSON feature collection")
        normalizer = normalize_usgs if layer_key == "seismic" else normalize_nws
        accepted: list[NormalizedEvent] = []
        rejected = 0
        for feature in features:
            try:
                accepted.append(normalizer(feature))
            except ContextIngestionError:
                rejected += 1
        if features and not accepted:
            raise ContextIngestionError("All approved source events failed quality validation")
        completed_at = utc_now()
        report = {"http_status": 200, "source_etag": fetched.etag, "source_last_modified": fetched.last_modified, "received_count": len(features), "accepted_count": len(accepted), "rejected_count": rejected, "quality_state": "verified" if not rejected else "degraded", "started_at": started_at, "completed_at": completed_at}
        with connection:
            with connection.cursor() as cursor:
                layer_id, _, _ = _layer_record(cursor, layer_key)
                cursor.execute("INSERT INTO context_ingestion_runs (layer_id, run_key, source_etag, source_last_modified, source_checksum_sha256, http_status, received_count, accepted_count, rejected_count, quality_state, started_at, completed_at) VALUES (%s,%s,%s,%s,%s,200,%s,%s,%s,%s,%s,%s) RETURNING id", (layer_id, run_key, fetched.etag, fetched.last_modified, checksum, len(features), len(accepted), rejected, report["quality_state"], started_at, completed_at))
                run_id = cursor.fetchone()[0]
                for event in accepted:
                    cursor.execute("INSERT INTO context_events (layer_id, source_event_key, source_url, source_observed_at, source_updated_at, expires_at, event_status, quality_state, severity, urgency, geometry, bbox, properties, source_checksum_sha256, ingestion_run_id, last_seen_at, updated_at) VALUES (%s,%s,%s,%s,%s,%s,'active','verified',%s,%s,%s,%s,%s,%s,%s,now(),now()) ON CONFLICT (layer_id, source_event_key) DO UPDATE SET source_url=EXCLUDED.source_url, source_observed_at=EXCLUDED.source_observed_at, source_updated_at=EXCLUDED.source_updated_at, expires_at=EXCLUDED.expires_at, event_status='active', quality_state='verified', severity=EXCLUDED.severity, urgency=EXCLUDED.urgency, geometry=EXCLUDED.geometry, bbox=EXCLUDED.bbox, properties=EXCLUDED.properties, source_checksum_sha256=EXCLUDED.source_checksum_sha256, ingestion_run_id=EXCLUDED.ingestion_run_id, last_seen_at=now(), updated_at=now()", (layer_id, event.source_event_key, event.source_url, event.source_observed_at, event.source_updated_at, event.expires_at, event.severity, event.urgency, Json(event.geometry), Json(event.bbox), Json(event.properties), checksum, run_id))
        _write_iceberg(accepted, layer_key, run_key, checksum, report)
        _publish_dapr(layer_key, run_key, len(accepted))
        INGESTIONS.labels(layer_key, "success").inc(); EVENTS.labels(layer_key, "verified").inc(len(accepted)); EVENTS.labels(layer_key, "rejected").inc(rejected); LAST_SUCCESS.labels(layer_key).set(time.time())
        return {"layerKey": layer_key, "runKey": run_key, **report}
    except Exception:
        INGESTIONS.labels(layer_key, "failed").inc()
        raise
    finally:
        connection.close()


def run_once() -> list[dict[str, Any]]:
    return [ingest_layer("seismic"), ingest_layer("weather-alerts")]


def main() -> None:
    metrics_port = int(os.getenv("CONTEXT_INGEST_METRICS_PORT", "8093"))
    start_http_server(metrics_port)
    poll_seconds = int(os.getenv("CONTEXT_INGEST_POLL_SECONDS", "15"))
    if not 5 <= poll_seconds <= 60:
        raise ContextIngestionError("CONTEXT_INGEST_POLL_SECONDS must be between 5 and 60")
    last_attempt: dict[str, float] = {layer_key: 0.0 for layer_key in LAYER_SOURCES}
    while True:
        now = time.monotonic()
        for layer_key in ("seismic", "weather-alerts"):
            refresh_seconds = 60 if layer_key == "seismic" else 120
            if now - last_attempt[layer_key] < refresh_seconds:
                continue
            last_attempt[layer_key] = now
            try:
                ingest_layer(layer_key)
            except Exception as exc:
                print(json.dumps({"service": "context-globe-ingestion", "layerKey": layer_key, "outcome": "failed", "error": str(exc)}), flush=True)
        time.sleep(poll_seconds)


if __name__ == "__main__":
    main()
