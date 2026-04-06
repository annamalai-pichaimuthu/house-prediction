"""
Tests for GET /history and DELETE /history/{id} (backend-python).
Uses an in-memory SQLite database via the TestClient session fixture.
"""
from __future__ import annotations

from unittest.mock import AsyncMock, patch

import httpx
import pytest

from conftest import client, VALID_FEATURES, ML_SINGLE_RESPONSE, ML_MODEL_INFO  # noqa: F401


def _mock_ml_client(response_json=None):
    """Helper to patch httpx.AsyncClient for a single predict call."""
    resp_json = response_json or ML_SINGLE_RESPONSE
    mock = AsyncMock()
    mock.__aenter__ = AsyncMock(return_value=mock)
    mock.__aexit__  = AsyncMock(return_value=None)
    mock.post       = AsyncMock(return_value=httpx.Response(200, json=resp_json))
    return mock


def _seed_prediction(client):
    """Insert one prediction into history and return the response data."""
    mock_client = _mock_ml_client()
    with patch("app.routers.predict.httpx.AsyncClient", return_value=mock_client), \
         patch("app.routers.predict._get_model_info", new=AsyncMock(return_value=ML_MODEL_INFO)):
        resp = client.post("/predict", json={"features": VALID_FEATURES})
    assert resp.status_code == 200
    return resp.json()


class TestGetHistory:
    def test_returns_200(self, client):
        resp = client.get("/history")
        assert resp.status_code == 200

    def test_response_schema(self, client):
        data = client.get("/history").json()
        assert "count" in data
        assert "items" in data
        assert isinstance(data["items"], list)

    def test_count_matches_items_length(self, client):
        data = client.get("/history").json()
        assert data["count"] == len(data["items"])

    def test_prediction_appears_in_history(self, client):
        before = client.get("/history").json()["count"]
        _seed_prediction(client)
        after = client.get("/history").json()["count"]
        assert after == before + 1

    def test_history_items_have_required_fields(self, client):
        _seed_prediction(client)
        data = client.get("/history").json()
        assert data["count"] > 0
        item = data["items"][0]
        required = {
            "id", "created_at", "square_footage", "bedrooms", "bathrooms",
            "year_built", "lot_size", "distance_to_city_center",
            "school_rating", "predicted_price", "confidence",
        }
        assert required.issubset(item.keys())

    def test_history_newest_first(self, client):
        """Two predictions — the second inserted should appear first."""
        _seed_prediction(client)
        _seed_prediction(client)
        data = client.get("/history").json()
        if data["count"] >= 2:
            dates = [item["created_at"] for item in data["items"]]
            assert dates == sorted(dates, reverse=True)

    def test_history_confidence_valid(self, client):
        _seed_prediction(client)
        data = client.get("/history").json()
        for item in data["items"]:
            assert item["confidence"] in {"high", "medium", "low"}


class TestDeleteHistory:
    def test_delete_existing_returns_204(self, client):
        _seed_prediction(client)
        history = client.get("/history").json()
        record_id = history["items"][0]["id"]
        resp = client.delete(f"/history/{record_id}")
        assert resp.status_code == 204

    def test_delete_removes_record(self, client):
        _seed_prediction(client)
        history = client.get("/history").json()
        record_id = history["items"][0]["id"]
        count_before = history["count"]

        client.delete(f"/history/{record_id}")
        count_after = client.get("/history").json()["count"]
        assert count_after == count_before - 1

    def test_delete_nonexistent_returns_404(self, client):
        resp = client.delete("/history/999999")
        assert resp.status_code == 404

    def test_delete_already_deleted_returns_404(self, client):
        _seed_prediction(client)
        history = client.get("/history").json()
        record_id = history["items"][0]["id"]

        client.delete(f"/history/{record_id}")
        resp = client.delete(f"/history/{record_id}")
        assert resp.status_code == 404

    def test_delete_invalid_id_type_returns_422(self, client):
        resp = client.delete("/history/not-a-number")
        assert resp.status_code == 422
