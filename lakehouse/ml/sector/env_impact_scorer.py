"""
Environmental Impact Risk Scorer
Uses PyTorch MLP to score environmental impact risk for sector operations.
"""
import torch
import torch.nn as nn
import numpy as np
from typing import Dict, Any

class EnvImpactScorerNet(nn.Module):
    def __init__(self, input_dim: int = 10):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(input_dim, 64),
            nn.ReLU(),
            nn.Dropout(0.2),
            nn.Linear(64, 32),
            nn.ReLU(),
            nn.Linear(32, 1),
            nn.Sigmoid()  # Risk score 0-1
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.net(x)


def score_environmental_impact(operation_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Score the environmental impact risk of a sector operation.
    
    Args:
        operation_data: Dictionary with operational metrics.
    
    Returns:
        Dictionary with risk_score (0-100), eia_category, and recommendations.
    """
    model = EnvImpactScorerNet(input_dim=10)
    
    features = torch.tensor([
        operation_data.get("area_disturbed_ha", 0.0),
        operation_data.get("proximity_to_water_km", 10.0),
        operation_data.get("proximity_to_forest_km", 10.0),
        operation_data.get("waste_volume_tonnes", 0.0),
        operation_data.get("chemical_usage_tonnes", 0.0),
        operation_data.get("gas_flared_mcf", 0.0),
        operation_data.get("population_within_5km", 0.0),
        operation_data.get("endangered_species_present", 0.0),
        operation_data.get("previous_violations", 0.0),
        operation_data.get("years_operating", 0.0),
    ], dtype=torch.float32).unsqueeze(0)
    
    model.eval()
    with torch.no_grad():
        risk_prob = model(features).item()
    
    risk_score = int(risk_prob * 100)
    
    # Determine EIA category
    if risk_score >= 75:
        eia_category = "A"  # Full EIA required
    elif risk_score >= 50:
        eia_category = "B1"  # Limited study
    elif risk_score >= 25:
        eia_category = "B2"  # Environmental audit
    else:
        eia_category = "C"  # No assessment required
    
    return {
        "risk_score": risk_score,
        "eia_category": eia_category,
        "recommendations": _get_recommendations(risk_score)
    }


def _get_recommendations(risk_score: int) -> list:
    if risk_score >= 75:
        return ["Full EIA required", "Community consultation mandatory", "Third-party audit required"]
    elif risk_score >= 50:
        return ["Limited environmental study required", "Mitigation plan needed"]
    elif risk_score >= 25:
        return ["Environmental audit recommended", "Monitoring plan required"]
    else:
        return ["Standard environmental monitoring sufficient"]


if __name__ == "__main__":
    sample_data = {
        "area_disturbed_ha": 500.0,
        "proximity_to_water_km": 2.0,
        "proximity_to_forest_km": 1.5,
        "waste_volume_tonnes": 10000.0,
        "chemical_usage_tonnes": 500.0,
        "gas_flared_mcf": 5000.0,
        "population_within_5km": 50000.0,
        "endangered_species_present": 1.0,
        "previous_violations": 2.0,
        "years_operating": 5.0
    }
    result = score_environmental_impact(sample_data)
    print(f"Environmental impact score: {result}")
