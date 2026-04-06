"""
Tests for POST /predict — single and batch inference.
"""
import pytest
from conftest import client, VALID_FEATURES  # noqa: F401


SINGLE_PAYLOAD = {"features": VALID_FEATURES}


class TestPredictSingle:
    def test_returns_200(self, client):
        resp = client.post("/predict", json=SINGLE_PAYLOAD)
        assert resp.status_code == 200

    def test_response_has_predicted_price(self, client):
        data = client.post("/predict", json=SINGLE_PAYLOAD).json()
        assert "predicted_price" in data
        assert isinstance(data["predicted_price"], (int, float))

    def test_predicted_price_positive(self, client):
        data = client.post("/predict", json=SINGLE_PAYLOAD).json()
        assert data["predicted_price"] > 0

    def test_currency_is_usd(self, client):
        data = client.post("/predict", json=SINGLE_PAYLOAD).json()
        assert data["currency"] == "USD"

    def test_confidence_valid_value(self, client):
        data = client.post("/predict", json=SINGLE_PAYLOAD).json()
        assert data["confidence"] in {"high", "medium", "low"}

    def test_in_range_features_give_high_confidence(self, client):
        """All VALID_FEATURES are within MOCK_META training_ranges → high confidence."""
        data = client.post("/predict", json=SINGLE_PAYLOAD).json()
        assert data["confidence"] == "high"

    def test_out_of_range_features_lower_confidence(self, client):
        """bedrooms=15 is outside training range [2, 6] → confidence drops."""
        payload = {"features": {**VALID_FEATURES, "bedrooms": 15}}
        data = client.post("/predict", json=payload).json()
        assert data["confidence"] in {"medium", "low"}


class TestPredictBatch:
    def test_returns_200(self, client):
        payload = {"features": [VALID_FEATURES, {**VALID_FEATURES, "bedrooms": 4}]}
        resp = client.post("/predict", json=payload)
        assert resp.status_code == 200

    def test_batch_response_schema(self, client):
        payload = {"features": [VALID_FEATURES, {**VALID_FEATURES, "square_footage": 3000}]}
        data = client.post("/predict", json=payload).json()
        assert "predictions" in data
        assert "confidences" in data
        assert "count" in data
        assert data["count"] == 2

    def test_batch_predictions_length_matches_count(self, client):
        items = [VALID_FEATURES] * 5
        payload = {"features": items}
        data = client.post("/predict", json=payload).json()
        assert len(data["predictions"]) == data["count"]
        assert len(data["confidences"]) == data["count"]

    def test_batch_single_item(self, client):
        payload = {"features": [VALID_FEATURES]}
        data = client.post("/predict", json=payload).json()
        assert data["count"] == 1

    def test_batch_confidences_all_valid(self, client):
        payload = {"features": [VALID_FEATURES, {**VALID_FEATURES, "bedrooms": 2}]}
        data = client.post("/predict", json=payload).json()
        for c in data["confidences"]:
            assert c in {"high", "medium", "low"}


class TestPredictValidation:
    @pytest.mark.parametrize("field,bad_value", [
        ("square_footage", -100),
        ("square_footage", 0),
        ("bedrooms", 0),
        ("bedrooms", 25),
        ("bathrooms", 0.0),
        ("bathrooms", 25.0),
        ("school_rating", -1),
        ("school_rating", 11),
        ("distance_to_city_center", -5),
    ])
    def test_invalid_field_returns_422(self, client, field, bad_value):
        payload = {"features": {**VALID_FEATURES, field: bad_value}}
        resp = client.post("/predict", json=payload)
        assert resp.status_code == 422

    def test_missing_required_field_returns_422(self, client):
        incomplete = {k: v for k, v in VALID_FEATURES.items() if k != "square_footage"}
        resp = client.post("/predict", json={"features": incomplete})
        assert resp.status_code == 422

    def test_empty_body_returns_422(self, client):
        resp = client.post("/predict", json={})
        assert resp.status_code == 422

    def test_batch_exceeds_10000_returns_422(self, client):
        payload = {"features": [VALID_FEATURES] * 10_001}
        resp = client.post("/predict", json=payload)
        assert resp.status_code == 422

    def test_batch_exactly_10000_is_accepted(self, client):
        """Boundary: exactly 10,000 should pass validation."""
        payload = {"features": [VALID_FEATURES] * 10_000}
        resp = client.post("/predict", json=payload)
        # 200 or 500 (mock may not handle 10k) — but NOT 422
        assert resp.status_code != 422
