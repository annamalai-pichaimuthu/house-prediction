"""
Tests for POST /predict and POST /predict/batch (backend-python).

All outbound httpx calls to the ML model are mocked using unittest.mock
so no external service needs to run.
"""
from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import httpx

from conftest import (  # noqa: F401
    client,
    VALID_FEATURES,
    ML_SINGLE_RESPONSE,
    ML_BATCH_RESPONSE,
    ML_MODEL_INFO,
)


def _mock_response(json_body: dict, status: int = 200) -> httpx.Response:
    return httpx.Response(status, json=json_body)


def _make_async_client_mock(single_resp, model_info_resp=None):
    """Build an AsyncMock for httpx.AsyncClient that returns the given responses."""
    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=None)

    if model_info_resp:
        mock_client.get = AsyncMock(return_value=_mock_response(model_info_resp))
    mock_client.post = AsyncMock(return_value=_mock_response(single_resp))
    return mock_client


# ─────────────────────────────────────────────────────────────────────────────
class TestSinglePredict:
    def test_returns_200(self, client):
        mock_client = _make_async_client_mock(ML_SINGLE_RESPONSE, ML_MODEL_INFO)
        with patch("app.routers.predict.httpx.AsyncClient", return_value=mock_client), \
             patch("app.routers.predict._get_model_info", new=AsyncMock(return_value=ML_MODEL_INFO)):
            resp = client.post("/predict", json={"features": VALID_FEATURES})
        assert resp.status_code == 200

    def test_predicted_price_in_response(self, client):
        mock_client = _make_async_client_mock(ML_SINGLE_RESPONSE, ML_MODEL_INFO)
        with patch("app.routers.predict.httpx.AsyncClient", return_value=mock_client), \
             patch("app.routers.predict._get_model_info", new=AsyncMock(return_value=ML_MODEL_INFO)):
            data = client.post("/predict", json={"features": VALID_FEATURES}).json()
        assert "predicted_price" in data
        assert data["predicted_price"] == 350000.0

    def test_confidence_returned(self, client):
        mock_client = _make_async_client_mock(ML_SINGLE_RESPONSE, ML_MODEL_INFO)
        with patch("app.routers.predict.httpx.AsyncClient", return_value=mock_client), \
             patch("app.routers.predict._get_model_info", new=AsyncMock(return_value=ML_MODEL_INFO)):
            data = client.post("/predict", json={"features": VALID_FEATURES}).json()
        assert data["confidence"] in {"high", "medium", "low"}

    def test_contributions_present(self, client):
        mock_client = _make_async_client_mock(ML_SINGLE_RESPONSE, ML_MODEL_INFO)
        with patch("app.routers.predict.httpx.AsyncClient", return_value=mock_client), \
             patch("app.routers.predict._get_model_info", new=AsyncMock(return_value=ML_MODEL_INFO)):
            data = client.post("/predict", json={"features": VALID_FEATURES}).json()
        assert "contributions" in data
        assert len(data["contributions"]) == 7

    def test_contributions_sorted_by_abs_desc(self, client):
        mock_client = _make_async_client_mock(ML_SINGLE_RESPONSE, ML_MODEL_INFO)
        with patch("app.routers.predict.httpx.AsyncClient", return_value=mock_client), \
             patch("app.routers.predict._get_model_info", new=AsyncMock(return_value=ML_MODEL_INFO)):
            data = client.post("/predict", json={"features": VALID_FEATURES}).json()
        contribs = [abs(c["contribution"]) for c in data["contributions"]]
        assert contribs == sorted(contribs, reverse=True)

    def test_suggestion_none_when_price_positive(self, client):
        mock_client = _make_async_client_mock(ML_SINGLE_RESPONSE, ML_MODEL_INFO)
        with patch("app.routers.predict.httpx.AsyncClient", return_value=mock_client), \
             patch("app.routers.predict._get_model_info", new=AsyncMock(return_value=ML_MODEL_INFO)):
            data = client.post("/predict", json={"features": VALID_FEATURES}).json()
        assert data.get("suggestion") is None

    def test_suggestion_present_when_price_negative(self, client):
        """ML model returns a negative price → backend must build a suggestion."""
        negative_resp = {**ML_SINGLE_RESPONSE, "predicted_price": -1000.0}
        clamped_resp  = {**ML_SINGLE_RESPONSE, "predicted_price": 280000.0}

        call_count = {"n": 0}
        async def _side_effect(*args, **kwargs):
            call_count["n"] += 1
            if call_count["n"] == 1:
                return _mock_response(negative_resp)
            return _mock_response(clamped_resp)

        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__  = AsyncMock(return_value=None)
        mock_client.post       = AsyncMock(side_effect=_side_effect)

        extreme_features = {**VALID_FEATURES, "square_footage": 100.0, "school_rating": 1.0}
        with patch("app.routers.predict.httpx.AsyncClient", return_value=mock_client), \
             patch("app.routers.predict._get_model_info", new=AsyncMock(return_value=ML_MODEL_INFO)):
            data = client.post("/predict", json={"features": extreme_features}).json()

        assert data.get("suggestion") is not None
        assert "suggested_price" in data["suggestion"]
        assert data["suggestion"]["suggested_price"] > 0

    def test_ml_model_timeout_returns_503(self, client):
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__  = AsyncMock(return_value=None)
        mock_client.post       = AsyncMock(side_effect=httpx.TimeoutException("timeout"))

        with patch("app.routers.predict.httpx.AsyncClient", return_value=mock_client), \
             patch("app.routers.predict._get_model_info", new=AsyncMock(return_value=ML_MODEL_INFO)):
            resp = client.post("/predict", json={"features": VALID_FEATURES})
        assert resp.status_code == 503

    def test_ml_model_unreachable_returns_503(self, client):
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__  = AsyncMock(return_value=None)
        mock_client.post       = AsyncMock(side_effect=httpx.ConnectError("refused"))

        with patch("app.routers.predict.httpx.AsyncClient", return_value=mock_client), \
             patch("app.routers.predict._get_model_info", new=AsyncMock(return_value=ML_MODEL_INFO)):
            resp = client.post("/predict", json={"features": VALID_FEATURES})
        assert resp.status_code == 503

    def test_list_input_rejected_with_422(self, client):
        """Single endpoint must reject a list and tell user to use /predict/batch."""
        resp = client.post("/predict", json={"features": [VALID_FEATURES]})
        assert resp.status_code == 422


