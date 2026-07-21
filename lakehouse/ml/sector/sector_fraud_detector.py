"""
Sector-Specific Fraud Detector
Detects royalty underreporting, false production data, and license fraud.
"""
import torch
import torch.nn as nn
import numpy as np
from typing import Dict, Any, List

class SectorFraudDetectorNet(nn.Module):
    def __init__(self, input_dim: int = 8):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(input_dim, 32),
            nn.ReLU(),
            nn.Dropout(0.3),
            nn.Linear(32, 16),
            nn.ReLU(),
            nn.Linear(16, 1),
            nn.Sigmoid()  # Fraud probability 0-1
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.net(x)


def detect_fraud(production_record: Dict[str, Any]) -> Dict[str, Any]:
    """
    Detect potential fraud in production reporting.
    
    Args:
        production_record: Dictionary with production metrics.
    
    Returns:
        Dictionary with fraud_probability, is_suspicious, and fraud_indicators.
    """
    model = SectorFraudDetectorNet(input_dim=8)
    
    features = torch.tensor([
        production_record.get("reported_volume", 0.0),
        production_record.get("expected_volume_from_capacity", 0.0),
        production_record.get("variance_from_historical_avg", 0.0),
        production_record.get("royalty_paid_ratio", 1.0),
        production_record.get("days_since_last_inspection", 0.0),
        production_record.get("previous_fraud_flags", 0.0),
        production_record.get("meter_hash_valid", 1.0),
        production_record.get("third_party_verified", 1.0),
    ], dtype=torch.float32).unsqueeze(0)
    
    model.eval()
    with torch.no_grad():
        fraud_prob = model(features).item()
    
    indicators = []
    if production_record.get("variance_from_historical_avg", 0) > 0.3:
        indicators.append("Production variance exceeds 30% of historical average")
    if production_record.get("royalty_paid_ratio", 1.0) < 0.9:
        indicators.append("Royalty payment below 90% of calculated amount")
    if not production_record.get("meter_hash_valid", True):
        indicators.append("Meter hash verification failed")
    if not production_record.get("third_party_verified", True):
        indicators.append("Third-party verification missing")
    
    return {
        "fraud_probability": round(fraud_prob, 4),
        "is_suspicious": fraud_prob > 0.5,
        "fraud_indicators": indicators,
        "recommended_action": "Escalate to compliance team" if fraud_prob > 0.7 else "Monitor"
    }


if __name__ == "__main__":
    sample_record = {
        "reported_volume": 1000.0,
        "expected_volume_from_capacity": 5000.0,
        "variance_from_historical_avg": 0.8,
        "royalty_paid_ratio": 0.2,
        "days_since_last_inspection": 365.0,
        "previous_fraud_flags": 2.0,
        "meter_hash_valid": 0.0,
        "third_party_verified": 0.0
    }
    result = detect_fraud(sample_record)
    print(f"Fraud detection result: {result}")
