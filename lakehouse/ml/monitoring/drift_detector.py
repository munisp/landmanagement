"""
IDLR Land Registry - Model Drift Detection & Monitoring
========================================================
Implements:
- Population Stability Index (PSI) for feature drift
- Kolmogorov-Smirnov test for distribution shift
- Performance degradation alerts
- Continuous retraining triggers
"""
from __future__ import annotations

import json
import logging
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import numpy as np
from scipy import stats

logger = logging.getLogger(__name__)


def compute_psi(
    expected: np.ndarray,
    actual: np.ndarray,
    n_bins: int = 10,
) -> float:
    """
    Population Stability Index (PSI).
    PSI < 0.1: No significant change
    PSI 0.1–0.2: Moderate change, monitor
    PSI > 0.2: Significant change, retrain
    """
    expected = np.clip(expected, 1e-10, None)
    actual = np.clip(actual, 1e-10, None)

    breakpoints = np.percentile(expected, np.linspace(0, 100, n_bins + 1))
    breakpoints[0] = -np.inf
    breakpoints[-1] = np.inf

    exp_counts = np.histogram(expected, bins=breakpoints)[0]
    act_counts = np.histogram(actual, bins=breakpoints)[0]

    exp_pct = exp_counts / max(exp_counts.sum(), 1)
    act_pct = act_counts / max(act_counts.sum(), 1)

    # Avoid division by zero
    exp_pct = np.where(exp_pct == 0, 1e-6, exp_pct)
    act_pct = np.where(act_pct == 0, 1e-6, act_pct)

    psi = np.sum((act_pct - exp_pct) * np.log(act_pct / exp_pct))
    return float(psi)


def compute_ks_test(
    expected: np.ndarray,
    actual: np.ndarray,
) -> Tuple[float, float]:
    """Kolmogorov-Smirnov test for distribution shift. Returns (statistic, p_value)."""
    statistic, p_value = stats.ks_2samp(expected, actual)
    return float(statistic), float(p_value)


class ModelDriftMonitor:
    """
    Monitors model inputs and outputs for drift.
    Triggers retraining when drift is detected.
    """
    def __init__(
        self,
        model_name: str,
        baseline_dir: str = "/home/ubuntu/landmanagement/lakehouse/ml/baselines",
        alert_dir: str = "/home/ubuntu/landmanagement/lakehouse/ml/alerts",
        psi_threshold: float = 0.2,
        ks_p_threshold: float = 0.05,
        performance_drop_threshold: float = 0.05,
    ):
        self.model_name = model_name
        self.baseline_dir = Path(baseline_dir)
        self.alert_dir = Path(alert_dir)
        self.baseline_dir.mkdir(parents=True, exist_ok=True)
        self.alert_dir.mkdir(parents=True, exist_ok=True)
        self.psi_threshold = psi_threshold
        self.ks_p_threshold = ks_p_threshold
        self.performance_drop_threshold = performance_drop_threshold

    def save_baseline(
        self,
        feature_distributions: Dict[str, np.ndarray],
        baseline_metric: float,
        metric_name: str = "auc",
    ):
        """Save baseline feature distributions and performance metric."""
        baseline = {
            "model_name": self.model_name,
            "saved_at": datetime.utcnow().isoformat(),
            "metric_name": metric_name,
            "baseline_metric": baseline_metric,
            "feature_stats": {
                name: {
                    "mean": float(arr.mean()),
                    "std": float(arr.std()),
                    "percentiles": np.percentile(arr, [5, 25, 50, 75, 95]).tolist(),
                    "samples": arr[:1000].tolist(),  # Store first 1000 samples for KS test
                }
                for name, arr in feature_distributions.items()
            },
        }
        path = self.baseline_dir / f"{self.model_name}_baseline.json"
        with open(path, "w") as f:
            json.dump(baseline, f, indent=2)
        logger.info(f"Baseline saved for {self.model_name}")

    def load_baseline(self) -> Optional[Dict]:
        path = self.baseline_dir / f"{self.model_name}_baseline.json"
        if not path.exists():
            return None
        with open(path) as f:
            return json.load(f)

    def check_drift(
        self,
        current_features: Dict[str, np.ndarray],
        current_metric: Optional[float] = None,
    ) -> Dict:
        """
        Check for feature drift and performance degradation.
        Returns drift report with alerts.
        """
        baseline = self.load_baseline()
        if baseline is None:
            return {"status": "no_baseline", "alerts": []}

        alerts: List[Dict] = []
        feature_drift: Dict[str, Dict] = {}

        for feature_name, current_arr in current_features.items():
            if feature_name not in baseline["feature_stats"]:
                continue

            baseline_samples = np.array(baseline["feature_stats"][feature_name]["samples"])

            # PSI
            psi = compute_psi(baseline_samples, current_arr)

            # KS test
            ks_stat, ks_p = compute_ks_test(baseline_samples, current_arr)

            feature_drift[feature_name] = {
                "psi": round(psi, 4),
                "ks_statistic": round(ks_stat, 4),
                "ks_p_value": round(ks_p, 4),
                "drift_detected": psi > self.psi_threshold or ks_p < self.ks_p_threshold,
            }

            if psi > self.psi_threshold:
                alerts.append({
                    "type": "feature_drift",
                    "severity": "high" if psi > 0.4 else "medium",
                    "feature": feature_name,
                    "psi": round(psi, 4),
                    "message": f"PSI={psi:.4f} exceeds threshold {self.psi_threshold}",
                })

            if ks_p < self.ks_p_threshold:
                alerts.append({
                    "type": "distribution_shift",
                    "severity": "medium",
                    "feature": feature_name,
                    "ks_p_value": round(ks_p, 4),
                    "message": f"KS p-value={ks_p:.4f} below threshold {self.ks_p_threshold}",
                })

        # Performance degradation check
        performance_alert = None
        if current_metric is not None:
            baseline_metric = baseline.get("baseline_metric", 0)
            drop = baseline_metric - current_metric
            if drop > self.performance_drop_threshold:
                performance_alert = {
                    "type": "performance_degradation",
                    "severity": "critical" if drop > 0.1 else "high",
                    "metric_name": baseline.get("metric_name", "metric"),
                    "baseline_value": round(baseline_metric, 4),
                    "current_value": round(current_metric, 4),
                    "drop": round(drop, 4),
                    "message": f"Performance dropped by {drop:.4f}",
                }
                alerts.append(performance_alert)

        needs_retraining = (
            len([a for a in alerts if a["severity"] in ["high", "critical"]]) >= 2
            or (performance_alert is not None and performance_alert["severity"] == "critical")
        )

        report = {
            "model_name": self.model_name,
            "checked_at": datetime.utcnow().isoformat(),
            "n_features_checked": len(feature_drift),
            "n_drifted_features": sum(1 for v in feature_drift.values() if v["drift_detected"]),
            "feature_drift": feature_drift,
            "alerts": alerts,
            "needs_retraining": needs_retraining,
            "recommendation": (
                "RETRAIN IMMEDIATELY" if needs_retraining else
                "MONITOR CLOSELY" if alerts else
                "OK"
            ),
        }

        # Save alert report
        if alerts:
            alert_path = self.alert_dir / f"{self.model_name}_drift_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.json"
            with open(alert_path, "w") as f:
                json.dump(report, f, indent=2)
            logger.warning(f"Drift detected for {self.model_name}: {len(alerts)} alerts")

        return report


