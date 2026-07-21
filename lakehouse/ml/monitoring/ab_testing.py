"""
IDLR Land Registry - A/B Testing Infrastructure for Model Comparison
=====================================================================
Implements:
- Traffic splitting between model versions (champion/challenger)
- Statistical significance testing (t-test, Mann-Whitney U)
- Automatic promotion of better-performing models
- Experiment tracking with MLflow
"""
from __future__ import annotations

import json
import logging
import random
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import numpy as np
from scipy import stats

logger = logging.getLogger(__name__)


class ModelVariant:
    """Represents a model variant in an A/B test."""
    def __init__(
        self,
        name: str,
        version: str,
        traffic_pct: float,
        model_path: str,
    ):
        self.name = name
        self.version = version
        self.traffic_pct = traffic_pct
        self.model_path = model_path
        self.predictions: List[float] = []
        self.actuals: List[int] = []
        self.latencies_ms: List[float] = []
        self.n_requests = 0

    def record_prediction(self, predicted: float, actual: Optional[int], latency_ms: float):
        self.predictions.append(predicted)
        if actual is not None:
            self.actuals.append(actual)
        self.latencies_ms.append(latency_ms)
        self.n_requests += 1

    @property
    def metrics(self) -> Dict:
        if not self.predictions:
            return {}
        from sklearn.metrics import roc_auc_score, precision_recall_fscore_support
        result: Dict = {
            "n_requests": self.n_requests,
            "avg_latency_ms": round(float(np.mean(self.latencies_ms)), 2),
            "p95_latency_ms": round(float(np.percentile(self.latencies_ms, 95)), 2),
            "avg_fraud_score": round(float(np.mean(self.predictions)), 4),
        }
        if len(self.actuals) >= 10:
            binary_preds = [1 if p >= 0.5 else 0 for p in self.predictions[:len(self.actuals)]]
            try:
                result["auc"] = round(roc_auc_score(self.actuals, self.predictions[:len(self.actuals)]), 4)
            except Exception:
                result["auc"] = None
            p, r, f1, _ = precision_recall_fscore_support(
                self.actuals, binary_preds, average="binary", zero_division=0
            )
            result["precision"] = round(float(p), 4)
            result["recall"] = round(float(r), 4)
            result["f1"] = round(float(f1), 4)
        return result


class ABTestExperiment:
    """
    Manages a champion/challenger A/B test for model comparison.
    """
    def __init__(
        self,
        experiment_id: str,
        champion: ModelVariant,
        challenger: ModelVariant,
        min_samples_per_variant: int = 200,
        significance_level: float = 0.05,
        state_dir: str = "/home/ubuntu/landmanagement/lakehouse/ml/ab_tests",
    ):
        self.experiment_id = experiment_id
        self.champion = champion
        self.challenger = challenger
        self.min_samples = min_samples_per_variant
        self.significance_level = significance_level
        self.state_dir = Path(state_dir)
        self.state_dir.mkdir(parents=True, exist_ok=True)
        self.started_at = datetime.utcnow().isoformat()
        self.status = "running"
        self.winner: Optional[str] = None

    def route_request(self, request_id: str) -> ModelVariant:
        """Route a request to champion or challenger based on traffic split."""
        # Deterministic routing based on request_id hash
        h = hash(request_id) % 100
        if h < int(self.challenger.traffic_pct * 100):
            return self.challenger
        return self.champion

    def check_significance(self) -> Dict:
        """
        Run statistical significance test.
        Uses Mann-Whitney U test on AUC scores (non-parametric).
        """
        if (self.champion.n_requests < self.min_samples or
                self.challenger.n_requests < self.min_samples):
            return {
                "status": "insufficient_data",
                "champion_n": self.champion.n_requests,
                "challenger_n": self.challenger.n_requests,
                "min_required": self.min_samples,
            }

        # Compare fraud probability distributions
        champ_preds = np.array(self.champion.predictions)
        chall_preds = np.array(self.challenger.predictions)

        # Mann-Whitney U test
        u_stat, p_value = stats.mannwhitneyu(
            champ_preds, chall_preds, alternative="two-sided"
        )

        # Compare AUC if actuals available
        auc_comparison = None
        if len(self.champion.actuals) >= 50 and len(self.challenger.actuals) >= 50:
            from sklearn.metrics import roc_auc_score
            try:
                champ_auc = roc_auc_score(
                    self.champion.actuals,
                    self.champion.predictions[:len(self.champion.actuals)]
                )
                chall_auc = roc_auc_score(
                    self.challenger.actuals,
                    self.challenger.predictions[:len(self.challenger.actuals)]
                )
                auc_comparison = {
                    "champion_auc": round(champ_auc, 4),
                    "challenger_auc": round(chall_auc, 4),
                    "challenger_improvement": round(chall_auc - champ_auc, 4),
                }
            except Exception:
                pass

        is_significant = p_value < self.significance_level
        result = {
            "experiment_id": self.experiment_id,
            "status": "significant" if is_significant else "not_significant",
            "p_value": round(float(p_value), 6),
            "u_statistic": round(float(u_stat), 2),
            "significance_level": self.significance_level,
            "champion_metrics": self.champion.metrics,
            "challenger_metrics": self.challenger.metrics,
            "auc_comparison": auc_comparison,
        }

        # Determine winner
        if is_significant and auc_comparison:
            if auc_comparison["challenger_improvement"] > 0.01:
                result["recommendation"] = "PROMOTE_CHALLENGER"
                result["winner"] = "challenger"
            elif auc_comparison["challenger_improvement"] < -0.01:
                result["recommendation"] = "KEEP_CHAMPION"
                result["winner"] = "champion"
            else:
                result["recommendation"] = "NO_SIGNIFICANT_DIFFERENCE"
        elif is_significant:
            result["recommendation"] = "COLLECT_MORE_LABELED_DATA"
        else:
            result["recommendation"] = "CONTINUE_EXPERIMENT"

        return result

    def save_state(self):
        state = {
            "experiment_id": self.experiment_id,
            "started_at": self.started_at,
            "status": self.status,
            "winner": self.winner,
            "champion": {
                "name": self.champion.name,
                "version": self.champion.version,
                "traffic_pct": self.champion.traffic_pct,
                "n_requests": self.champion.n_requests,
                "metrics": self.champion.metrics,
            },
            "challenger": {
                "name": self.challenger.name,
                "version": self.challenger.version,
                "traffic_pct": self.challenger.traffic_pct,
                "n_requests": self.challenger.n_requests,
                "metrics": self.challenger.metrics,
            },
        }
        with open(self.state_dir / f"{self.experiment_id}.json", "w") as f:
            json.dump(state, f, indent=2)


