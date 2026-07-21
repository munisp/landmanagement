"""
IDLR Land Registry - Credit Scoring Model
==========================================
Real PyTorch model for land-backed credit scoring.
Predicts creditworthiness for mortgage applications
based on Nigerian land registry data and financial history.
"""
from __future__ import annotations

import json
import logging
import pickle
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import numpy as np
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import DataLoader, TensorDataset, random_split
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import mean_absolute_error, r2_score

logger = logging.getLogger(__name__)


class CreditScoringNet(nn.Module):
    """
    Neural network for credit score prediction (regression).
    Outputs a credit score in range [300, 850] (Nigerian credit scale).
    """
    def __init__(self, input_dim: int = 20, hidden_dims: List[int] = [128, 64, 32]):
        super().__init__()
        layers: List[nn.Module] = []
        prev_dim = input_dim
        for h in hidden_dims:
            layers.extend([
                nn.Linear(prev_dim, h),
                nn.BatchNorm1d(h),
                nn.GELU(),
                nn.Dropout(0.2),
            ])
            prev_dim = h
        layers.append(nn.Linear(prev_dim, 1))
        self.network = nn.Sequential(*layers)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        raw = self.network(x).squeeze(-1)
        # Sigmoid scaled to [300, 850]
        return 300.0 + 550.0 * torch.sigmoid(raw)


def extract_credit_features(applicant: Dict) -> np.ndarray:
    """Extract 20 features for credit scoring."""
    income = float(applicant.get("monthly_income_ngn", 100_000))
    loan_amount = float(applicant.get("loan_amount_ngn", 5_000_000))
    property_value = float(applicant.get("property_value_ngn", 10_000_000))
    age = float(applicant.get("age", 35))
    employment_years = float(applicant.get("employment_years", 3))
    n_existing_loans = int(applicant.get("n_existing_loans", 0))
    n_defaults = int(applicant.get("n_defaults", 0))
    n_parcels_owned = int(applicant.get("n_parcels_owned", 1))
    n_transactions = int(applicant.get("n_transactions", 5))
    transaction_velocity = float(applicant.get("transaction_velocity", 0.5))
    is_employed = 1 if applicant.get("employment_status") == "employed" else 0
    is_business_owner = 1 if applicant.get("employment_status") == "self_employed" else 0
    education_level = {"primary": 0.2, "secondary": 0.4, "tertiary": 0.7, "postgraduate": 1.0}.get(
        applicant.get("education_level", "secondary"), 0.4
    )
    state = applicant.get("state", "Lagos")
    is_urban = 1 if state in ["Lagos", "Abuja", "Rivers", "Kano"] else 0
    ltv_ratio = loan_amount / max(property_value, 1)
    dti_ratio = (loan_amount / 12) / max(income, 1)
    log_income = np.log1p(income)
    log_property_value = np.log1p(property_value)
    payment_history_score = float(applicant.get("payment_history_score", 0.7))
    credit_utilization = float(applicant.get("credit_utilization", 0.3))

    return np.array([
        log_income / 20.0,
        log_property_value / 25.0,
        ltv_ratio,
        dti_ratio,
        age / 70.0,
        employment_years / 40.0,
        min(n_existing_loans, 10) / 10.0,
        min(n_defaults, 5) / 5.0,
        min(n_parcels_owned, 20) / 20.0,
        min(n_transactions, 100) / 100.0,
        transaction_velocity,
        is_employed,
        is_business_owner,
        education_level,
        is_urban,
        payment_history_score,
        credit_utilization,
        float(applicant.get("savings_months", 6)) / 24.0,
        float(applicant.get("guarantors", 0)) / 3.0,
        float(applicant.get("collateral_ratio", 1.0)),
    ], dtype=np.float32)


