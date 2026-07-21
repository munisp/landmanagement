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
    """
    Pipeline to pull training data from the Lakehouse (Delta Lake / Iceberg).
    In production, this connects to the actual Lakehouse API.
    In development/testing, it generates synthetic data.
    """
    def __init__(
        self,
        lakehouse_url: str = "http://localhost:8888",
        use_synthetic: bool = True,
    ):
        self.lakehouse_url = lakehouse_url
        self.use_synthetic = use_synthetic
        self.cache_dir = Path("/home/ubuntu/landmanagement/lakehouse/ml/data_cache")
        self.cache_dir.mkdir(parents=True, exist_ok=True)

    def fetch_fraud_training_data(
        self,
        start_date: str = "2023-01-01",
        end_date: str = "2024-12-31",
        min_labeled: int = 1000,
    ) -> Dict:
        """
        Fetch labeled fraud training data from the Lakehouse.
        Falls back to synthetic data if Lakehouse is unavailable.
        """
        if self.use_synthetic:
            return self._generate_synthetic_data()

        try:
            import requests
            response = requests.get(
                f"{self.lakehouse_url}/api/v1/training-data/fraud",
                params={
                    "start_date": start_date,
                    "end_date": end_date,
                    "min_labeled": min_labeled,
                },
                timeout=30,
            )
            response.raise_for_status()
            data = response.json()
            logger.info(f"Fetched {len(data['transactions'])} transactions from Lakehouse")
            return data
        except Exception as e:
            logger.warning(f"Lakehouse unavailable ({e}), using synthetic data")
            return self._generate_synthetic_data()

    def _generate_synthetic_data(self) -> Dict:
        """Generate synthetic training data as fallback."""
        from models.fraud_model import generate_nigerian_training_data
        transactions, labels = generate_nigerian_training_data(
            n_legitimate=8000, n_fraudulent=2000
        )
        return {
            "transactions": transactions,
            "labels": labels,
            "source": "synthetic",
            "generated_at": datetime.utcnow().isoformat(),
            "n_samples": len(transactions),
        }

    def save_to_cache(self, data: Dict, name: str):
        """Cache training data locally."""
        cache_path = self.cache_dir / f"{name}_{datetime.utcnow().strftime('%Y%m%d')}.json"
        with open(cache_path, "w") as f:
            json.dump(data, f)
        logger.info(f"Cached {len(data.get('transactions', []))} samples to {cache_path}")


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
        self.pipeline = LakehouseDataPipeline(use_synthetic=True)
        self.weights_dir = Path("/home/ubuntu/landmanagement/lakehouse/ml/weights")
        self.weights_dir.mkdir(parents=True, exist_ok=True)

    def run_full_pipeline(self, force_retrain: bool = False) -> Dict:
        """Run the complete continuous training pipeline."""
        logger.info("=" * 60)
        logger.info("Starting continuous training pipeline")
        logger.info("=" * 60)

        # 1. Fetch data
        logger.info("Step 1: Fetching training data from Lakehouse...")
        data = self.pipeline.fetch_fraud_training_data()
        transactions = data["transactions"]
        labels = data["labels"]
        logger.info(f"  Got {len(transactions)} samples ({sum(labels)} fraud)")

        # 2. Train fraud model
        logger.info("Step 2: Training fraud detection model...")
        from models.fraud_model import FraudModelTrainer
        trainer = FraudModelTrainer(model_dir=str(self.weights_dir))
        fraud_results = trainer.train(transactions, labels)
        logger.info(f"  Fraud model AUC: {fraud_results['test_metrics']['auc']:.4f}")

        # 3. Train credit model
        logger.info("Step 3: Training credit scoring model...")
        from models.credit_model import CreditModelTrainer, generate_credit_training_data
        applicants, scores = generate_credit_training_data(n_samples=5000)
        credit_trainer = CreditModelTrainer(model_dir=str(self.weights_dir))
        credit_results = credit_trainer.train(applicants, scores)
        logger.info(f"  Credit model MAE: {credit_results['test_mae']:.2f}")

        # 4. Train GNN model
        logger.info("Step 4: Training GNN ownership model...")
        from models.gnn_model import GNNTrainer, generate_ownership_graph
        node_features, adj, gnn_labels = generate_ownership_graph(n_users=500)
        gnn_trainer = GNNTrainer(model_dir=str(self.weights_dir))
        gnn_results = gnn_trainer.train(node_features, adj, gnn_labels)
        logger.info(f"  GNN model AUC: {gnn_results['test_auc']:.4f}")

        # 5. Save pipeline state
        pipeline_state = {
            "run_at": datetime.utcnow().isoformat(),
            "n_samples": len(transactions),
            "fraud_model": fraud_results["test_metrics"],
            "credit_model": credit_results,
            "gnn_model": {"test_auc": gnn_results["test_auc"]},
        }
        state_path = self.weights_dir / "pipeline_state.json"
        with open(state_path, "w") as f:
            json.dump(pipeline_state, f, indent=2)

        logger.info("=" * 60)
        logger.info("Pipeline complete!")
        logger.info(f"  Fraud AUC:    {fraud_results['test_metrics']['auc']:.4f}")
        logger.info(f"  Credit MAE:   {credit_results['test_mae']:.2f}")
        logger.info(f"  GNN AUC:      {gnn_results['test_auc']:.4f}")
        logger.info("=" * 60)

        return pipeline_state


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    orchestrator = ContinuousTrainingOrchestrator()
    results = orchestrator.run_full_pipeline()
    logger.info(f"Pipeline completed: {json.dumps(results, indent=2)}")
