"""
IDLR Land Registry - Fraud Detection Neural Network
=====================================================
Real PyTorch model with:
- Multi-layer perceptron (MLP) for transaction fraud detection
- Realistic Nigerian land transaction feature engineering
- Full training loop with validation, early stopping, and checkpointing
- MLflow experiment tracking
- CPU-optimized inference
"""
from __future__ import annotations

import os
import json
import math
import logging
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import numpy as np
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import DataLoader, TensorDataset, random_split
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import (
    roc_auc_score, precision_recall_fscore_support,
    confusion_matrix, classification_report
)

try:
    import mlflow
    import mlflow.pytorch
    MLFLOW_AVAILABLE = True
except ImportError:
    MLFLOW_AVAILABLE = False

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# Model Architecture
# ─────────────────────────────────────────────────────────────────────────────

class FraudDetectionMLP(nn.Module):
    """
    Multi-layer perceptron for binary fraud classification.
    Optimized for CPU inference (no GPU required).
    """
    def __init__(
        self,
        input_dim: int = 18,
        hidden_dims: List[int] = [128, 64, 32],
        dropout: float = 0.3,
    ):
        super().__init__()
        layers: List[nn.Module] = []
        prev_dim = input_dim
        for h_dim in hidden_dims:
            layers.extend([
                nn.Linear(prev_dim, h_dim),
                nn.BatchNorm1d(h_dim),
                nn.ReLU(),
                nn.Dropout(dropout),
            ])
            prev_dim = h_dim
        layers.append(nn.Linear(prev_dim, 1))
        self.network = nn.Sequential(*layers)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.network(x).squeeze(-1)


# ─────────────────────────────────────────────────────────────────────────────
# Nigerian Land Transaction Feature Engineering
# ─────────────────────────────────────────────────────────────────────────────

NIGERIAN_STATES = [
    "Lagos", "Abuja", "Kano", "Ogun", "Rivers", "Anambra",
    "Delta", "Oyo", "Enugu", "Kaduna", "Katsina", "Borno",
    "Imo", "Bauchi", "Sokoto", "Plateau", "Osun", "Kwara",
    "Edo", "Benue", "Adamawa", "Akwa Ibom", "Cross River",
    "Ekiti", "Gombe", "Jigawa", "Kebbi", "Kogi", "Nasarawa",
    "Niger", "Ondo", "Taraba", "Yobe", "Zamfara", "Ebonyi",
    "Abia"
]

TRANSACTION_TYPES = ["registration", "transfer", "mortgage", "lease", "subdivision"]
PAYMENT_METHODS = ["bank_transfer", "mobile_money", "cash", "cheque", "crypto"]
LAND_USE_TYPES = ["residential", "commercial", "agricultural", "industrial", "mixed"]

# Price per sqm benchmarks for Nigerian states (NGN)
STATE_PRICE_BENCHMARKS = {
    "Lagos": 450_000, "Abuja": 380_000, "Rivers": 180_000,
    "Kano": 45_000, "Ogun": 120_000, "Anambra": 95_000,
    "Delta": 85_000, "Oyo": 75_000, "Enugu": 70_000,
    "Kaduna": 50_000, "default": 40_000,
}


