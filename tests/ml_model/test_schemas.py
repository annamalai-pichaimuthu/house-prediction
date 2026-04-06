"""
Unit tests for ml-model Pydantic schemas and compute_confidence logic.
No HTTP — pure Python function tests.
"""
import sys
from pathlib import Path

import pytest

ML_MODEL_ROOT = Path(__file__).resolve().parents[2] / "ml-model"
if str(ML_MODEL_ROOT) not in sys.path:
    sys.path.insert(0, str(ML_MODEL_ROOT))

from app.schemas import HouseFeatures, PredictRequest, compute_confidence


TRAINING_RANGES = {
    "square_footage":          [980.0,  4900.0],
    "bedrooms":                [2.0,    6.0],
    "bathrooms":               [1.0,    4.0],
    "year_built":              [1970.0, 2022.0],
    "lot_size":                [2000.0, 10000.0],
    "distance_to_city_center": [1.0,    15.0],
    "school_rating":           [4.0,    9.5],
}

VALID_KWARGS = {
    "square_footage": 2000.0,
    "bedrooms": 3,
    "bathrooms": 2.0,
    "year_built": 2010,
    "lot_size": 6000.0,
    "distance_to_city_center": 5.0,
    "school_rating": 7.5,
}


class TestHouseFeatures:
    def test_valid_input_parses(self):
        f = HouseFeatures(**VALID_KWARGS)
        assert f.square_footage == 2000.0
        assert f.bedrooms == 3

    @pytest.mark.parametrize("field,bad", [
        ("square_footage", 0),
        ("square_footage", -1),
        ("bedrooms", 0),
        ("bedrooms", 21),
        ("bathrooms", 0.4),
        ("bathrooms", 21.0),
        ("school_rating", -0.1),
        ("school_rating", 10.1),
        ("distance_to_city_center", -1),
    ])
    def test_invalid_field_raises(self, field, bad):
        from pydantic import ValidationError
        with pytest.raises(ValidationError):
            HouseFeatures(**{**VALID_KWARGS, field: bad})

    def test_year_built_future_raises(self):
        from pydantic import ValidationError
        with pytest.raises(ValidationError):
            HouseFeatures(**{**VALID_KWARGS, "year_built": 2200})


class TestPredictRequest:
    def test_single_feature_parsed(self):
        req = PredictRequest(features=HouseFeatures(**VALID_KWARGS))
        assert isinstance(req.features, HouseFeatures)

    def test_list_of_features_parsed(self):
        features = [HouseFeatures(**VALID_KWARGS)] * 3
        req = PredictRequest(features=features)
        assert isinstance(req.features, list)
        assert len(req.features) == 3

    def test_batch_exceeds_limit_raises(self):
        from pydantic import ValidationError
        with pytest.raises(ValidationError):
            PredictRequest(features=[HouseFeatures(**VALID_KWARGS)] * 10_001)

    def test_batch_exactly_at_limit_ok(self):
        req = PredictRequest(features=[HouseFeatures(**VALID_KWARGS)] * 10_000)
        assert len(req.features) == 10_000


class TestComputeConfidence:
    def test_all_in_range_returns_high(self):
        f = HouseFeatures(**VALID_KWARGS)
        assert compute_confidence(f, TRAINING_RANGES) == "high"

    def test_one_out_of_range_returns_medium(self):
        f = HouseFeatures(**{**VALID_KWARGS, "bedrooms": 10})  # out of [2,6]
        assert compute_confidence(f, TRAINING_RANGES) == "medium"

    def test_two_out_of_range_returns_low(self):
        f = HouseFeatures(**{**VALID_KWARGS, "bedrooms": 10, "school_rating": 1.0})
        assert compute_confidence(f, TRAINING_RANGES) == "low"

    def test_none_ranges_returns_high(self):
        """Missing ranges should never block a prediction."""
        f = HouseFeatures(**VALID_KWARGS)
        assert compute_confidence(f, None) == "high"

    def test_empty_ranges_returns_high(self):
        f = HouseFeatures(**VALID_KWARGS)
        assert compute_confidence(f, {}) == "high"

    def test_on_lower_boundary_is_in_range(self):
        """Boundary value (exactly min) must not count as out-of-range."""
        f = HouseFeatures(**{**VALID_KWARGS, "square_footage": 980.0})
        assert compute_confidence(f, TRAINING_RANGES) == "high"

    def test_on_upper_boundary_is_in_range(self):
        f = HouseFeatures(**{**VALID_KWARGS, "square_footage": 4900.0})
        assert compute_confidence(f, TRAINING_RANGES) == "high"

    def test_just_below_lower_boundary_is_out(self):
        f = HouseFeatures(**{**VALID_KWARGS, "square_footage": 979.0})
        assert compute_confidence(f, TRAINING_RANGES) in {"medium", "low"}
