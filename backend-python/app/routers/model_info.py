from __future__ import annotations
import logging
import httpx
from fastapi import APIRouter, HTTPException
from app.config import settings
from app.schemas import HealthResponse

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Info"])

def _ml_url(path: str) -> str:
    return f"{settings.ml_model_url.rstrip('/')}{path}"


@router.get("/model-info", summary="ML model coefficients and metrics")
async def model_info():
    """Proxy the ML model's /model-info response directly."""
    logger.debug("Proxying /model-info request to ML model at %s", _ml_url("/model-info"))
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.get(_ml_url("/model-info"), timeout=10.0)
            resp.raise_for_status()
            logger.debug("ML model /model-info responded with status %d", resp.status_code)
        except httpx.HTTPStatusError as e:
            logger.error(
                "ML model /model-info returned HTTP %d: %s",
                e.response.status_code, e.response.text,
            )
            raise HTTPException(status_code=502, detail=f"ML model error: {e.response.text}")
        except httpx.TimeoutException:
            logger.error("ML model /model-info request timed out (10s)")
            raise HTTPException(status_code=503, detail="ML model request timed out.")
        except httpx.RequestError as e:
            logger.error("ML model unreachable for /model-info: %s", str(e))
            raise HTTPException(status_code=503, detail=f"ML model unreachable: {e}")

    logger.info("Model info proxied successfully")
    return resp.json()


@router.get("/health", response_model=HealthResponse, summary="Health check")
async def health():
    """Check service health and whether the ML model is reachable."""
    logger.debug("Health check requested")
    ml_ok = False
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.get(_ml_url("/health"), timeout=5.0)
            ml_ok = resp.status_code == 200
            logger.debug("ML model health probe: status=%d, ok=%s", resp.status_code, ml_ok)
        except httpx.TimeoutException:
            logger.warning("ML model health probe timed out (5s)")
            ml_ok = False
        except httpx.RequestError as e:
            logger.warning("ML model health probe failed — unreachable: %s", str(e))
            ml_ok = False

    logger.info("Health check complete — ml_model_connected=%s", ml_ok)
    return HealthResponse(status="ok", ml_model_connected=ml_ok)
