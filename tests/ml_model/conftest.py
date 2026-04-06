"""
Shared fixtures for ml-model tests.

Uses FastAPI's TestClient with a fully mocked model so tests never
touch the filesystem or the real sklearn pipeline.

Key challenges:
  1. ml-model/app/main.py calls load_dotenv() at import time which can
     override env vars we set in tests. We patch load_dotenv to a no-op.
  2. MODEL_PATH / META_PATH are resolved at module import time as module-level
     constants, so we must force a fresh import each session with sys.modules
     cleanup AND pre-set the env vars before the first import.
  3. joblib.load and builtins.open must be patched BEFORE TestClient.__enter__
     triggers the lifespan coroutine.
  4. run_in_executor must be patched so the synchronous TestClient can
     exercise the async inference path without a real thread pool.
"""
from __future__ import annotations

import asyncio
import json
import os
import sys
from pathlib import Path
from unittest.mock import MagicMock, patch, mock_open

import numpy as np
import pytest
from fastapi.testclient import TestClient

# ── Make ml-model importable from the tests/ sibling directory ────────────────
ML_MODEL_ROOT = Path(__file__).resolve().parents[2] / "ml-model"
if str(ML_MODEL_ROOT) not in sys.path:
    sys.path.insert(0, str(ML_MODEL_ROOT))

# ── Pre-set env vars BEFORE any import of app.main ────────────────────────────
# main.py reads these at module level; they must be set prior to import.
os.environ["MODEL_PATH"] = "/tmp/fake_model.joblib"
os.environ["META_PATH"]  = "/tmp/fake_meta.json"
os.environ["APP_ENV"]    = "test"
os.environ["LOG_LEVEL"]  = "WARNING"

# ── Minimal model_meta.json content ──────────────────────────────────────────
MOCK_META = {
    "model_type": "Ridge Regression",
    "alpha": 1.0,
    "training_rows": 40,
    "test_rows": 10,
    "feature_columns": [
        "square_footage", "bedrooms", "bathrooms", "year_built",
        "lot_size", "distance_to_city_center", "school_rating",
    ],
    "target_column": "price",
    "metrics": {
        "r2_score": 0.9857,
        "rmse": 8948.69,
        "mae": 8629.14,
        "cv_r2_mean": 0.9852,
        "cv_r2_std": 0.0075,
    },
    "coefficients": {
        "square_footage": 1.7835,
        "bedrooms": 5200.0,
        "bathrooms": 8100.0,
        "year_built": 620.0,
        "lot_size": 0.45,
        "distance_to_city_center": -3100.0,
        "school_rating": 18057.0,
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

# Default valid feature payload (shared across test modules via conftest)
VALID_FEATURES = {
    "square_footage": 2000.0,
    "bedrooms": 3,
    "bathrooms": 2.0,
    "year_built": 2010,
    "lot_size": 6000.0,
    "distance_to_city_center": 5.0,
    "school_rating": 7.5,
}


def _make_mock_model() -> MagicMock:
    """A sklearn-pipeline mock that returns one prediction per input row."""
    model = MagicMock()
    model.predict = MagicMock(side_effect=lambda X: np.full(len(X), 350000.0))
    return model


async def _patched_run_in_executor(_self, _executor, func, *args):
    """Replace run_in_executor so the synchronous TestClient can exercise
    the async /predict path without spinning up a real ThreadPoolExecutor."""
    return func(*args)


@pytest.fixture(scope="session")
def client():
    """
    Session-scoped TestClient.  All external I/O is mocked:
      - load_dotenv  → no-op  (prevents .env from overriding our env vars)
      - joblib.load  → fake model (np.array([350000.0]))
      - builtins.open → MOCK_META JSON for the metadata file
      - run_in_executor → synchronous shim
    """
    mock_model = _make_mock_model()
    meta_json  = json.dumps(MOCK_META)

    # Remove any previously cached module so env vars take effect
    for key in list(sys.modules.keys()):
        if key.startswith("app"):
            del sys.modules[key]

    with patch("dotenv.load_dotenv", return_value=False), \
         patch("joblib.load", return_value=mock_model), \
         patch("builtins.open", mock_open(read_data=meta_json)), \
         patch.object(asyncio.AbstractEventLoop, "run_in_executor",
                      _patched_run_in_executor):

        from app import main as app_module   # imported inside all patches

        with TestClient(app_module.app, raise_server_exceptions=True) as c:
            yield c
