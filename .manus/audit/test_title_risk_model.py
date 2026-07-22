import os
import tempfile
from pathlib import Path

os.environ["TITLE_RISK_MIN_TRAINING_ROWS"] = "20"

with tempfile.TemporaryDirectory() as directory:
    os.environ["MODEL_WEIGHTS_DIR"] = directory
    from lakehouse.ml.title_risk_model import (
        active_model_metadata,
        predict_title_risk,
        train_verified_examples,
    )

    examples = []
    for index in range(24):
        risky = index % 2 == 1
        features = {
            "dispute_count": 2 + (index % 3) if risky else index % 2,
            "encumbrance_count": 1 + (index % 2) if risky else 0,
            "document_mismatch_count": 1 if risky else 0,
            "verification_gap_count": 2 if risky else 0,
            "ownership_change_count": 3 + (index % 2) if risky else 1,
            "transaction_value": 75_000_000 + index * 1_000_000 if risky else 1_000_000 + index * 20_000,
        }
        examples.append({"feature_vector": features, "label": risky})

    trained = train_verified_examples(examples)
    assert trained.training_rows == 24
    assert trained.positive_rows == 12
    assert Path(trained.artifact_uri).is_file()
    metadata = active_model_metadata()
    assert metadata["model_version"] == trained.model_version

    inference = predict_title_risk({
        "dispute_count": 4,
        "encumbrance_count": 2,
        "document_mismatch_count": 1,
        "verification_gap_count": 2,
        "ownership_change_count": 4,
        "transaction_value": 95_000_000,
    })
    assert 0 <= inference["score"] <= 100
    assert inference["model_version"] == trained.model_version
    assert inference["drivers"]
    print({"status": "ok", "model_version": trained.model_version, "score": inference["score"]})
