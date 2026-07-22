"""
IDLR Land Registry - Ray Distributed Training Pipeline
=======================================================
Implements:
- Distributed hyperparameter tuning with Ray Tune
- Parallel model training across multiple workers
- Lakehouse data pipeline integration
- Continuous training orchestration
"""
from __future__ import annotations

import json
import logging
import os
import sys
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional

import numpy as np
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import DataLoader, TensorDataset

logger = logging.getLogger(__name__)


def required_training_env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise RuntimeError(f"{name} must be configured for verified continuous training")
    return value


def required_positive_int_env(name: str) -> int:
    value = required_training_env(name)
    try:
        parsed = int(value)
    except ValueError as error:
        raise RuntimeError(f"{name} must be a positive integer") from error
    if parsed < 1:
        raise RuntimeError(f"{name} must be a positive integer")
    return parsed

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

try:
    import ray
    from ray import tune
    from ray.tune.schedulers import ASHAScheduler
    RAY_AVAILABLE = True
except ImportError:
    RAY_AVAILABLE = False
    logger.warning("Ray not available, falling back to single-process training")


def train_fraud_model_trial(config: Dict) -> Dict:
    """
    Single training trial for Ray Tune hyperparameter search.
    Returns validation AUC for the given hyperparameter config.
    """
    from models.fraud_model import (
        FraudDetectionMLP, generate_nigerian_training_data, extract_features
    )
    from sklearn.preprocessing import StandardScaler
    from sklearn.metrics import roc_auc_score
    from torch.utils.data import random_split

    # Generate data
    transactions, labels = generate_nigerian_training_data(
        n_legitimate=4000, n_fraudulent=1000, seed=42
    )
    X = np.array([extract_features(tx) for tx in transactions])
    y = np.array(labels, dtype=np.float32)

    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    X_t = torch.tensor(X_scaled, dtype=torch.float32)
    y_t = torch.tensor(y, dtype=torch.float32)
    ds = TensorDataset(X_t, y_t)
    n = len(ds)
    n_train = int(0.8 * n)
    train_ds, val_ds = random_split(
        ds, [n_train, n - n_train],
        generator=torch.Generator().manual_seed(42)
    )
    train_loader = DataLoader(train_ds, batch_size=int(config["batch_size"]), shuffle=True)
    val_loader = DataLoader(val_ds, batch_size=256)

    hidden_dims = [int(config["hidden_dim_1"]), int(config["hidden_dim_2"]), int(config["hidden_dim_3"])]
    model = FraudDetectionMLP(input_dim=18, hidden_dims=hidden_dims, dropout=config["dropout"])

    n_pos = sum(labels)
    n_neg = len(labels) - n_pos
    pos_weight = torch.tensor([n_neg / max(n_pos, 1)])
    criterion = nn.BCEWithLogitsLoss(pos_weight=pos_weight)
    optimizer = optim.Adam(model.parameters(), lr=config["lr"], weight_decay=config["weight_decay"])

    for epoch in range(30):
        model.train()
        for X_b, y_b in train_loader:
            optimizer.zero_grad()
            loss = criterion(model(X_b), y_b)
            loss.backward()
            optimizer.step()

        model.eval()
        val_preds, val_labels = [], []
        with torch.no_grad():
            for X_b, y_b in val_loader:
                probs = torch.sigmoid(model(X_b)).numpy()
                val_preds.extend(probs.tolist())
                val_labels.extend(y_b.numpy().tolist())

        try:
            val_auc = roc_auc_score(val_labels, val_preds)
        except Exception:
            val_auc = 0.5

        if RAY_AVAILABLE:
            tune.report({"val_auc": val_auc, "epoch": epoch})

    return {"val_auc": val_auc}


def run_hyperparameter_search(n_trials: int = 20) -> Dict:
    """Run distributed hyperparameter search with Ray Tune."""
    if not RAY_AVAILABLE:
        logger.warning("Ray not available, running single trial with default config")
        default_config = {
            "lr": 1e-3,
            "batch_size": 256,
            "hidden_dim_1": 128,
            "hidden_dim_2": 64,
            "hidden_dim_3": 32,
            "dropout": 0.3,
            "weight_decay": 1e-4,
        }
        return train_fraud_model_trial(default_config)

    ray.init(ignore_reinit_error=True, num_cpus=os.cpu_count())

    search_space = {
        "lr": tune.loguniform(1e-4, 1e-2),
        "batch_size": tune.choice([128, 256, 512]),
        "hidden_dim_1": tune.choice([64, 128, 256]),
        "hidden_dim_2": tune.choice([32, 64, 128]),
        "hidden_dim_3": tune.choice([16, 32, 64]),
        "dropout": tune.uniform(0.1, 0.5),
        "weight_decay": tune.loguniform(1e-5, 1e-3),
    }

    scheduler = ASHAScheduler(
        metric="val_auc",
        mode="max",
        max_t=30,
        grace_period=5,
        reduction_factor=2,
    )

    result = tune.run(
        train_fraud_model_trial,
        config=search_space,
        num_samples=n_trials,
        scheduler=scheduler,
        resources_per_trial={"cpu": 2},
        verbose=1,
    )

    best_trial = result.get_best_trial("val_auc", "max", "last")
    best_config = best_trial.config
    best_auc = best_trial.last_result["val_auc"]

    logger.info(f"Best hyperparameters: {best_config}")
    logger.info(f"Best validation AUC: {best_auc:.4f}")

    # Save best config
    output_dir = Path("/home/ubuntu/landmanagement/lakehouse/ml/tuning")
    output_dir.mkdir(parents=True, exist_ok=True)
    with open(output_dir / "best_fraud_config.json", "w") as f:
        json.dump({
            "config": best_config,
            "val_auc": best_auc,
            "n_trials": n_trials,
            "searched_at": datetime.utcnow().isoformat(),
        }, f, indent=2)

    ray.shutdown()
    return {"best_config": best_config, "best_val_auc": best_auc}