class ContinuousTrainingPipeline:
    """
    Orchestrates continuous model retraining based on:
    - Scheduled retraining (weekly)
    - Drift-triggered retraining
    - New labeled data accumulation
    """
    def __init__(
        self,
        model_name: str,
        min_new_samples: int = 500,
        retrain_interval_days: int = 7,
    ):
        self.model_name = model_name
        self.min_new_samples = min_new_samples
        self.retrain_interval_days = retrain_interval_days
        self.state_dir = Path("/home/ubuntu/landmanagement/lakehouse/ml/pipeline_state")
        self.state_dir.mkdir(parents=True, exist_ok=True)

    def should_retrain(self, drift_report: Dict, n_new_samples: int) -> Tuple[bool, str]:
        """Determine if retraining should be triggered."""
        if drift_report.get("needs_retraining"):
            return True, "drift_detected"

        if n_new_samples >= self.min_new_samples:
            return True, "sufficient_new_data"

        state_path = self.state_dir / f"{self.model_name}_last_trained.json"
        if state_path.exists():
            with open(state_path) as f:
                state = json.load(f)
            last_trained = datetime.fromisoformat(state["last_trained"])
            days_since = (datetime.utcnow() - last_trained).days
            if days_since >= self.retrain_interval_days:
                return True, f"scheduled_{days_since}d_since_last_train"

        return False, "no_trigger"

    def record_training(self, metrics: Dict):
        """Record that training occurred."""
        state = {
            "model_name": self.model_name,
            "last_trained": datetime.utcnow().isoformat(),
            "metrics": metrics,
        }
        with open(self.state_dir / f"{self.model_name}_last_trained.json", "w") as f:
            json.dump(state, f, indent=2)
        logger.info(f"Recorded training for {self.model_name}: {metrics}")


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    rng = np.random.default_rng(42)

    # Simulate baseline
    monitor = ModelDriftMonitor("fraud_detection")
    baseline_features = {
        "log_amount": rng.normal(15, 2, 1000),
        "price_deviation_ratio": rng.exponential(1.0, 1000),
        "payment_risk": rng.beta(2, 5, 1000),
    }
    monitor.save_baseline(baseline_features, baseline_metric=0.92, metric_name="auc")

    # Simulate drift
    drifted_features = {
        "log_amount": rng.normal(18, 3, 500),  # Mean shifted
        "price_deviation_ratio": rng.exponential(3.0, 500),  # Distribution changed
        "payment_risk": rng.beta(5, 2, 500),  # Flipped distribution
    }
    report = monitor.check_drift(drifted_features, current_metric=0.84)
    logger.info(f"Drift report: {report['recommendation']}, {len(report['alerts'])} alerts")
    logger.info(f"Needs retraining: {report['needs_retraining']}")
