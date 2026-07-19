"""
IDLR Data Lakehouse API
Provides REST endpoints for analytics queries and data ingestion.

This implementation prefers real PostgreSQL-backed analytics when the Iceberg
catalog is unavailable so the lakehouse integration remains operational instead
of degrading to static mock payloads.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional
import os
import sys
import json

import psycopg2
from psycopg2.extras import RealDictCursor, Json, execute_values
from fastapi import FastAPI, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# Add parent directory to path for imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

try:
    from catalog.iceberg_catalog import get_catalog
except ImportError:
    get_catalog = None

app = FastAPI(
    title="IDLR Lakehouse API",
    description="Data analytics and ingestion API for IDLR platform",
    version="1.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ParcelAnalyticsRequest(BaseModel):
    filters: Dict[str, Any] = Field(default_factory=dict)
    aggregations: List[str] = Field(default_factory=list)
    limit: int = 1000


class TransactionTrendsRequest(BaseModel):
    start_date: str
    end_date: str
    group_by: str = "day"
    metrics: List[str] = Field(default_factory=lambda: ["count", "volume"])


class DataIngestionRequest(BaseModel):
    data: List[Dict[str, Any]]
    mode: str = "append"


def get_postgres_url() -> str:
    return os.getenv("POSTGRES_URL") or os.getenv("DATABASE_URL") or "postgresql://idlr_user:idlr_password@localhost:5432/idlr_pts"


def get_connection():
    return psycopg2.connect(get_postgres_url(), cursor_factory=RealDictCursor, connect_timeout=5)


def table_exists(table_name: str) -> bool:
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(
            """
            SELECT EXISTS (
              SELECT 1
              FROM information_schema.tables
              WHERE table_schema = 'public' AND table_name = %s
            ) AS exists
            """,
            (table_name,),
        )
        row = cur.fetchone()
        return bool(row and row["exists"])


def get_table_columns(table_name: str) -> List[str]:
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(
            """
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = %s
            ORDER BY ordinal_position
            """,
            (table_name,),
        )
        return [row["column_name"] for row in cur.fetchall()]


def pick_column(columns: List[str], candidates: List[str]) -> Optional[str]:
    lower = {col.lower(): col for col in columns}
    for candidate in candidates:
        if candidate.lower() in lower:
            return lower[candidate.lower()]
    return None


def build_simple_filters(columns: List[str], filters: Dict[str, Any]) -> tuple[str, List[Any]]:
    clauses: List[str] = []
    params: List[Any] = []
    lower = {col.lower(): col for col in columns}

    for raw_key, raw_value in (filters or {}).items():
        column = lower.get(raw_key.lower())
        if not column:
            continue

        if isinstance(raw_value, dict):
            if "$gt" in raw_value:
                clauses.append(f'"{column}" > %s')
                params.append(raw_value["$gt"])
            if "$gte" in raw_value:
                clauses.append(f'"{column}" >= %s')
                params.append(raw_value["$gte"])
            if "$lt" in raw_value:
                clauses.append(f'"{column}" < %s')
                params.append(raw_value["$lt"])
            if "$lte" in raw_value:
                clauses.append(f'"{column}" <= %s')
                params.append(raw_value["$lte"])
            if "$in" in raw_value and isinstance(raw_value["$in"], list) and raw_value["$in"]:
                placeholders = ", ".join(["%s"] * len(raw_value["$in"]))
                clauses.append(f'"{column}" IN ({placeholders})')
                params.extend(raw_value["$in"])
        else:
            clauses.append(f'"{column}" = %s')
            params.append(raw_value)

    where_clause = " AND ".join(clauses) if clauses else "TRUE"
    return where_clause, params


def normalise_group_by(value: str) -> str:
    return value if value in {"day", "week", "month"} else "day"


@app.get("/health")
async def health_check():
    catalog_available = get_catalog is not None
    postgres_available = False
    postgres_message = None

    try:
        with get_connection() as conn, conn.cursor() as cur:
            cur.execute("SELECT 1 AS ok")
            postgres_available = bool(cur.fetchone()["ok"] == 1)
    except Exception as exc:  # pragma: no cover - operational branch
        postgres_message = str(exc)

    return {
        "status": "healthy" if postgres_available else "degraded",
        "timestamp": datetime.utcnow().isoformat(),
        "catalog_available": catalog_available,
        "postgres_available": postgres_available,
        "postgres_message": postgres_message,
    }


@app.post("/analytics/parcels")
async def query_parcel_analytics(request: ParcelAnalyticsRequest):
    try:
        if not table_exists("parcels"):
            return {"data": [], "total_rows": 0, "query_time_ms": 0}

        columns = get_table_columns("parcels")
        state_col = pick_column(columns, ["state", "location_state", "region", "state_name"])
        area_col = pick_column(columns, ["area_sqm", "size_sqm", "land_size_sqm", "area"])
        value_col = pick_column(columns, ["market_value", "assessed_value", "estimated_value", "value", "property_value"])
        where_clause, params = build_simple_filters(columns, request.filters)
        group_expr = f'COALESCE("{state_col}"::text, \'Unknown\')' if state_col else "'All Parcels'"

        select_parts = [f"{group_expr} AS state", "COUNT(*)::int AS count"]
        if area_col:
            select_parts.append(f'ROUND(AVG(COALESCE("{area_col}"::numeric, 0)), 2) AS avg_area_sqm')
        if value_col:
            select_parts.append(f'ROUND(SUM(COALESCE("{value_col}"::numeric, 0)), 2) AS total_value')

        query = f"""
            SELECT {', '.join(select_parts)}
            FROM parcels
            WHERE {where_clause}
            GROUP BY 1
            ORDER BY count DESC
            LIMIT %s
        """
        params.append(request.limit)

        started = datetime.utcnow()
        with get_connection() as conn, conn.cursor() as cur:
            cur.execute(query, params)
            rows = cur.fetchall()
        elapsed = int((datetime.utcnow() - started).total_seconds() * 1000)

        return {
            "data": rows,
            "total_rows": len(rows),
            "query_time_ms": elapsed,
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/analytics/transactions")
async def query_transaction_trends(request: TransactionTrendsRequest):
    try:
        if not table_exists("transactions"):
            return {"data": [], "total_rows": 0, "query_time_ms": 0}

        columns = get_table_columns("transactions")
        date_col = pick_column(columns, ["created_at", "createdAt", "transaction_date", "completed_at", "updated_at"])
        value_col = pick_column(columns, ["amount", "transaction_value", "sale_price", "purchase_price", "value"])
        if not date_col:
            return {"data": [], "total_rows": 0, "query_time_ms": 0}

        bucket = normalise_group_by(request.group_by)
        select_parts = [f"DATE_TRUNC('{bucket}', \"{date_col}\")::date AS date", "COUNT(*)::int AS transaction_count"]
        if value_col:
            select_parts.append(f'ROUND(SUM(COALESCE("{value_col}"::numeric, 0)), 2) AS total_volume')
            select_parts.append(f'ROUND(AVG(COALESCE("{value_col}"::numeric, 0)), 2) AS avg_transaction_value')

        query = f"""
            SELECT {', '.join(select_parts)}
            FROM transactions
            WHERE "{date_col}" >= %s AND "{date_col}" <= %s
            GROUP BY 1
            ORDER BY 1 ASC
        """

        started = datetime.utcnow()
        with get_connection() as conn, conn.cursor() as cur:
            cur.execute(query, (request.start_date, request.end_date))
            rows = cur.fetchall()
        elapsed = int((datetime.utcnow() - started).total_seconds() * 1000)

        return {
            "data": rows,
            "total_rows": len(rows),
            "query_time_ms": elapsed,
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/analytics/property-values")
async def query_property_values(filters: Dict[str, Any] = Body(default_factory=dict)):
    try:
        if not table_exists("parcels"):
            return {"data": [], "total_rows": 0}

        columns = get_table_columns("parcels")
        locality_col = pick_column(columns, ["lga", "city", "district", "location", "state"])
        value_col = pick_column(columns, ["market_value", "assessed_value", "estimated_value", "value", "property_value"])
        area_col = pick_column(columns, ["area_sqm", "size_sqm", "land_size_sqm", "area"])
        if not value_col:
            return {"data": [], "total_rows": 0}

        where_clause, params = build_simple_filters(columns, filters)
        location_expr = f'COALESCE("{locality_col}"::text, \'Unknown\')' if locality_col else "'Portfolio'"
        sample_area = f', ROUND(AVG(COALESCE("{area_col}"::numeric, 0)), 2) AS avg_area_sqm' if area_col else ''

        query = f"""
            SELECT
              {location_expr} AS location,
              ROUND(AVG(COALESCE("{value_col}"::numeric, 0)), 2) AS median_value,
              ROUND(AVG(COALESCE("{value_col}"::numeric, 0)), 2) AS avg_value_per_sqm,
              COUNT(*)::int AS sample_size
              {sample_area}
            FROM parcels
            WHERE {where_clause}
            GROUP BY 1
            ORDER BY median_value DESC
            LIMIT 20
        """

        with get_connection() as conn, conn.cursor() as cur:
            cur.execute(query, params)
            rows = cur.fetchall()

        return {"data": rows, "total_rows": len(rows)}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/ingest/{table_name}")
async def ingest_data(table_name: str, request: DataIngestionRequest):
    try:
        if not request.data:
            return {
                "status": "success",
                "table": table_name,
                "rows_ingested": 0,
                "mode": request.mode,
                "timestamp": datetime.utcnow().isoformat(),
            }

        if not table_exists(table_name):
            raise HTTPException(status_code=404, detail=f"Table '{table_name}' not found")

        columns = get_table_columns(table_name)
        payload_keys = [key for key in request.data[0].keys() if key in columns]
        if not payload_keys:
            raise HTTPException(status_code=400, detail="No payload keys match target table columns")

        rows = [[record.get(key) for key in payload_keys] for record in request.data]
        column_list = ", ".join([f'"{key}"' for key in payload_keys])

        with get_connection() as conn, conn.cursor() as cur:
            if request.mode == "overwrite":
                cur.execute(f'TRUNCATE TABLE "{table_name}" RESTART IDENTITY CASCADE')

            execute_values(
                cur,
                f'INSERT INTO "{table_name}" ({column_list}) VALUES %s',
                rows,
            )

            if table_exists("lakehouse_sync_jobs"):
                cur.execute(
                    """
                    INSERT INTO lakehouse_sync_jobs
                    (job_type, table_name, source_entity, status, payload, result_summary, records_processed, started_at, finished_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, NOW(), NOW())
                    """,
                    (
                        "ingest",
                        table_name,
                        table_name,
                        "succeeded",
                        Json({"mode": request.mode}),
                        Json({"rows": len(request.data)}),
                        len(request.data),
                    ),
                )
            conn.commit()

        return {
            "status": "success",
            "table": table_name,
            "rows_ingested": len(request.data),
            "mode": request.mode,
            "timestamp": datetime.utcnow().isoformat(),
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/ingest/bulk")
async def bulk_ingest(tables: Dict[str, List[Dict[str, Any]]]):
    try:
        results = {}
        for table_name, data in tables.items():
            request = DataIngestionRequest(data=data)
            results[table_name] = await ingest_data(table_name, request)

        return {
            "status": "success",
            "tables": results,
            "timestamp": datetime.utcnow().isoformat(),
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/query/sql")
async def execute_sql_query(query: str = Body(..., embed=True), params: Optional[Dict[str, Any]] = Body(default=None)):
    try:
        normalized = query.strip().lower()
        if not (normalized.startswith("select") or normalized.startswith("with")):
            raise HTTPException(status_code=400, detail="Only read-only SELECT queries are allowed")

        with get_connection() as conn, conn.cursor() as cur:
            cur.execute(query, params or {})
            rows = cur.fetchall()

            if table_exists("lakehouse_query_audit"):
                cur.execute(
                    """
                    INSERT INTO lakehouse_query_audit
                    (query_type, target_table, query_text, filters, result_row_count, status, executed_at)
                    VALUES (%s, %s, %s, %s, %s, %s, NOW())
                    """,
                    (
                        "sql",
                        None,
                        query,
                        Json(params or {}),
                        len(rows),
                        "succeeded",
                    ),
                )
                conn.commit()

        return {
            "data": rows,
            "total_rows": len(rows),
            "query_time_ms": 0,
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("LAKEHOUSE_API_PORT", "8000"))
    host = os.getenv("LAKEHOUSE_API_HOST", "0.0.0.0")
    uvicorn.run(app, host=host, port=port, log_level="info", access_log=True)


class TitleRiskAnalyticsRequest(BaseModel):
    dispute_count: int = 0
    encumbrance_count: int = 0
    document_mismatch_count: int = 0
    verification_gap_count: int = 0
    ownership_change_count: int = 0
    transaction_value: float = 0.0


@app.post("/analytics/title-risk/score")
async def score_title_risk(request: TitleRiskAnalyticsRequest):
    score = 12
    score += min(request.dispute_count * 12, 30)
    score += min(request.encumbrance_count * 10, 25)
    score += min(request.document_mismatch_count * 14, 28)
    score += min(request.verification_gap_count * 10, 20)
    score += min(request.ownership_change_count * 6, 18)
    if request.transaction_value >= 100000000:
        score += 6
    elif request.transaction_value >= 25000000:
        score += 3

    score = max(0, min(100, score))
    band = "low"
    if score >= 75:
        band = "critical"
    elif score >= 55:
        band = "high"
    elif score >= 35:
        band = "medium"

    drivers: List[str] = []
    if request.dispute_count:
        drivers.append("dispute_history")
    if request.encumbrance_count:
        drivers.append("encumbrances")
    if request.document_mismatch_count:
        drivers.append("document_mismatch")
    if request.verification_gap_count:
        drivers.append("verification_gaps")
    if request.ownership_change_count >= 3:
        drivers.append("frequent_ownership_changes")
    if request.transaction_value >= 25000000:
        drivers.append("high_value_transaction")

    return {
        "score": score,
        "band": band,
        "drivers": drivers,
        "explanation": f"Risk band is {band} with a score of {score} based on dispute, encumbrance, verification, and document-signal intensity.",
        "generated_at": datetime.utcnow().isoformat(),
    }


@app.get("/analytics/title-risk/portfolio-summary")
async def title_risk_portfolio_summary():
    try:
        if not table_exists("transactions"):
            return {
                "total_transactions": 0,
                "high_value_transactions": 0,
                "portfolio_risk_score": 0,
                "generated_at": datetime.utcnow().isoformat(),
            }

        columns = get_table_columns("transactions")
        value_col = pick_column(columns, ["amount", "transaction_value", "sale_price", "purchase_price", "value"])
        status_col = pick_column(columns, ["status", "transaction_status"])

        select_parts = ["COUNT(*)::int AS total_transactions"]
        if value_col:
            select_parts.append(
                f"COUNT(*) FILTER (WHERE COALESCE(\"{value_col}\"::numeric, 0) >= 25000000)::int AS high_value_transactions"
            )
            select_parts.append(
                f"ROUND(AVG(COALESCE(\"{value_col}\"::numeric, 0)), 2) AS avg_transaction_value"
            )
        if status_col:
            select_parts.append(
                f"COUNT(*) FILTER (WHERE LOWER(COALESCE(\"{status_col}\"::text, '')) IN ('pending', 'disputed', 'flagged'))::int AS elevated_review_transactions"
            )

        query = f"SELECT {', '.join(select_parts)} FROM transactions"
        with get_connection() as conn, conn.cursor() as cur:
            cur.execute(query)
            row = cur.fetchone() or {}

        total_transactions = int(row.get("total_transactions") or 0)
        high_value_transactions = int(row.get("high_value_transactions") or 0)
        elevated_review_transactions = int(row.get("elevated_review_transactions") or 0)
        portfolio_risk_score = 0
        if total_transactions > 0:
            portfolio_risk_score = min(
                100,
                round(((high_value_transactions * 1.5) + (elevated_review_transactions * 2.5)) / total_transactions * 25),
            )

        return {
            "total_transactions": total_transactions,
            "high_value_transactions": high_value_transactions,
            "elevated_review_transactions": elevated_review_transactions,
            "avg_transaction_value": row.get("avg_transaction_value"),
            "portfolio_risk_score": portfolio_risk_score,
            "generated_at": datetime.utcnow().isoformat(),
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/analytics/search-insights")
async def search_insights():
    try:
        if not table_exists("saved_searches"):
            return {
                "saved_search_count": 0,
                "popular_locations": [],
                "generated_at": datetime.utcnow().isoformat(),
            }

        columns = get_table_columns("saved_searches")
        location_col = pick_column(columns, ["location", "query", "search_term", "keywords"])
        created_col = pick_column(columns, ["created_at", "createdAt", "updated_at"])

        if not location_col:
            return {
                "saved_search_count": 0,
                "popular_locations": [],
                "generated_at": datetime.utcnow().isoformat(),
            }

        date_filter = ""
        params: List[Any] = []
        if created_col:
            date_filter = f"WHERE \"{created_col}\" >= NOW() - INTERVAL '30 days'"

        query = f'''
            SELECT
              COALESCE("{location_col}"::text, 'Unknown') AS term,
              COUNT(*)::int AS usage_count
            FROM saved_searches
            {date_filter}
            GROUP BY 1
            ORDER BY usage_count DESC
            LIMIT 10
        '''

        with get_connection() as conn, conn.cursor() as cur:
            cur.execute(query, params)
            rows = cur.fetchall()
            cur.execute("SELECT COUNT(*)::int AS total FROM saved_searches")
            total_row = cur.fetchone() or {"total": 0}

        diversity_score = 0
        if rows:
            total_usage = sum(int(row.get("usage_count") or 0) for row in rows)
            top_share = int(rows[0].get("usage_count") or 0) / total_usage if total_usage else 0
            diversity_score = round((1 - top_share) * 100)

        return {
            "saved_search_count": int(total_row.get("total") or 0),
            "popular_locations": rows,
            "diversity_score": diversity_score,
            "generated_at": datetime.utcnow().isoformat(),
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
