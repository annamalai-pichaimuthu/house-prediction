from __future__ import annotations
from datetime import datetime
from typing import Literal, Union
from pydantic import BaseModel, Field, model_validator

_CURRENT_YEAR: int = datetime.now().year


def compute_confidence(
    features: "HouseFeatures",
    training_ranges: dict[str, list[float]] | None = None,
) -> Literal["high", "medium", "low"]:
    """
    Count how many feature values fall outside the training data range.
    0 out-of-range → high, 1 → medium, 2+ → low.

    training_ranges is the live [min, max] map from model_meta.json, passed in
    at call time. If not provided (e.g. model not yet loaded) defaults to "high"
    so we never block a prediction on a missing confidence value.
    """
    if not training_ranges:
        return "high"

    out_of_range = sum(
        1 for field, bounds in training_ranges.items()
        if len(bounds) >= 2
        and not (bounds[0] <= float(getattr(features, field, 0)) <= bounds[1])
    )
    if out_of_range == 0:
        return "high"
    if out_of_range == 1:
        return "medium"
    return "low"


# ── Input ─────────────────────────────────────────────────────────────────────

class HouseFeatures(BaseModel):
    """A single house's features."""

    square_footage: float = Field(..., gt=0, description="Total area in sq ft")
    bedrooms: int         = Field(..., ge=1, le=20)
    bathrooms: float      = Field(..., ge=0.5, le=20)
    year_built: int       = Field(..., ge=1800, le=_CURRENT_YEAR)
    lot_size: float       = Field(..., gt=0, description="Lot size in sq ft")
    distance_to_city_center: float = Field(..., ge=0, description="Distance in miles")
    school_rating: float  = Field(..., ge=0, le=10)

    model_config = {"json_schema_extra": {
        "example": {
            "square_footage": 2000,
            "bedrooms": 3,
            "bathrooms": 2.0,
            "year_built": 2010,
            "lot_size": 6000,
            "distance_to_city_center": 5.0,
            "school_rating": 7.5,
        }
    }}


class PredictRequest(BaseModel):
    """
    Accepts either a single house or a list of houses.

        Single:  {"features": { ... }}
        Batch:   {"features": [ {...}, {...} ]}
    """

    features: Union[HouseFeatures, list[HouseFeatures]]

    @model_validator(mode="after")
    def check_batch_limit(self) -> "PredictRequest":
        if isinstance(self.features, list) and len(self.features) > 10_000:
            raise ValueError("Batch size cannot exceed 10,000 records.")
        return self


# ── Output ────────────────────────────────────────────────────────────────────

class SinglePrediction(BaseModel):
    predicted_price: float
    currency: str = "USD"
    confidence: Literal["high", "medium", "low"] = "high"


class BatchPrediction(BaseModel):
    predictions: list[float]
    confidences: list[Literal["high", "medium", "low"]]
    count: int
    currency: str = "USD"


class ModelInfoResponse(BaseModel):
    model_config = {"protected_namespaces": ()}

    model_type: str
    alpha: float
    training_rows: int
    test_rows: int
    feature_columns: list[str]
    target_column: str
    metrics: dict
    coefficients: dict
    intercept: float
    training_ranges: dict[str, list[float]] = {}


class HealthResponse(BaseModel):
    model_config = {"protected_namespaces": ()}

    status: str
    model_loaded: bool
    model_type: str
