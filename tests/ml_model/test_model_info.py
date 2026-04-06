"""
Tests for GET /model-info
"""
from conftest import client, MOCK_META  # noqa: F401


class TestModelInfo:
    def test_returns_200(self, client):
        resp = client.get("/model-info")
        assert resp.status_code == 200

    def test_response_has_required_fields(self, client):
        data = client.get("/model-info").json()
        required = {
            "model_type", "alpha", "training_rows", "test_rows",
            "feature_columns", "target_column", "metrics",
            "coefficients", "intercept", "training_ranges",
        }
        assert required.issubset(data.keys())

    def test_model_type_value(self, client):
        data = client.get("/model-info").json()
        assert data["model_type"] == "Ridge Regression"

    def test_metrics_contains_r2(self, client):
        data = client.get("/model-info").json()
        assert "r2_score" in data["metrics"]
        assert 0.0 <= data["metrics"]["r2_score"] <= 1.0

    def test_all_seven_coefficients_present(self, client):
        data = client.get("/model-info").json()
        expected_features = {
            "square_footage", "bedrooms", "bathrooms", "year_built",
            "lot_size", "distance_to_city_center", "school_rating",
        }
        assert expected_features == set(data["coefficients"].keys())

    def test_training_ranges_all_features(self, client):
        data = client.get("/model-info").json()
        ranges = data["training_ranges"]
        assert len(ranges) == 7
        for feature, bounds in ranges.items():
            assert len(bounds) == 2, f"{feature} should have [min, max]"
            assert bounds[0] <= bounds[1], f"{feature} min should be <= max"

    def test_training_rows_positive(self, client):
        data = client.get("/model-info").json()
        assert data["training_rows"] > 0
        assert data["test_rows"] > 0

    def test_feature_columns_count(self, client):
        data = client.get("/model-info").json()
        assert len(data["feature_columns"]) == 7
