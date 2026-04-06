"""
Tests for GET /model-info (backend-python proxy to ml-model).
"""
from __future__ import annotations

from unittest.mock import AsyncMock, patch

import httpx

from conftest import client, ML_MODEL_INFO  # noqa: F401


class TestModelInfoProxy:
    def test_returns_200(self, client):
        mock = AsyncMock()
        mock.__aenter__ = AsyncMock(return_value=mock)
        mock.__aexit__  = AsyncMock(return_value=None)
        mock.get        = AsyncMock(return_value=httpx.Response(200, json=ML_MODEL_INFO))

        with patch("app.routers.model_info.httpx.AsyncClient", return_value=mock):
            resp = client.get("/model-info")
        assert resp.status_code == 200

    def test_response_contains_model_type(self, client):
        mock = AsyncMock()
        mock.__aenter__ = AsyncMock(return_value=mock)
        mock.__aexit__  = AsyncMock(return_value=None)
        mock.get        = AsyncMock(return_value=httpx.Response(200, json=ML_MODEL_INFO))

        with patch("app.routers.model_info.httpx.AsyncClient", return_value=mock):
            data = client.get("/model-info").json()
        assert "model_type" in data

    def test_response_contains_training_ranges(self, client):
        mock = AsyncMock()
        mock.__aenter__ = AsyncMock(return_value=mock)
        mock.__aexit__  = AsyncMock(return_value=None)
        mock.get        = AsyncMock(return_value=httpx.Response(200, json=ML_MODEL_INFO))

        with patch("app.routers.model_info.httpx.AsyncClient", return_value=mock):
            data = client.get("/model-info").json()
        assert "training_ranges" in data
        assert len(data["training_ranges"]) == 7

    def test_ml_model_unavailable_returns_error(self, client):
        mock = AsyncMock()
        mock.__aenter__ = AsyncMock(return_value=mock)
        mock.__aexit__  = AsyncMock(return_value=None)
        mock.get        = AsyncMock(side_effect=httpx.ConnectError("refused"))

        with patch("app.routers.model_info.httpx.AsyncClient", return_value=mock):
            resp = client.get("/model-info")
        assert resp.status_code in {502, 503, 500}
