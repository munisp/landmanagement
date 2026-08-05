"""Protected Context Globe ingestion and status endpoints for the Lakehouse API."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, HTTPException
import psycopg2
from psycopg2.extras import RealDictCursor

from context_globe.service import ContextIngestionError, ingest_layer

router = APIRouter(prefix="/context-globe", tags=["context-globe"])


def _connection():
    from api.main import get_postgres_url

    return psycopg2.connect(get_postgres_url(), cursor_factory=RealDictCursor, connect_timeout=5)


@router.get("/status")
def status() -> dict[str, Any]:
    try:
        with _connection() as connection, connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT l.layer_key, l.display_name, l.enabled, l.refresh_seconds,
                       r.quality_state, r.http_status, r.accepted_count, r.rejected_count,
                       r.started_at, r.completed_at
                FROM context_layers l
                LEFT JOIN LATERAL (
                  SELECT quality_state, http_status, accepted_count, rejected_count, started_at, completed_at
                  FROM context_ingestion_runs
                  WHERE layer_id=l.id
                  ORDER BY started_at DESC
                  LIMIT 1
                ) r ON true
                ORDER BY l.layer_key
                """
            )
            layers = [dict(row) for row in cursor.fetchall()]
        return {
            "service": "context-globe-ingestion",
            "status": "ready" if layers and all(row["enabled"] for row in layers) else "degraded",
            "observedAt": datetime.now(timezone.utc).isoformat(),
            "layers": layers,
        }
    except Exception as exc:
        raise HTTPException(status_code=503, detail="Context Globe persistence is unavailable") from exc


@router.post("/ingest/{layer_key}")
def ingest(layer_key: str) -> dict[str, Any]:
    if layer_key not in {"seismic", "weather-alerts"}:
        raise HTTPException(status_code=400, detail="Context Globe layer is not approved")
    try:
        return ingest_layer(layer_key)
    except ContextIngestionError as exc:
        raise HTTPException(status_code=502, detail="Context Globe source ingestion failed") from exc
    except Exception as exc:
        raise HTTPException(status_code=503, detail="Context Globe ingestion is unavailable") from exc
