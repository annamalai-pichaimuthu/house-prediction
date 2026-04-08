from __future__ import annotations
from datetime import datetime
from typing import Literal, Union
from pydantic import BaseModel, Field, field_validator

_CURRENT_YEAR: int = datetime.now().year


# ── Shared input ──────────────────────────────────────────────────────────────

class HouseFeatures(BaseModel):
    square_footage: float = Field(
        ..., gt=0, le=50_000,
        description="Interior living area in sq ft (1 – 50,000)",
    )
    bedrooms: int = Field(
        ..., ge=1, le=20,
        description="Number of bedrooms (1 – 20)",
    )
    bathrooms: float = Field(
        ..., ge=0.5, le=10,
        description="Number of bathrooms; half-baths allowed, e.g. 1.5 (0.5 – 10)",
    )

    @field_validator("bathrooms")
    @classmethod
    def bathrooms_must_be_half_increment(cls, v: float) -> float:
        if round(v * 2) != v * 2:
            raise ValueError("Bathrooms must be in 0.5 increments (e.g. 1, 1.5, 2, 2.5)")
        return v

    year_built: int = Field(
        ..., ge=1800, le=_CURRENT_YEAR,
        description=f"Year the property was originally constructed (1800 – {_CURRENT_YEAR})",
    )
    lot_size: float = Field(
        ..., gt=0, le=500_000,
        description="Total land area in sq ft (1 – 500,000)",
    )
    distance_to_city_center: float = Field(
        ..., ge=0, le=200,
        description="Straight-line distance to city centre in miles (0 – 200)",
    )
    school_rating: float = Field(
        ..., ge=0, le=10,
        description="Average local school rating on a 0 – 10 scale",
    )

    model_config = {
        "json_schema_extra": {
            "example": {
                "square_footage": 1700,
                "bedrooms": 3,
                "bathrooms": 2.0,
                "year_built": _CURRENT_YEAR - 15,
                "lot_size": 5500,
                "distance_to_city_center": 4.1,
                "school_rating": 7.8,
            }
        }
    }


# ── Predict ───────────────────────────────────────────────────────────────────

class PredictRequest(BaseModel):
    """Single or batch prediction request."""
    features: Union[HouseFeatures, list[HouseFeatures]]


class AdjustedField(BaseModel):
    """One feature that was clamped to the nearest training-data boundary."""
    field:     str    # machine name, e.g. "square_footage"
    label:     str    # human name,   e.g. "Square Footage"
    original:  float
    suggested: float


class Suggestion(BaseModel):
    """
    Returned only when the raw prediction is ≤ 0.
    Provides the nearest viable feature set and its predicted price.
    """
    adjusted_fields:    list[AdjustedField]
    suggested_features: HouseFeatures
    suggested_price:    float


class PredictResponse(BaseModel):
    predicted_price: float
    currency: str = "USD"
    confidence: Literal["high", "medium", "low"] = "high"
    suggestion: Suggestion | None = None
    contributions: list["FeatureContribution"] = []


class FeatureContribution(BaseModel):
    """
    How much a single feature contributed to this specific predicted price.
    contribution = coefficient × feature_value  (from the linear model).
    A positive value pushed the price up; negative pushed it down.
    """
    feature: str    # machine name,  e.g. "school_rating"
    label:   str    # human label,   e.g. "School Rating"
    value:   float  # the input value the user provided
    contribution: float  # dollar impact on this prediction


class BatchPredictResponse(BaseModel):
    predictions: list[float]
    confidences: list[Literal["high", "medium", "low"]]
    count: int
    currency: str = "USD"


# ── History ───────────────────────────────────────────────────────────────────

class HistoryItem(BaseModel):
    id: int
    created_at: datetime
    square_footage:          float
    bedrooms:                int
    bathrooms:               float
    year_built:              int
    lot_size:                float
    distance_to_city_center: float
    school_rating:           float
    predicted_price:         float
    confidence:              Literal["high", "medium", "low"] = "high"

    model_config = {"from_attributes": True}


class HistoryResponse(BaseModel):
    count: int
    items: list[HistoryItem]


# ── Health ────────────────────────────────────────────────────────────────────

class HealthResponse(BaseModel):
    status: str
    ml_model_connected: bool