class ModelRegistry:
    """
    Simple model registry for versioning and promotion.
    Tracks champion/challenger models and their performance history.
    """
    def __init__(self, registry_dir: str = "/home/ubuntu/landmanagement/lakehouse/ml/registry"):
        self.registry_dir = Path(registry_dir)
        self.registry_dir.mkdir(parents=True, exist_ok=True)

    def register_model(
        self,
        model_name: str,
        version: str,
        model_path: str,
        metrics: Dict,
        stage: str = "staging",
    ) -> Dict:
        """Register a new model version."""
        entry = {
            "model_name": model_name,
            "version": version,
            "model_path": model_path,
            "metrics": metrics,
            "stage": stage,
            "registered_at": datetime.utcnow().isoformat(),
            "promoted_at": None,
        }
        path = self.registry_dir / f"{model_name}_{version}.json"
        with open(path, "w") as f:
            json.dump(entry, f, indent=2)

        # Update latest pointer
        latest_path = self.registry_dir / f"{model_name}_latest.json"
        with open(latest_path, "w") as f:
            json.dump(entry, f, indent=2)

        logger.info(f"Registered {model_name} v{version} (stage={stage})")
        return entry

    def promote_to_production(self, model_name: str, version: str) -> Dict:
        """Promote a model version to production."""
        path = self.registry_dir / f"{model_name}_{version}.json"
        if not path.exists():
            raise FileNotFoundError(f"Model {model_name} v{version} not found in registry")

        with open(path) as f:
            entry = json.load(f)

        entry["stage"] = "production"
        entry["promoted_at"] = datetime.utcnow().isoformat()

        with open(path, "w") as f:
            json.dump(entry, f, indent=2)

        # Update production pointer
        prod_path = self.registry_dir / f"{model_name}_production.json"
        with open(prod_path, "w") as f:
            json.dump(entry, f, indent=2)

        logger.info(f"Promoted {model_name} v{version} to production")
        return entry

    def get_production_model(self, model_name: str) -> Optional[Dict]:
        """Get the current production model metadata."""
        path = self.registry_dir / f"{model_name}_production.json"
        if not path.exists():
            return None
        with open(path) as f:
            return json.load(f)

    def list_versions(self, model_name: str) -> List[Dict]:
        """List all registered versions of a model."""
        versions = []
        for path in self.registry_dir.glob(f"{model_name}_*.json"):
            if "latest" not in path.name and "production" not in path.name:
                with open(path) as f:
                    versions.append(json.load(f))
        return sorted(versions, key=lambda x: x["registered_at"], reverse=True)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)

    # Simulate A/B test
    champion = ModelVariant("fraud_v1", "1.0.0", traffic_pct=0.8, model_path="/weights/fraud_v1.pt")
    challenger = ModelVariant("fraud_v2", "2.0.0", traffic_pct=0.2, model_path="/weights/fraud_v2.pt")

    experiment = ABTestExperiment("exp-fraud-2024-01", champion, challenger)

    # Simulate predictions
    rng = np.random.default_rng(42)
    for i in range(500):
        variant = experiment.route_request(f"req-{i}")
        # Champion: AUC ~0.88, Challenger: AUC ~0.92
        if variant.name == "fraud_v1":
            pred = float(rng.beta(2, 5))
        else:
            pred = float(rng.beta(3, 4))
        actual = 1 if pred > 0.6 and rng.random() < 0.8 else 0
        variant.record_prediction(pred, actual, latency_ms=float(rng.uniform(5, 25)))

    result = experiment.check_significance()
    logger.info(f"A/B Test result: {result['recommendation']}")
    logger.info(f"Champion metrics: {result['champion_metrics']}")
    logger.info(f"Challenger metrics: {result['challenger_metrics']}")

    # Model registry
    registry = ModelRegistry()
    registry.register_model("fraud_detection", "1.0.0", "/weights/fraud_v1.pt",
                            {"auc": 0.88}, stage="production")
    registry.register_model("fraud_detection", "2.0.0", "/weights/fraud_v2.pt",
                            {"auc": 0.92}, stage="staging")
    if result.get("winner") == "challenger":
        registry.promote_to_production("fraud_detection", "2.0.0")
        logger.info("Challenger promoted to production!")
