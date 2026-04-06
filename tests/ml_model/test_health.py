"""
Tests for GET /health
"""
from conftest import client  # noqa: F401


class TestHealth:
    def test_returns_200(self, client):
        resp = client.get("/health")
        assert resp.status_code == 200

    def test_response_schema(self, client):
        data = client.get("/health").json()
        assert "status" in data
        assert "model_loaded" in data
        assert "model_type" in data

    def test_status_is_ok(self, client):
        data = client.get("/health").json()
        assert data["status"] == "ok"

    def test_model_loaded_true(self, client):
        """model is injected in conftest — must report loaded=True."""
        data = client.get("/health").json()
        assert data["model_loaded"] is True

    def test_model_type_from_meta(self, client):
        data = client.get("/health").json()
        assert data["model_type"] == "Ridge Regression"
