"""
Shared fixtures for backend-python tests.

All HTTP calls to the ML model are intercepted by respx so no external
service needs to run. The SQLite database is replaced by an in-memory
instance for full isolation.
"""
from __future__ import annotations

import sys
from pathlib import Path
from unittest.mock import patch

import pytest
import respx
import httpx
from fastapi.testclient import TestClient

# ── Make backend-python importable ───────────────────────────────────────────
BP_ROOT = Path(__file__).resolve().parents[2] / "backend-python"
if str(BP_ROOT) not in sys.path:
    sys.path.insert(0, str(BP_ROOT))

# ── Shared test data ──────────────────────────────────────────────────────────
VALID_FEATURES = {
    "square_footage": 2000.0,
    "bedrooms": 3,
    "bathrooms": 2.0,
    "year_built": 2010,
    "lot_size": 6000.0,
    "distance_to_city_center": 5.0,
    "school_rating": 7.5,
}

# Stub response from ml-model /predict
ML_SINGLE_RESPONSE = {
    "predicted_price": 350000.0,
    "currency": "USD",
    "confidence": "high",
}

# Stub response from ml-model /predict (batch)
ML_BATCH_RESPONSE = {
    "predictions": [350000.0, 420000.0],
    "confidences": ["high", "high"],
    "count": 2,
    "currency": "USD",
}

# Stub response from ml-model /model-info
ML_MODEL_INFO = {
    "model_type": "Ridge Regression",
    "alpha": 1.0,
    "training_rows": 40,
    "test_rows": 10,
    "feature_columns": [
        "square_footage", "bedrooms", "bathrooms", "year_built",
        "lot_size", "distance_to_city_center", "school_rating",
    ],
    "target_column": "price",
    "metrics": {"r2_score": 0.9857, "rmse": 8948.69, "mae": 8629.14},
    "coefficients": {
        "square_footage": 1.78, "bedrooms": 5200.0, "bathrooms": 8100.0,
        "year_built": 620.0, "lot_size": 0.45,
        "distance_to_city_center": -3100.0, "school_rating": 18057.0,
    },
    "intercept": 270375.0,
    "training_ranges": {
        "square_footage":          [980.0,  4900.0],
        "bedrooms":                [2.0,    6.0],
        "bathrooms":               [1.0,    4.0],
        "year_built":              [1970.0, 2022.0],
        "lot_size":                [2000.0, 10000.0],
        "distance_to_city_center": [1.0,    15.0],
        "school_rating":           [4.0,    9.5],
    },
}


@pytest.fixture(scope="session")
def client():
    """
    Session-scoped TestClient backed by an in-memory SQLite database.

    All outbound httpx calls are intercepted by a session-scoped respx router
    that is activated for the lifetime of the TestClient.
    The ML model service never needs to be running.
    """
    import os
    os.environ["DATABASE_URL"]         = "sqlite+aiosqlite:///:memory:"
    os.environ["ML_MODEL_URL"]         = "http://ml-model-mock:8000"
    os.environ["BACKEND_PYTHON_PORT"]  = "8001"
    os.environ["APP_ENV"]              = "test"
    os.environ["LOG_LEVEL"]            = "WARNING"

    # Remove cached modules so env vars take effect on fresh import
    for key in list(sys.modules.keys()):
        if key.startswith("app"):
            del sys.modules[key]

    from app.main import app

    # Activate respx for the entire session — intercepts ALL httpx calls
    with respx.mock(base_url="http://ml-model-mock:8000", assert_all_called=False) as router:
        # /model-info
        router.get("/model-info").mock(
            return_value=httpx.Response(200, json=ML_MODEL_INFO)
        )

        # /predict handles both single and batch depending on body shape:
        #   single: {"features": {...}}  → ML returns single-prediction shape
        #   batch:  {"features": [...]}  → ML returns batch-prediction shape
        def _predict_handler(request: httpx.Request) -> httpx.Response:
            body = request.read()
            import json
            payload = json.loads(body)
            features = payload.get("features")
            if isinstance(features, list):
                # batch: return count equal to the list size
                count = len(features)
                return httpx.Response(200, json={
                    "predictions":  [350000.0] * count,
                    "confidences":  ["high"] * count,
                    "count":        count,
                    "currency":     "USD",
                })
            else:
                return httpx.Response(200, json=ML_SINGLE_RESPONSE)

        router.post("/predict").mock(side_effect=_predict_handler)

        with TestClient(app, raise_server_exceptions=False) as c:
            yield c