def generate_credit_training_data(
    n_samples: int = 5000, seed: int = 42
) -> Tuple[List[Dict], List[float]]:
    """Generate realistic Nigerian mortgage applicant data."""
    rng = np.random.default_rng(seed)
    applicants: List[Dict] = []
    scores: List[float] = []

    states = ["Lagos", "Abuja", "Rivers", "Kano", "Ogun", "Anambra", "Delta", "Oyo"]
    education_levels = ["primary", "secondary", "tertiary", "postgraduate"]
    employment_statuses = ["employed", "self_employed", "civil_servant", "unemployed"]

    for i in range(n_samples):
        state = str(rng.choice(states))
        education = str(rng.choice(education_levels, p=[0.1, 0.3, 0.45, 0.15]))
        employment = str(rng.choice(employment_statuses, p=[0.45, 0.25, 0.25, 0.05]))

        # Income based on education and employment
        base_income = {"primary": 40_000, "secondary": 80_000, "tertiary": 200_000, "postgraduate": 400_000}[education]
        income = float(rng.normal(base_income, base_income * 0.3))
        income = max(income, 20_000)

        age = float(rng.integers(22, 65))
        employment_years = float(rng.integers(0, int(age - 22) + 1))
        n_existing_loans = int(rng.integers(0, 4))
        n_defaults = int(rng.integers(0, 3) if rng.random() < 0.15 else 0)
        n_parcels = int(rng.integers(1, 5))
        property_value = float(rng.uniform(2_000_000, 50_000_000))
        loan_amount = float(rng.uniform(0.3, 0.9) * property_value)
        payment_history = float(rng.beta(8, 2) if n_defaults == 0 else rng.beta(2, 4))
        credit_utilization = float(rng.beta(2, 5))

        applicant = {
            "applicant_id": f"APP-{i:05d}",
            "monthly_income_ngn": income,
            "loan_amount_ngn": loan_amount,
            "property_value_ngn": property_value,
            "age": age,
            "employment_years": employment_years,
            "n_existing_loans": n_existing_loans,
            "n_defaults": n_defaults,
            "n_parcels_owned": n_parcels,
            "n_transactions": int(rng.integers(1, 50)),
            "transaction_velocity": float(rng.uniform(0.1, 2.0)),
            "employment_status": employment,
            "education_level": education,
            "state": state,
            "payment_history_score": payment_history,
            "credit_utilization": credit_utilization,
            "savings_months": float(rng.integers(0, 24)),
            "guarantors": int(rng.integers(0, 3)),
            "collateral_ratio": float(rng.uniform(0.5, 2.0)),
        }

        # Compute target score based on features
        score = 500.0
        score += min(income / 10_000, 100)
        score += employment_years * 3
        score -= n_defaults * 80
        score -= n_existing_loans * 20
        score += payment_history * 150
        score -= credit_utilization * 80
        score += (property_value / loan_amount - 1) * 20
        score = float(np.clip(score + rng.normal(0, 30), 300, 850))

        applicants.append(applicant)
        scores.append(score)

    return applicants, scores