class TestPredictValidation:
    @pytest.mark.parametrize("field,bad_value", [
        ("square_footage",          -1),
        ("square_footage",          0),
        ("bedrooms",                0),
        ("bedrooms",                21),
        ("bathrooms",               0.4),
        ("school_rating",           -1),
        ("school_rating",           10.1),
        ("distance_to_city_center", -1),
    ])
    def test_invalid_field_returns_422(self, client, field, bad_value):
        payload = {"features": {**VALID_FEATURES, field: bad_value}}
        resp = client.post("/predict", json=payload)
        assert resp.status_code == 422

    def test_missing_field_returns_422(self, client):
        incomplete = {k: v for k, v in VALID_FEATURES.items() if k != "bedrooms"}
        resp = client.post("/predict", json={"features": incomplete})
        assert resp.status_code == 422

    def test_empty_body_returns_422(self, client):
        resp = client.post("/predict", json={})
        assert resp.status_code == 422


class TestBatchPredict:
    def test_returns_200(self, client):
        payload = {"features": [VALID_FEATURES, {**VALID_FEATURES, "bedrooms": 4}]}
        mock_client = _make_async_client_mock(ML_BATCH_RESPONSE)
        with patch("app.routers.predict.httpx.AsyncClient", return_value=mock_client):
            resp = client.post("/predict/batch", json=payload)
        assert resp.status_code == 200

    def test_batch_response_schema(self, client):
        payload = {"features": [VALID_FEATURES, {**VALID_FEATURES, "bedrooms": 4}]}
        mock_client = _make_async_client_mock(ML_BATCH_RESPONSE)
        with patch("app.routers.predict.httpx.AsyncClient", return_value=mock_client):
            data = client.post("/predict/batch", json=payload).json()
        assert "predictions" in data
        assert "confidences" in data
        assert "count" in data

    def test_batch_count_matches_input(self, client):
        payload = {"features": [VALID_FEATURES, {**VALID_FEATURES, "bedrooms": 4}]}
        mock_client = _make_async_client_mock(ML_BATCH_RESPONSE)
        with patch("app.routers.predict.httpx.AsyncClient", return_value=mock_client):
            data = client.post("/predict/batch", json=payload).json()
        assert data["count"] == 2

    def test_batch_timeout_returns_503(self, client):
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__  = AsyncMock(return_value=None)
        mock_client.post       = AsyncMock(side_effect=httpx.TimeoutException("timeout"))

        payload = {"features": [VALID_FEATURES]}
        with patch("app.routers.predict.httpx.AsyncClient", return_value=mock_client):
            resp = client.post("/predict/batch", json=payload)
        assert resp.status_code == 503