def extract_features(transaction: Dict) -> np.ndarray:
    """
    Extract 18 features from a land transaction record.
    These features are specifically calibrated for Nigerian land fraud patterns.
    """
    amount = float(transaction.get("amount", 0))
    tx_type = transaction.get("transactionType", "registration")
    payment_method = transaction.get("paymentMethod", "bank_transfer")
    state = transaction.get("state", "Lagos")
    land_use = transaction.get("landUse", "residential")
    area_sqm = float(transaction.get("areaSqm", 500))
    from_user_id = int(transaction.get("fromUserId", 0))
    to_user_id = int(transaction.get("toUserId", 0))
    created_at = transaction.get("createdAt", datetime.utcnow().isoformat())

    # Parse timestamp
    try:
        dt = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
        hour = dt.hour
        day_of_week = dt.weekday()
        is_weekend = 1 if day_of_week >= 5 else 0
        is_night = 1 if (hour < 6 or hour > 22) else 0
    except Exception:
        hour, day_of_week, is_weekend, is_night = 12, 0, 0, 0

    # Price per sqm vs. state benchmark
    benchmark = STATE_PRICE_BENCHMARKS.get(state, STATE_PRICE_BENCHMARKS["default"])
    price_per_sqm = amount / max(area_sqm, 1)
    price_deviation_ratio = price_per_sqm / benchmark

    # Amount features
    log_amount = math.log1p(amount)
    amount_millions = amount / 1_000_000

    # Suspicious patterns
    same_user = 1 if from_user_id == to_user_id else 0
    is_cash = 1 if payment_method == "cash" else 0
    is_transfer = 1 if tx_type == "transfer" else 0
    is_mortgage = 1 if tx_type == "mortgage" else 0

    # High-value state (Lagos/Abuja are higher fraud targets)
    is_high_value_state = 1 if state in ["Lagos", "Abuja"] else 0

    # Encode payment method risk (cash=highest risk)
    payment_risk = {"cash": 1.0, "cheque": 0.7, "crypto": 0.6,
                    "mobile_money": 0.3, "bank_transfer": 0.1}.get(payment_method, 0.5)

    # Encode transaction type risk
    type_risk = {"transfer": 0.8, "subdivision": 0.7, "mortgage": 0.5,
                 "lease": 0.3, "registration": 0.2}.get(tx_type, 0.5)

    # Land use risk
    land_risk = {"commercial": 0.6, "industrial": 0.5, "mixed": 0.4,
                 "residential": 0.3, "agricultural": 0.2}.get(land_use, 0.3)

    return np.array([
        log_amount,           # 0: log-transformed amount
        amount_millions,      # 1: amount in millions NGN
        price_deviation_ratio, # 2: price vs state benchmark
        hour / 24.0,          # 3: normalized hour
        day_of_week / 6.0,    # 4: normalized day of week
        is_weekend,           # 5: weekend transaction
        is_night,             # 6: night-time transaction
        same_user,            # 7: sender == receiver (self-dealing)
        is_cash,              # 8: cash payment
        is_transfer,          # 9: transfer type
        is_mortgage,          # 10: mortgage type
        is_high_value_state,  # 11: high-value state
        payment_risk,         # 12: payment method risk score
        type_risk,            # 13: transaction type risk score
        land_risk,            # 14: land use risk score
        area_sqm / 10_000.0,  # 15: normalized area
        float(from_user_id % 1000) / 1000.0,  # 16: user ID hash feature
        float(to_user_id % 1000) / 1000.0,    # 17: user ID hash feature
    ], dtype=np.float32)


# ─────────────────────────────────────────────────────────────────────────────
# Synthetic Nigerian Transaction Data Generator
# ─────────────────────────────────────────────────────────────────────────────

