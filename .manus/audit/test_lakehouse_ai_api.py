import os
import tempfile

os.environ["LAKEHOUSE_API_KEY"] = "lakehouse-test-key"
os.environ["MODEL_WEIGHTS_DIR"] = tempfile.mkdtemp(prefix="lakehouse-model-test-")
os.environ["LAKEHOUSE_CORS_ORIGINS"] = "https://platform.example"

from fastapi.testclient import TestClient
from lakehouse.api.main import app

client = TestClient(app)
unauthorized = client.get("/ml/title-risk/model")
assert unauthorized.status_code == 401, unauthorized.text

headers = {"X-Lakehouse-Api-Key": "lakehouse-test-key"}
model_status = client.get("/ml/title-risk/model", headers=headers)
assert model_status.status_code == 200, model_status.text
assert model_status.json()["available"] is False, model_status.text

inference = client.post(
    "/analytics/title-risk/score",
    headers=headers,
    json={
        "dispute_count": 1,
        "encumbrance_count": 0,
        "document_mismatch_count": 0,
        "verification_gap_count": 0,
        "ownership_change_count": 1,
        "transaction_value": 1000,
    },
)
assert inference.status_code == 503, inference.text
print({"status": "ok", "auth": unauthorized.status_code, "untrained_inference": inference.status_code})
