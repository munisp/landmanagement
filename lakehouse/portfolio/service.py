"""Governed portfolio analytics helpers for the Lakehouse API.

These functions only produce aggregate, provenance-labelled operational metrics. They
intentionally do not make legal, appraisal, underwriting, emergency, or investment decisions.
"""
from __future__ import annotations

from collections import Counter
from datetime import datetime, timezone
from typing import Any, Iterable


def _bounded_text(value: Any, field: str, minimum: int = 1, maximum: int = 160) -> str:
    if not isinstance(value, str):
        raise ValueError(f"{field} must be text")
    normalized = value.strip()
    if not (minimum <= len(normalized) <= maximum):
        raise ValueError(f"{field} length is invalid")
    return normalized


def privacy_suppressed_report(
    *, name: str, cohort_size: int, minimum_cohort: int, measures: dict[str, Any], source_references: Iterable[str]
) -> dict[str, Any]:
    """Return only a threshold-protected aggregate report."""
    _bounded_text(name, "name", 2, 200)
    if not isinstance(cohort_size, int) or not isinstance(minimum_cohort, int) or cohort_size < 0 or minimum_cohort < 5:
        raise ValueError("cohort controls are invalid")
    if not isinstance(measures, dict) or len(measures) > 64:
        raise ValueError("measures must be a bounded object")
    references = sorted({_bounded_text(item, "source reference", 2, 160) for item in source_references})
    if not references:
        raise ValueError("at least one source reference is required")
    suppressed = cohort_size < minimum_cohort
    return {
        "name": name.strip(),
        "cohortSize": cohort_size,
        "minimumCohort": minimum_cohort,
        "suppressed": suppressed,
        "measures": {} if suppressed else measures,
        "sourceReferences": references,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "decisionBoundary": "Aggregate planning information only; no re-identification, individual prediction, or decision output.",
    }


def exposure_layer_summary(events: Iterable[dict[str, Any]], allowed_layers: Iterable[str]) -> dict[str, Any]:
    """Aggregate attributed public-context events by allowed layer and quality state."""
    layers = {_bounded_text(layer, "layer", 2, 64).lower() for layer in allowed_layers}
    if not layers or len(layers) > 16:
        raise ValueError("allowed layer scope is invalid")
    counts: Counter[str] = Counter()
    quality: Counter[str] = Counter()
    references: set[str] = set()
    seen = 0
    for event in events:
        if not isinstance(event, dict):
            raise ValueError("event must be an object")
        layer = _bounded_text(event.get("layerKey"), "layerKey", 2, 64).lower()
        if layer not in layers:
            continue
        source = _bounded_text(event.get("sourceReference"), "sourceReference", 2, 160)
        state = _bounded_text(event.get("qualityState", "unknown"), "qualityState", 2, 64)
        counts[layer] += 1
        quality[state] += 1
        references.add(source)
        seen += 1
        if seen > 50_000:
            raise ValueError("event batch exceeds aggregate safety limit")
    return {
        "layerCounts": dict(sorted(counts.items())),
        "qualityCounts": dict(sorted(quality.items())),
        "sourceReferences": sorted(references),
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "decisionBoundary": "Attributed contextual exposure summary only; it is not a safety, claims, underwriting, or investment decision.",
    }


def portfolio_usage_rollup(events: Iterable[dict[str, Any]]) -> dict[str, Any]:
    """Roll up append-only product usage events without individual user profiling."""
    products: Counter[str] = Counter()
    metrics: Counter[str] = Counter()
    count = 0
    for event in events:
        if not isinstance(event, dict):
            raise ValueError("usage event must be an object")
        product = _bounded_text(event.get("productKey"), "productKey", 2, 64)
        metric = _bounded_text(event.get("metricKey"), "metricKey", 2, 96)
        quantity = event.get("quantity")
        if not isinstance(quantity, int) or quantity < 0 or quantity > 1_000_000:
            raise ValueError("usage quantity is invalid")
        products[product] += quantity
        metrics[metric] += quantity
        count += 1
        if count > 100_000:
            raise ValueError("usage batch exceeds rollup limit")
    return {"productTotals": dict(sorted(products.items())), "metricTotals": dict(sorted(metrics.items())), "eventCount": count, "generatedAt": datetime.now(timezone.utc).isoformat()}