class CreditModelTrainer:
    def __init__(self, model_dir: str = "/home/ubuntu/landmanagement/lakehouse/ml/weights"):
        self.model_dir = Path(model_dir)
        self.model_dir.mkdir(parents=True, exist_ok=True)
        self.scaler = StandardScaler()
        self.model: Optional[CreditScoringNet] = None

    def train(self, applicants: List[Dict], scores: List[float]) -> Dict:
        X = np.array([extract_credit_features(a) for a in applicants])
        y = np.array(scores, dtype=np.float32)
        X_scaled = self.scaler.fit_transform(X)

        X_t = torch.tensor(X_scaled, dtype=torch.float32)
        y_t = torch.tensor(y, dtype=torch.float32)
        ds = TensorDataset(X_t, y_t)
        n = len(ds)
        n_train, n_val = int(0.7 * n), int(0.15 * n)
        train_ds, val_ds, test_ds = random_split(
            ds, [n_train, n_val, n - n_train - n_val],
            generator=torch.Generator().manual_seed(42)
        )
        train_loader = DataLoader(train_ds, batch_size=256, shuffle=True)
        val_loader = DataLoader(val_ds, batch_size=256)
        test_loader = DataLoader(test_ds, batch_size=256)

        self.model = CreditScoringNet(input_dim=20)
        optimizer = optim.Adam(self.model.parameters(), lr=1e-3, weight_decay=1e-4)
        criterion = nn.MSELoss()
        best_val_loss = float("inf")
        best_state = None
        patience_counter = 0

        for epoch in range(80):
            self.model.train()
            for X_b, y_b in train_loader:
                optimizer.zero_grad()
                pred = self.model(X_b)
                loss = criterion(pred, y_b)
                loss.backward()
                optimizer.step()

            self.model.eval()
            val_loss = 0.0
            with torch.no_grad():
                for X_b, y_b in val_loader:
                    pred = self.model(X_b)
                    val_loss += criterion(pred, y_b).item() * len(X_b)
            val_loss /= len(val_loader.dataset)

            if epoch % 20 == 0:
                logger.info(f"Credit Epoch {epoch:3d} | val_loss={val_loss:.2f}")

            if val_loss < best_val_loss - 0.1:
                best_val_loss = val_loss
                patience_counter = 0
                best_state = {k: v.clone() for k, v in self.model.state_dict().items()}
            else:
                patience_counter += 1
                if patience_counter >= 15:
                    break

        if best_state:
            self.model.load_state_dict(best_state)

        # Test
        self.model.eval()
        preds_all, labels_all = [], []
        with torch.no_grad():
            for X_b, y_b in test_loader:
                preds_all.extend(self.model(X_b).numpy().tolist())
                labels_all.extend(y_b.numpy().tolist())

        mae = mean_absolute_error(labels_all, preds_all)
        r2 = r2_score(labels_all, preds_all)
        logger.info(f"Credit Test MAE: {mae:.2f} | R²: {r2:.4f}")

        self.save_model()
        return {"test_mae": mae, "test_r2": r2}

    def save_model(self):
        torch.save(self.model.state_dict(), self.model_dir / "credit_model.pt")
        with open(self.model_dir / "credit_scaler.pkl", "wb") as f:
            pickle.dump(self.scaler, f)
        metadata = {
            "model_type": "CreditScoringNet",
            "input_dim": 20,
            "hidden_dims": [128, 64, 32],
            "output_range": [300, 850],
            "trained_at": datetime.utcnow().isoformat(),
            "version": "1.0.0",
        }
        with open(self.model_dir / "credit_model_metadata.json", "w") as f:
            json.dump(metadata, f, indent=2)
        logger.info(f"Credit model saved to {self.model_dir}")

    def load_model(self):
        with open(self.model_dir / "credit_model_metadata.json") as f:
            meta = json.load(f)
        self.model = CreditScoringNet(input_dim=meta["input_dim"], hidden_dims=meta["hidden_dims"])
        self.model.load_state_dict(
            torch.load(self.model_dir / "credit_model.pt", map_location="cpu", weights_only=True)
        )
        self.model.eval()
        with open(self.model_dir / "credit_scaler.pkl", "rb") as f:
            self.scaler = pickle.load(f)

    def predict(self, applicant: Dict) -> Dict:
        if self.model is None:
            raise RuntimeError("Model not loaded.")
        features = extract_credit_features(applicant)
        features_scaled = self.scaler.transform(features.reshape(1, -1))
        x = torch.tensor(features_scaled, dtype=torch.float32)
        self.model.eval()
        with torch.no_grad():
            score = self.model(x).item()
        grade = (
            "A" if score >= 750 else
            "B" if score >= 700 else
            "C" if score >= 650 else
            "D" if score >= 600 else
            "E"
        )
        return {
            "applicant_id": applicant.get("applicant_id", "unknown"),
            "credit_score": round(score, 1),
            "grade": grade,
            "max_loan_recommended_ngn": round(score / 850 * 50_000_000, -3),
            "approval_probability": round((score - 300) / 550, 3),
        }


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    logger.info("Generating credit training data...")
    applicants, scores = generate_credit_training_data(n_samples=5000)
    trainer = CreditModelTrainer()
    results = trainer.train(applicants, scores)
    logger.info(f"Credit model training complete. MAE={results['test_mae']:.2f} R²={results['test_r2']:.4f}")