class LakehouseDataPipeline:
    """Pull verified labeled training examples from the authenticated Lakehouse API."""

    def __init__(self, lakehouse_url: Optional[str] = None):
        self.lakehouse_url = (lakehouse_url or os.getenv("LAKEHOUSE_API_URL", "")).strip().rstrip("/")
        self.api_key = os.getenv("LAKEHOUSE_API_KEY", "").strip()
        if not self.lakehouse_url or not self.api_key:
            raise RuntimeError("LAKEHOUSE_API_URL and LAKEHOUSE_API_KEY are required for continuous training")

    def fetch_fraud_training_data(
        self,
        start_date: str,
        end_date: str,
        min_labeled: int,
    ) -> Dict:
        """Fetch verified labeled fraud examples; never synthesize replacements."""
        import requests

        try:
            response = requests.get(
                f"{self.lakehouse_url}/api/v1/training-data/fraud",
                params={
                    "start_date": start_date,
                    "end_date": end_date,
                    "min_labeled": min_labeled,
                },
                headers={"X-API-Key": self.api_key},
                timeout=30,
            )
            response.raise_for_status()
            data = response.json()
        except Exception as error:
            raise RuntimeError(f"Verified Lakehouse fraud-training data is unavailable: {error}") from error

        transactions = data.get("transactions")
        labels = data.get("labels")
        if not isinstance(transactions, list) or not isinstance(labels, list) or len(transactions) != len(labels):
            raise RuntimeError("Lakehouse returned invalid fraud-training examples")
        if len(transactions) < min_labeled:
            raise RuntimeError(f"Lakehouse returned {len(transactions)} labeled examples; at least {min_labeled} are required")
        logger.info(f"Fetched {len(transactions)} verified fraud-training examples from Lakehouse")
        return data


class ContinuousTrainingOrchestrator:
    """
    Orchestrates the full continuous training pipeline:
    1. Fetch new data from Lakehouse
    2. Check for drift
    3. Run hyperparameter search if needed
    4. Train new model
    5. Run A/B test
    6. Promote if better
    """
    def __init__(self):
        self.pipeline = LakehouseDataPipeline()
        artifact_dir = os.getenv("MODEL_ARTIFACT_DIR", "").strip()
        if not artifact_dir:
            raise RuntimeError("MODEL_ARTIFACT_DIR must be configured for continuous training")
        self.weights_dir = Path(artifact_dir)
        self.weights_dir.mkdir(parents=True, exist_ok=True)

    def run_full_pipeline(self, force_retrain: bool = False) -> Dict:
        """Run the complete continuous training pipeline."""
        logger.info("=" * 60)
        logger.info("Starting continuous training pipeline")
        logger.info("=" * 60)

        # 1. Fetch data
        logger.info("Step 1: Fetching training data from Lakehouse...")
        data = self.pipeline.fetch_fraud_training_data(
            start_date=required_training_env("FRAUD_TRAINING_START_DATE"),
            end_date=required_training_env("FRAUD_TRAINING_END_DATE"),
            min_labeled=required_positive_int_env("FRAUD_TRAINING_MIN_LABELED"),
        )
        transactions = data["transactions"]
        labels = data["labels"]
        logger.info(f"  Got {len(transactions)} samples ({sum(labels)} fraud)")

        # 2. Train fraud model
        logger.info("Step 2: Training fraud detection model...")
        from models.fraud_model import FraudModelTrainer
        trainer = FraudModelTrainer(model_dir=str(self.weights_dir))
        fraud_results = trainer.train(transactions, labels)
        logger.info(f"  Fraud model AUC: {fraud_results['test_metrics']['auc']:.4f}")

        # Persist only the model trained from verified Lakehouse examples.
        pipeline_state = {
            "run_at": datetime.utcnow().isoformat(),
            "n_samples": len(transactions),
            "training_source": "verified_lakehouse",
            "fraud_model": fraud_results["test_metrics"],
        }
        state_path = self.weights_dir / "pipeline_state.json"
        with open(state_path, "w") as f:
            json.dump(pipeline_state, f, indent=2)

        logger.info("=" * 60)
        logger.info("Pipeline complete!")
        logger.info(f"  Fraud AUC:    {fraud_results['test_metrics']['auc']:.4f}")
        logger.info("=" * 60)

        return pipeline_state


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    orchestrator = ContinuousTrainingOrchestrator()
    results = orchestrator.run_full_pipeline()
    logger.info(f"Pipeline completed: {json.dumps(results, indent=2)}")
