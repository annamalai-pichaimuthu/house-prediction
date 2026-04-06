from __future__ import annotations
import asyncio
import logging
import time
from typing import Literal, cast
import httpx
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from app.config import settings
from app.database import PredictionRecord, get_db
from app.schemas import (
    AdjustedField,
    BatchPredictResponse,
    FeatureContribution,
    HouseFeatures,
    PredictRequest,
    PredictResponse,
    Suggestion,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/predict", tags=["Predictions"])

_FIELD_LABELS: dict[str, str] = {
    "square_footage":          "Square Footage",
    "bedrooms":                "Bedrooms",
    "bathrooms":               "Bathrooms",
    "year_built":              "Year Built",
    "lot_size":                "Lot Size",
    "distance_to_city_center": "Distance to City",
    "school_rating":           "School Rating",
}

# ── Model-info cache ──────────────────────────────────────────────────────────
# A single cached fetch of GET /model-info covers both coefficients and training
# ranges.  Both helpers below read from the same shared response so a concurrent
# predict + suggestion call never issues two HTTP requests.
# TTL matches the Java backend default (10 minutes) so both services stay in
# sync after a retrain.  Use time.monotonic() so clock adjustments don't skew.
_CACHE_TTL_S: float = 600.0   # 10 minutes — override by changing this constant

_cached_model_info: dict | None = None
_cached_model_info_at: float = 0.0
_model_info_lock = asyncio.Lock()   # prevents concurrent cold-start fetches

_VALID_CONFIDENCE: frozenset[str] = frozenset({"high", "medium", "low"})


async def _get_model_info() -> dict:
    """Fetch GET /model-info once per TTL window; return the full payload.

    The asyncio.Lock ensures that when the cache is cold (or has just expired),
    only one coroutine performs the HTTP fetch while all others wait for it.
    """
    global _cached_model_info, _cached_model_info_at
    age = time.monotonic() - _cached_model_info_at
    # Fast path — cache is hot, no lock needed
    if _cached_model_info is not None and age < _CACHE_TTL_S:
        return _cached_model_info
    async with _model_info_lock:
        # Re-check inside the lock (another waiter may have just refreshed)
        age = time.monotonic() - _cached_model_info_at
        if _cached_model_info is not None and age < _CACHE_TTL_S:
            return _cached_model_info
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.get(_ml_url("/model-info"), timeout=10.0)
                resp.raise_for_status()
                _cached_model_info = resp.json()
                _cached_model_info_at = time.monotonic()
                logger.info(
                    "model-info refreshed — coefficients=%d, ranges=%d (cache age was %.0fs)",
                    len(_cached_model_info.get("coefficients", {})),
                    len(_cached_model_info.get("training_ranges", {})),
                    age,
                )
        except Exception as e:
            logger.warning("Could not fetch model-info (using stale/empty cache): %s", e)
            _cached_model_info = _cached_model_info or {}  # keep stale rather than crashing
    return _cached_model_info


async def _get_coefficients() -> dict[str, float]:
    """Return feature coefficients from the shared model-info cache."""
    return (await _get_model_info()).get("coefficients", {})


async def _get_training_ranges() -> dict[str, tuple[float, float]]:
    """Return per-feature (min, max) tuples from the shared model-info cache."""
    raw: dict[str, list[float]] = (await _get_model_info()).get("training_ranges", {})
    return {k: (v[0], v[1]) for k, v in raw.items() if len(v) == 2}


def _compute_contributions(
    features: HouseFeatures,
    coefficients: dict[str, float],
) -> list[FeatureContribution]:
    """
    For a linear regression model:  price = intercept + Σ(coeff_i × value_i)
    Each term coeff_i × value_i is the dollar contribution of that feature.
    Sorted by absolute contribution descending so the biggest drivers appear first.
    """
    contributions = []
    raw = features.model_dump()
    for field, label in _FIELD_LABELS.items():
        coeff = coefficients.get(field, 0.0)
        value = float(raw.get(field, 0.0))
        contributions.append(FeatureContribution(
            feature=field,
            label=label,
            value=value,
            contribution=round(coeff * value, 2),
        ))
    contributions.sort(key=lambda c: abs(c.contribution), reverse=True)
    return contributions


def _ml_url(path: str) -> str:
    return f"{settings.ml_model_url.rstrip('/')}{path}"


def _clamp_features(
    features: HouseFeatures,
    training_ranges: dict[str, tuple[float, float]],
) -> tuple[HouseFeatures, list[AdjustedField]]:
    """
    Clamp every feature to the nearest training-range boundary.
    Returns the adjusted HouseFeatures and a list of what changed.
    """
    raw = features.model_dump()
    clamped = dict(raw)
    adjusted: list[AdjustedField] = []

    for field, (lo, hi) in training_ranges.items():
        original = float(raw[field])
        new_val  = max(lo, min(hi, original))
        if new_val != original:
            logger.debug(
                "Feature '%s' clamped: %.2f → %.2f (range: [%.2f, %.2f])",
                field, original, new_val, lo, hi,
            )
            adjusted.append(AdjustedField(
                field=field,
                label=_FIELD_LABELS[field],
                original=original,
                suggested=new_val,
            ))
            clamped[field] = int(new_val) if field in ("bedrooms", "year_built") else new_val

    logger.debug("Clamping complete: %d field(s) adjusted", len(adjusted))
    return HouseFeatures(**clamped), adjusted


# ── Single prediction ─────────────────────────────────────────────────────────

@router.post("", response_model=PredictResponse, summary="Single prediction")
async def predict(request: PredictRequest, db: AsyncSession = Depends(get_db)):
    """
    Forward a single house's features to the ML model, persist the result
    in SQLite history, and return the predicted price.

    If the model extrapolates a price ≤ $0 (inputs far outside training range),
    the response also includes a `suggestion` with the nearest viable feature
    set and its predicted price.
    """
    if isinstance(request.features, list):
        logger.warning("Single predict endpoint called with a list — rejecting")
        raise HTTPException(
            status_code=422,
            detail="Use /predict/batch for multiple properties.",
        )

    features: HouseFeatures = request.features
    logger.info(
        "Single prediction request — sq_ft=%.0f, beds=%d, baths=%.1f, year=%d",
        features.square_footage, features.bedrooms, features.bathrooms, features.year_built,
    )

    async with httpx.AsyncClient() as client:
        try:
            logger.debug("Forwarding single prediction request to ML model at %s", _ml_url("/predict"))
            resp = await client.post(
                _ml_url("/predict"),
                json={"features": features.model_dump()},
                timeout=10.0,
            )
            resp.raise_for_status()
            logger.debug("ML model responded with status %d", resp.status_code)
        except httpx.HTTPStatusError as e:
            logger.error(
                "ML model returned HTTP %d: %s", e.response.status_code, e.response.text
            )
            raise HTTPException(status_code=502, detail=f"ML model error: {e.response.text}")
        except httpx.TimeoutException:
            logger.error("ML model request timed out (10s)")
            raise HTTPException(status_code=503, detail="ML model request timed out.")
        except httpx.RequestError as e:
            logger.error("ML model unreachable: %s", str(e))
            raise HTTPException(status_code=503, detail=f"ML model unreachable: {e}")

        data = resp.json()
        predicted_price: float = data["predicted_price"]
        # Guard against unexpected values from the ML model before casting to Literal
        raw_conf = data.get("confidence", "high")
        confidence: Literal["high", "medium", "low"] = cast(
            Literal["high", "medium", "low"],
            raw_conf if raw_conf in _VALID_CONFIDENCE else "high",
        )
        logger.info(
            "ML model prediction received: price=%.2f, confidence=%s",
            predicted_price, confidence,
        )

        # ── Build suggestion when price is unreliable (≤ 0) ───────────────────
        suggestion: Suggestion | None = None
        if predicted_price <= 0:
            logger.warning(
                "Predicted price %.2f is non-positive — building clamped suggestion",
                predicted_price,
            )
            training_ranges = await _get_training_ranges()
            clamped_features, adjusted_fields = _clamp_features(features, training_ranges)
            try:
                logger.debug("Requesting clamped prediction from ML model")
                sugg_resp = await client.post(
                    _ml_url("/predict"),
                    json={"features": clamped_features.model_dump()},
                    timeout=10.0,
                )
                sugg_resp.raise_for_status()
                sugg_data = sugg_resp.json()
                suggestion = Suggestion(
                    adjusted_fields=adjusted_fields,
                    suggested_features=clamped_features,
                    suggested_price=sugg_data["predicted_price"],
                )
                logger.info(
                    "Suggestion built with %d adjusted field(s), suggested_price=%.2f",
                    len(adjusted_fields), suggestion.suggested_price,
                )
            except Exception as e:
                logger.warning("Failed to build suggestion (non-fatal): %s", str(e))
                pass  # suggestion is optional — never block the main response

    # Persist original request to history (best-effort — never block the prediction response)
    try:
        record = PredictionRecord(
            square_footage=features.square_footage,
            bedrooms=features.bedrooms,
            bathrooms=features.bathrooms,
            year_built=features.year_built,
            lot_size=features.lot_size,
            distance_to_city_center=features.distance_to_city_center,
            school_rating=features.school_rating,
            predicted_price=predicted_price,
            confidence=confidence,
        )
        db.add(record)
        await db.commit()
        logger.debug("Prediction record persisted to history (price=%.2f)", predicted_price)
    except Exception as e:
        await db.rollback()
        logger.exception("Failed to persist prediction to history: %s", str(e))
        # Don't raise — prediction succeeded; DB write is best-effort

    return PredictResponse(
        predicted_price=predicted_price,
        confidence=confidence,
        suggestion=suggestion,
        contributions=_compute_contributions(features, await _get_coefficients()),
    )


# ── Batch prediction ──────────────────────────────────────────────────────────

@router.post("/batch", response_model=BatchPredictResponse, summary="Batch prediction")
async def predict_batch(request: PredictRequest):
    """
    Forward a list of houses to the ML model and return all predictions.
    Batch results are not saved to history.
    """
    features = request.features
    if isinstance(features, HouseFeatures):
        logger.debug("Single feature wrapped into a list for batch endpoint")
        features = [features]

    logger.info("Batch prediction request — count=%d", len(features))

    async with httpx.AsyncClient() as client:
        try:
            logger.debug("Forwarding batch of %d records to ML model", len(features))
            resp = await client.post(
                _ml_url("/predict"),
                json={"features": [f.model_dump() for f in features]},
                timeout=30.0,
            )
            resp.raise_for_status()
            logger.debug("ML model batch response: status=%d", resp.status_code)
        except httpx.HTTPStatusError as e:
            logger.error(
                "ML model returned HTTP %d for batch request: %s",
                e.response.status_code, e.response.text,
            )
            raise HTTPException(status_code=502, detail=f"ML model error: {e.response.text}")
        except httpx.TimeoutException:
            logger.error("ML model batch request timed out (30s) for %d records", len(features))
            raise HTTPException(status_code=503, detail="ML model request timed out.")
        except httpx.RequestError as e:
            logger.error("ML model unreachable during batch request: %s", str(e))
            raise HTTPException(status_code=503, detail=f"ML model unreachable: {e}")

    data = resp.json()
    logger.info("Batch prediction complete — returned %d predictions", data.get("count", 0))
    return BatchPredictResponse(
        predictions=data["predictions"],
        confidences=data["confidences"],
        count=data["count"],
    )
