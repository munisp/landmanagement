"""
Mineral and Oil Reserve Estimator
Uses PyTorch MLP to estimate reserves based on geological survey data.
"""
import torch
import torch.nn as nn
import numpy as np
from typing import Dict, Any

class ReserveEstimatorNet(nn.Module):
    def __init__(self, input_dim: int = 12):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(input_dim, 64),
            nn.ReLU(),
            nn.Dropout(0.2),
            nn.Linear(64, 32),
            nn.ReLU(),
            nn.Linear(32, 1)  # Estimated reserves in tonnes/barrels
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.net(x)


def estimate_reserves(survey_data: Dict[str, Any]) -> Dict[str, float]:
    """
    Estimate mineral/oil reserves from geological survey data.
    
    Args:
        survey_data: Dictionary with keys like area_km2, depth_m, seismic_score, etc.
    
    Returns:
        Dictionary with estimated_reserves and confidence_interval.
    """
    model = ReserveEstimatorNet(input_dim=12)
    
    # Feature vector from survey data
    features = torch.tensor([
        survey_data.get("area_km2", 0.0),
        survey_data.get("depth_m", 0.0),
        survey_data.get("seismic_score", 0.0),
        survey_data.get("porosity_percent", 0.0),
        survey_data.get("permeability_md", 0.0),
        survey_data.get("water_saturation", 0.0),
        survey_data.get("api_gravity", 0.0),
        survey_data.get("gas_oil_ratio", 0.0),
        survey_data.get("formation_pressure_psi", 0.0),
        survey_data.get("temperature_c", 0.0),
        survey_data.get("recovery_factor", 0.0),
        survey_data.get("historical_production", 0.0),
    ], dtype=torch.float32).unsqueeze(0)
    
    model.eval()
    with torch.no_grad():
        estimated = model(features).item()
    
    return {
        "estimated_reserves": max(0.0, estimated),
        "confidence_interval_low": max(0.0, estimated * 0.8),
        "confidence_interval_high": estimated * 1.2,
        "unit": "barrels_or_tonnes"
    }


if __name__ == "__main__":
    sample_data = {
        "area_km2": 500.0,
        "depth_m": 2500.0,
        "seismic_score": 0.75,
        "porosity_percent": 22.0,
        "permeability_md": 150.0,
        "water_saturation": 0.30,
        "api_gravity": 35.0,
        "gas_oil_ratio": 500.0,
        "formation_pressure_psi": 3500.0,
        "temperature_c": 80.0,
        "recovery_factor": 0.35,
        "historical_production": 1000000.0
    }
    result = estimate_reserves(sample_data)
    print(f"Reserve estimate: {result}")
