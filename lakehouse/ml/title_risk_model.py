"""CPU-only title-risk model lifecycle.

The module intentionally never fabricates labels or synthesizes a fallback model.
An inference request succeeds only after a model has been trained from verified
platform examples and persisted to the configured artifact directory.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from hashlib import sha256
from pathlib import Path
from typing import Any, Dict, Iterable, List, Tuple
import json
import os

import joblib
import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, brier_score_loss, roc_auc_score
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

MODEL_NAME = "title-risk-logistic-cpu"
FEATURE_NAMES: Tuple[str, ...] = (
    "dispute_count",
    "encumbrance_count",
    "document_mismatch_count",
    "verification_gap_count",
    "ownership_change_count",
    "transaction_value",
)
MIN_TRAINING_ROWS = int(os.getenv("TITLE_RISK_MIN_TRAINING_ROWS", "20"))


class ModelUnavailableError(RuntimeError):
    """Raised when inference is requested before a verified model is available."""


def artifact_directory() -> Path:
    configured = os.getenv("MODEL_WEIGHTS_DIR")
    if configured:
        directory = Path(configured)
    else:
        directory = Path(__file__).resolve().parent / "weights"
    directory.mkdir(parents=True, exist_ok=True)
    return directory


def artifact_path() -> Path:
    return artifact_directory() / "title_risk_logistic_cpu.joblib"


def metadata_path() -> Path:
    return artifact_directory() / "title_risk_logistic_cpu.metadata.json"


def normalize_features(features: Dict[str, Any]) -> List[float]:
    normalized: List[float] = []
    for feature in FEATURE_NAMES:
        if feature not in features:
            raise ValueError(f"Missing required title-risk feature: {feature}")
        value = float(features[feature])
        if not np.isfinite(value) or value < 0:
            raise ValueError(f"Feature {feature} must be a finite non-negative value")
        normalized.append(value)
    return normalized


def _version_for_artifact(path: Path) -> str:
    digest = sha256(path.read_bytes()).hexdigest()[:16]
    return f"sha256:{digest}"


def _band_for_probability(probability: float) -> str:
    thresholds = {
        "medium": float(os.getenv("TITLE_RISK_MEDIUM_THRESHOLD", "0.35")),
        "high": float(os.getenv("TITLE_RISK_HIGH_THRESHOLD", "0.55")),
        "critical": float(os.getenv("TITLE_RISK_CRITICAL_THRESHOLD", "0.75")),
    }
    if not 0 < thresholds["medium"] < thresholds["high"] < thresholds["critical"] < 1:
        raise ValueError("Title-risk thresholds must satisfy 0 < medium < high < critical < 1")
    if probability >= thresholds["critical"]:
        return "critical"
    if probability >= thresholds["high"]:
        return "high"
    if probability >= thresholds["medium"]:
        return "medium"
    return "low"


@dataclass(frozen=True)
class TrainingResult:
    model_version: str
    artifact_uri: str
    training_rows: int
    positive_rows: int
    metrics: Dict[str, Any]
    feature_schema: Dict[str, Any]


def train_verified_examples(examples: Iterable[Dict[str, Any]]) -> TrainingResult:
    rows = list(examples)
    if len(rows) < MIN_TRAINING_ROWS:
        raise ValueError(f"At least {MIN_TRAINING_ROWS} verified examples are required to train {MODEL_NAME}")

    x = np.asarray([normalize_features(row["feature_vector"]) for row in rows], dtype=np.float64)
    y = np.asarray([1 if bool(row["label"]) else 0 for row in rows], dtype=np.int64)
    positive_rows = int(y.sum())
    if positive_rows == 0 or positive_rows == len(y):
        raise ValueError("Verified training examples must contain both risky and non-risky outcomes")

    random_state = int(os.getenv("TITLE_RISK_MODEL_RANDOM_STATE", "20260721"))
    pipeline = Pipeline([
        ("scaler", StandardScaler()),
        ("classifier", LogisticRegression(
            solver="liblinear",
            max_iter=2_000,
            class_weight="balanced",
            random_state=random_state,
        )),
    ])
    pipeline.fit(x, y)
    probabilities = pipeline.predict_proba(x)[:, 1]
    predictions = (probabilities >= 0.5).astype(np.int64)

    metrics: Dict[str, Any] = {
        "evaluation_scope": "training_set_only",
        "accuracy": round(float(accuracy_score(y, predictions)), 6),
        "brier_score": round(float(brier_score_loss(y, probabilities)), 6),
        "positive_rate": round(float(positive_rows / len(rows)), 6),
    }
    if len(np.unique(y)) == 2:
        metrics["roc_auc"] = round(float(roc_auc_score(y, probabilities)), 6)

    artifact = artifact_path()
    joblib.dump({"pipeline": pipeline, "feature_names": FEATURE_NAMES}, artifact)
    version = _version_for_artifact(artifact)
    feature_schema = {
        "features": list(FEATURE_NAMES),
        "label": "verified_title_risk_outcome",
        "model_type": "logistic_regression",
        "runtime": "cpu",
    }
    metadata = {
        "model_name": MODEL_NAME,
        "model_version": version,
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "training_rows": len(rows),
        "positive_rows": positive_rows,
        "metrics": metrics,
        "feature_schema": feature_schema,
    }
    metadata_path().write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    return TrainingResult(
        model_version=version,
        artifact_uri=str(artifact),
        training_rows=len(rows),
        positive_rows=positive_rows,
        metrics=metrics,
        feature_schema=feature_schema,
    )


def active_model_metadata() -> Dict[str, Any]:
    metadata_file = metadata_path()
    if not artifact_path().is_file() or not metadata_file.is_file():
        raise ModelUnavailableError("No trained title-risk model artifact is available")
    return json.loads(metadata_file.read_text(encoding="utf-8"))


def predict_title_risk(features: Dict[str, Any]) -> Dict[str, Any]:
    metadata = active_model_metadata()
    payload = joblib.load(artifact_path())
    pipeline: Pipeline = payload["pipeline"]
    feature_names = tuple(payload["feature_names"])
    if feature_names != FEATURE_NAMES:
        raise ModelUnavailableError("The persisted title-risk model has an incompatible feature schema")

    vector = np.asarray([normalize_features(features)], dtype=np.float64)
    probability = float(pipeline.predict_proba(vector)[0, 1])
    scaler: StandardScaler = pipeline.named_steps["scaler"]
    classifier: LogisticRegression = pipeline.named_steps["classifier"]
    scaled = scaler.transform(vector)[0]
    contributions = scaled * classifier.coef_[0]
    ranked = sorted(
        (
            {"feature": feature, "contribution": round(float(contribution), 6), "value": float(value)}
            for feature, contribution, value in zip(FEATURE_NAMES, contributions, vector[0])
        ),
        key=lambda item: abs(item["contribution"]),
        reverse=True,
    )
    drivers = [item for item in ranked if item["contribution"] > 0][:3]
    score = int(round(probability * 100))
    return {
        "score": score,
        "probability": round(probability, 6),
        "band": _band_for_probability(probability),
        "drivers": drivers,
        "model_name": metadata["model_name"],
        "model_version": metadata["model_version"],
        "trained_at": metadata["trained_at"],
        "evaluation_scope": metadata["metrics"].get("evaluation_scope"),
    }