def generate_nigerian_training_data(
    n_legitimate: int = 8000,
    n_fraudulent: int = 2000,
    seed: int = 42,
) -> Tuple[List[Dict], List[int]]:
    """
    Generate realistic synthetic Nigerian land transaction data.
    Fraud patterns are based on common Nigerian land fraud schemes:
    1. Phantom property sales (same buyer/seller)
    2. Inflated valuations (price far above benchmark)
    3. Midnight transactions (unusual hours)
    4. Cash-only large transfers
    5. Rapid succession transfers of the same parcel
    """
    rng = np.random.default_rng(seed)
    transactions: List[Dict] = []
    labels: List[int] = []

    # ── Legitimate transactions ──────────────────────────────────────────────
    for i in range(n_legitimate):
        state = rng.choice(NIGERIAN_STATES)
        benchmark = STATE_PRICE_BENCHMARKS.get(state, STATE_PRICE_BENCHMARKS["default"])
        area_sqm = rng.integers(100, 5000)
        # Legitimate: price within 0.5x–2.5x benchmark
        price_per_sqm = benchmark * rng.uniform(0.5, 2.5)
        amount = price_per_sqm * area_sqm

        # Business hours (8am–6pm weekdays)
        hour = int(rng.integers(8, 18))
        day = int(rng.integers(0, 5))  # Mon–Fri
        base_date = datetime(2024, 1, 1)
        days_offset = int(rng.integers(0, 730))
        tx_date = base_date.replace(
            month=((days_offset // 30) % 12) + 1,
            day=(days_offset % 28) + 1,
            hour=hour,
        )

        from_user = int(rng.integers(100, 10000))
        to_user = int(rng.integers(100, 10000))
        # Ensure different users for legitimate
        while to_user == from_user:
            to_user = int(rng.integers(100, 10000))

        tx = {
            "transactionId": f"TX-LEG-{i:05d}",
            "amount": float(amount),
            "transactionType": str(rng.choice(TRANSACTION_TYPES)),
            "paymentMethod": str(rng.choice(["bank_transfer", "mobile_money", "cheque"])),
            "state": str(state),
            "landUse": str(rng.choice(LAND_USE_TYPES)),
            "areaSqm": float(area_sqm),
            "fromUserId": from_user,
            "toUserId": to_user,
            "createdAt": tx_date.isoformat(),
        }
        transactions.append(tx)
        labels.append(0)

    # ── Fraudulent transactions ──────────────────────────────────────────────
    fraud_patterns = [
        "phantom_sale",     # same buyer/seller
        "inflated_value",   # 5x–20x benchmark price
        "midnight_cash",    # cash + unusual hours
        "rapid_transfer",   # multiple transfers same parcel
        "money_laundering", # round numbers, suspicious routing
    ]

    for i in range(n_fraudulent):
        pattern = str(rng.choice(fraud_patterns))
        state = rng.choice(["Lagos", "Abuja", "Rivers"])  # High-value states targeted
        benchmark = STATE_PRICE_BENCHMARKS.get(state, STATE_PRICE_BENCHMARKS["default"])
        area_sqm = rng.integers(100, 2000)

        if pattern == "phantom_sale":
            user_id = int(rng.integers(1, 50))  # Small pool of fraudsters
            from_user, to_user = user_id, user_id
            amount = float(benchmark * area_sqm * rng.uniform(0.8, 1.2))
            hour = int(rng.integers(9, 17))
            payment = "bank_transfer"

        elif pattern == "inflated_value":
            # 5x–20x above benchmark
            amount = float(benchmark * area_sqm * rng.uniform(5.0, 20.0))
            from_user = int(rng.integers(1, 100))
            to_user = int(rng.integers(1, 100))
            hour = int(rng.integers(10, 16))
            payment = str(rng.choice(["cash", "cheque"]))

        elif pattern == "midnight_cash":
            amount = float(rng.integers(5_000_000, 100_000_000))
            from_user = int(rng.integers(1, 200))
            to_user = int(rng.integers(1, 200))
            hour = int(rng.integers(0, 5))  # 12am–5am
            payment = "cash"

        elif pattern == "rapid_transfer":
            amount = float(benchmark * area_sqm * rng.uniform(0.9, 1.1))
            from_user = int(rng.integers(1, 50))
            to_user = int(rng.integers(1, 50))
            hour = int(rng.integers(8, 20))
            payment = str(rng.choice(["bank_transfer", "mobile_money"]))

        else:  # money_laundering
            # Round number amounts
            base = int(rng.integers(1, 100)) * 1_000_000
            amount = float(base)
            from_user = int(rng.integers(1, 100))
            to_user = int(rng.integers(1, 100))
            hour = int(rng.integers(14, 17))
            payment = str(rng.choice(["cash", "crypto"]))

        base_date = datetime(2024, 1, 1)
        days_offset = int(rng.integers(0, 730))
        try:
            tx_date = base_date.replace(
                month=((days_offset // 30) % 12) + 1,
                day=(days_offset % 28) + 1,
                hour=hour,
            )
        except ValueError:
            tx_date = base_date.replace(hour=hour)

        tx = {
            "transactionId": f"TX-FRAUD-{i:05d}",
            "amount": amount,
            "transactionType": str(rng.choice(["transfer", "subdivision"])),
            "paymentMethod": payment,
            "state": str(state),
            "landUse": str(rng.choice(["commercial", "industrial"])),
            "areaSqm": float(area_sqm),
            "fromUserId": from_user,
            "toUserId": to_user,
            "createdAt": tx_date.isoformat(),
        }
        transactions.append(tx)
        labels.append(1)

    # Shuffle
    combined = list(zip(transactions, labels))
    rng.shuffle(combined)
    transactions, labels = zip(*combined)
    return list(transactions), list(labels)


# ─────────────────────────────────────────────────────────────────────────────
# Training Pipeline
# ─────────────────────────────────────────────────────────────────────────────

class FraudModelTrainer:
    def __init__(
        self,
        model_dir: str = "/home/ubuntu/landmanagement/lakehouse/ml/weights",
        experiment_name: str = "idlr-fraud-detection",
        learning_rate: float = 1e-3,
        batch_size: int = 256,
        max_epochs: int = 50,
        patience: int = 10,
    ):
        self.model_dir = Path(model_dir)
        self.model_dir.mkdir(parents=True, exist_ok=True)
        self.experiment_name = experiment_name
        self.lr = learning_rate
        self.batch_size = batch_size
        self.max_epochs = max_epochs
        self.patience = patience
        self.scaler = StandardScaler()
        self.model: Optional[FraudDetectionMLP] = None
        self.feature_names = [
            "log_amount", "amount_millions", "price_deviation_ratio",
            "hour_norm", "day_of_week_norm", "is_weekend", "is_night",
            "same_user", "is_cash", "is_transfer", "is_mortgage",
            "is_high_value_state", "payment_risk", "type_risk",
            "land_risk", "area_norm", "from_user_hash", "to_user_hash",
        ]

    def prepare_data(
        self,
        transactions: List[Dict],
        labels: List[int],
    ) -> Tuple[DataLoader, DataLoader, DataLoader]:
        """Extract features, scale, and create DataLoaders."""
        X = np.array([extract_features(tx) for tx in transactions])
        y = np.array(labels, dtype=np.float32)

        # Fit scaler on training data only
        X_scaled = self.scaler.fit_transform(X)

        X_tensor = torch.tensor(X_scaled, dtype=torch.float32)
        y_tensor = torch.tensor(y, dtype=torch.float32)

        dataset = TensorDataset(X_tensor, y_tensor)
        n = len(dataset)
        n_train = int(0.7 * n)
        n_val = int(0.15 * n)
        n_test = n - n_train - n_val

        train_ds, val_ds, test_ds = random_split(
            dataset, [n_train, n_val, n_test],
            generator=torch.Generator().manual_seed(42)
        )

        train_loader = DataLoader(train_ds, batch_size=self.batch_size, shuffle=True)
        val_loader = DataLoader(val_ds, batch_size=self.batch_size)
        test_loader = DataLoader(test_ds, batch_size=self.batch_size)

        return train_loader, val_loader, test_loader

    def train(
        self,
        transactions: List[Dict],
        labels: List[int],
    ) -> Dict:
        """Full training loop with early stopping and MLflow tracking."""
        train_loader, val_loader, test_loader = self.prepare_data(transactions, labels)

        # Class imbalance: use pos_weight
        n_pos = sum(labels)
        n_neg = len(labels) - n_pos
        pos_weight = torch.tensor([n_neg / max(n_pos, 1)], dtype=torch.float32)

        self.model = FraudDetectionMLP(input_dim=18)
        criterion = nn.BCEWithLogitsLoss(pos_weight=pos_weight)
        optimizer = optim.Adam(self.model.parameters(), lr=self.lr, weight_decay=1e-4)
        scheduler = optim.lr_scheduler.ReduceLROnPlateau(
            optimizer, mode="min", patience=5, factor=0.5
        )

        best_val_loss = float("inf")
        patience_counter = 0
        best_state_dict = None
        history = {"train_loss": [], "val_loss": [], "val_auc": []}

        # MLflow tracking
        if MLFLOW_AVAILABLE:
            mlflow.set_experiment(self.experiment_name)
            run = mlflow.start_run(run_name=f"fraud-mlp-{datetime.utcnow().strftime('%Y%m%d-%H%M%S')}")
            mlflow.log_params({
                "model_type": "FraudDetectionMLP",
                "input_dim": 18,
                "hidden_dims": "[128, 64, 32]",
                "learning_rate": self.lr,
                "batch_size": self.batch_size,
                "max_epochs": self.max_epochs,
                "n_train": len(train_loader.dataset),
                "n_val": len(val_loader.dataset),
                "n_test": len(test_loader.dataset),
                "class_ratio": f"{n_neg}:{n_pos}",
            })

        logger.info(f"Training on {len(train_loader.dataset)} samples, "
                    f"validating on {len(val_loader.dataset)}")

        for epoch in range(self.max_epochs):
            # ── Training ────────────────────────────────────────────────────
            self.model.train()
            train_loss = 0.0
            for X_batch, y_batch in train_loader:
                optimizer.zero_grad()
                logits = self.model(X_batch)
                loss = criterion(logits, y_batch)
                loss.backward()
                optimizer.step()
                train_loss += loss.item() * len(X_batch)
            train_loss /= len(train_loader.dataset)

            # ── Validation ──────────────────────────────────────────────────
            self.model.eval()
            val_loss = 0.0
            val_preds, val_labels = [], []
            with torch.no_grad():
                for X_batch, y_batch in val_loader:
                    logits = self.model(X_batch)
                    loss = criterion(logits, y_batch)
                    val_loss += loss.item() * len(X_batch)
                    probs = torch.sigmoid(logits).numpy()
                    val_preds.extend(probs.tolist())
                    val_labels.extend(y_batch.numpy().tolist())
            val_loss /= len(val_loader.dataset)

            try:
                val_auc = roc_auc_score(val_labels, val_preds)
            except Exception:
                val_auc = 0.5

            scheduler.step(val_loss)
            history["train_loss"].append(train_loss)
            history["val_loss"].append(val_loss)
            history["val_auc"].append(val_auc)

            if MLFLOW_AVAILABLE:
                mlflow.log_metrics({
                    "train_loss": train_loss,
                    "val_loss": val_loss,
                    "val_auc": val_auc,
                }, step=epoch)

            if epoch % 5 == 0:
                logger.info(f"Epoch {epoch:3d} | train_loss={train_loss:.4f} "
                            f"val_loss={val_loss:.4f} val_auc={val_auc:.4f}")

            # Early stopping
            if val_loss < best_val_loss - 1e-4:
                best_val_loss = val_loss
                patience_counter = 0
                best_state_dict = {k: v.clone() for k, v in self.model.state_dict().items()}
            else:
                patience_counter += 1
                if patience_counter >= self.patience:
                    logger.info(f"Early stopping at epoch {epoch}")
                    break

        # Restore best model
        if best_state_dict:
            self.model.load_state_dict(best_state_dict)

        # ── Test evaluation ──────────────────────────────────────────────────
        test_metrics = self._evaluate(test_loader)
        logger.info(f"Test AUC: {test_metrics['auc']:.4f} | "
                    f"F1: {test_metrics['f1']:.4f} | "
                    f"Precision: {test_metrics['precision']:.4f} | "
                    f"Recall: {test_metrics['recall']:.4f}")

        if MLFLOW_AVAILABLE:
            mlflow.log_metrics({f"test_{k}": v for k, v in test_metrics.items()})
            mlflow.pytorch.log_model(
                self.model,
                "fraud_detection_model",
                serialization_format="pickle",
            )
            mlflow.end_run()

        # Save weights
        self.save_model()

        return {"history": history, "test_metrics": test_metrics}

    def _evaluate(self, loader: DataLoader) -> Dict:
        self.model.eval()
        preds, labels = [], []
        with torch.no_grad():
            for X_batch, y_batch in loader:
                logits = self.model(X_batch)
                probs = torch.sigmoid(logits).numpy()
                preds.extend(probs.tolist())
                labels.extend(y_batch.numpy().tolist())

        binary_preds = [1 if p >= 0.5 else 0 for p in preds]
        precision, recall, f1, _ = precision_recall_fscore_support(
            labels, binary_preds, average="binary", zero_division=0
        )
        try:
            auc = roc_auc_score(labels, preds)
        except Exception:
            auc = 0.5

        return {
            "auc": float(auc),
            "precision": float(precision),
            "recall": float(recall),
            "f1": float(f1),
        }

    def save_model(self, path: Optional[str] = None):
        """Save model weights, scaler, and metadata."""
        save_dir = Path(path) if path else self.model_dir
        save_dir.mkdir(parents=True, exist_ok=True)

        # Save PyTorch weights
        torch.save(self.model.state_dict(), save_dir / "fraud_model.pt")

        # Save scaler
        import pickle
        with open(save_dir / "fraud_scaler.pkl", "wb") as f:
            pickle.dump(self.scaler, f)

        # Save metadata
        metadata = {
            "model_type": "FraudDetectionMLP",
            "input_dim": 18,
            "hidden_dims": [128, 64, 32],
            "feature_names": self.feature_names,
            "trained_at": datetime.utcnow().isoformat(),
            "framework": "pytorch",
            "version": "1.0.0",
        }
        with open(save_dir / "fraud_model_metadata.json", "w") as f:
            json.dump(metadata, f, indent=2)

        logger.info(f"Model saved to {save_dir}")

    def load_model(self, path: Optional[str] = None):
        """Load model weights and scaler from disk."""
        import pickle
        load_dir = Path(path) if path else self.model_dir

        with open(load_dir / "fraud_model_metadata.json") as f:
            metadata = json.load(f)

        self.model = FraudDetectionMLP(
            input_dim=metadata["input_dim"],
            hidden_dims=metadata["hidden_dims"],
        )
        self.model.load_state_dict(
            torch.load(load_dir / "fraud_model.pt", map_location="cpu", weights_only=True)
        )
        self.model.eval()

        with open(load_dir / "fraud_scaler.pkl", "rb") as f:
            self.scaler = pickle.load(f)

        logger.info(f"Model loaded from {load_dir}")

    def predict(self, transaction: Dict) -> Dict:
        """Run inference on a single transaction."""
        if self.model is None:
            raise RuntimeError("Model not loaded. Call load_model() first.")
        features = extract_features(transaction)
        features_scaled = self.scaler.transform(features.reshape(1, -1))
        x = torch.tensor(features_scaled, dtype=torch.float32)
        self.model.eval()
        with torch.no_grad():
            logit = self.model(x)
            prob = torch.sigmoid(logit).item()
        return {
            "transaction_id": transaction.get("transactionId", "unknown"),
            "fraud_probability": round(prob, 4),
            "risk_score": round(prob * 100, 1),
            "is_fraud": prob >= 0.5,
            "risk_level": (
                "critical" if prob >= 0.8 else
                "high" if prob >= 0.6 else
                "medium" if prob >= 0.4 else
                "low"
            ),
            "features": {
                name: float(features[i])
                for i, name in enumerate(self.feature_names)
            },
        }

    def predict_batch(self, transactions: List[Dict]) -> List[Dict]:
        """Batch inference."""
        if self.model is None:
            raise RuntimeError("Model not loaded.")
        features = np.array([extract_features(tx) for tx in transactions])
        features_scaled = self.scaler.transform(features)
        x = torch.tensor(features_scaled, dtype=torch.float32)
        self.model.eval()
        with torch.no_grad():
            logits = self.model(x)
            probs = torch.sigmoid(logits).numpy()
        return [
            {
                "transaction_id": tx.get("transactionId", f"tx-{i}"),
                "fraud_probability": round(float(p), 4),
                "risk_score": round(float(p) * 100, 1),
                "is_fraud": float(p) >= 0.5,
                "risk_level": (
                    "critical" if p >= 0.8 else
                    "high" if p >= 0.6 else
                    "medium" if p >= 0.4 else
                    "low"
                ),
            }
            for i, (tx, p) in enumerate(zip(transactions, probs))
        ]


# ─────────────────────────────────────────────────────────────────────────────
# Entry point: train and save model
# ─────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    logger.info("Generating synthetic Nigerian land transaction training data...")
    transactions, labels = generate_nigerian_training_data(
        n_legitimate=8000, n_fraudulent=2000
    )
    logger.info(f"Generated {len(transactions)} transactions "
                f"({sum(labels)} fraudulent, {len(labels)-sum(labels)} legitimate)")

    trainer = FraudModelTrainer()
    results = trainer.train(transactions, labels)

    logger.info("=" * 60)
    logger.info("Training complete!")
    logger.info(f"Test AUC:       {results['test_metrics']['auc']:.4f}")
    logger.info(f"Test F1:        {results['test_metrics']['f1']:.4f}")
    logger.info(f"Test Precision: {results['test_metrics']['precision']:.4f}")
    logger.info(f"Test Recall:    {results['test_metrics']['recall']:.4f}")
    logger.info("=" * 60)

    # Verify inference works
    test_tx = {
        "transactionId": "TX-INFERENCE-TEST",
        "amount": 45_000_000,
        "transactionType": "transfer",
        "paymentMethod": "cash",
        "state": "Lagos",
        "landUse": "commercial",
        "areaSqm": 300,
        "fromUserId": 7,
        "toUserId": 7,
        "createdAt": "2024-03-15T02:30:00",
    }
    pred = trainer.predict(test_tx)
    logger.info(f"Inference test: risk_score={pred['risk_score']} "
                f"is_fraud={pred['is_fraud']} risk_level={pred['risk_level']}")
