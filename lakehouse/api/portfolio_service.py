from __future__ import annotations

import os
import secrets
from typing import Any

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field

from portfolio.service import exposure_layer_summary, portfolio_usage_rollup, privacy_suppressed_report

router = APIRouter(prefix="/portfolio-analytics", tags=["portfolio-analytics"])


def _require_internal(authorization: str | None) -> None:
    expected = os.getenv("LAKEHOUSE_INTERNAL_TOKEN", "").strip()
    if len(expected) < 32 or not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="internal authorization required")
    if not secrets.compare_digest(authorization[7:], expected):
        raise HTTPException(status_code=401, detail="internal authorization required")


class PlanningReportRequest(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    cohortSize: int = Field(ge=0, le=10_000_000)
    minimumCohort: int = Field(ge=5, le=1_000_000)
    measures: dict[str, Any] = Field(max_length=64)
    sourceReferences: list[str] = Field(min_length=1, max_length=64)


class ExposureSummaryRequest(BaseModel):
    allowedLayers: list[str] = Field(min_length=1, max_length=16)
    events: list[dict[str, Any]] = Field(max_length=50_000)


class UsageRollupRequest(BaseModel):
    events: list[dict[str, Any]] = Field(max_length=100_000)


@router.post("/planning-report")
def planning_report(payload: PlanningReportRequest, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    _require_internal(authorization)
    try:
        return privacy_suppressed_report(name=payload.name, cohort_size=payload.cohortSize, minimum_cohort=payload.minimumCohort, measures=payload.measures, source_references=payload.sourceReferences)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/exposure-summary")
def exposure_summary(payload: ExposureSummaryRequest, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    _require_internal(authorization)
    try:
        return exposure_layer_summary(payload.events, payload.allowedLayers)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/usage-rollup")
def usage_rollup(payload: UsageRollupRequest, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    _require_internal(authorization)
    try:
        return portfolio_usage_rollup(payload.events)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
