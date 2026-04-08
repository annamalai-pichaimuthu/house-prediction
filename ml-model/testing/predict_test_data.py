import os
import sys

import joblib
import numpy as np
import pandas as pd

# ── Paths (relative to ml-model/) ────────────────────────────────────────────
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(SCRIPT_DIR)

MODEL_PATH = os.path.join(PROJECT_DIR, "app", "model.joblib")
TEST_CSV = os.path.join(SCRIPT_DIR, "test_data.csv")

FEATURE_COLS = [
    "square_footage",
    "bedrooms",
    "bathrooms",
    "year_built",
    "lot_size",
    "distance_to_city_center",
    "school_rating",
]


def main():
    # Load model
    print(f"Loading model from {MODEL_PATH}")
    pipeline = joblib.load(MODEL_PATH)

    # Load test data
    print(f"Loading test data from {TEST_CSV}")
    df = pd.read_csv(TEST_CSV)
    print(f"Loaded {len(df)} rows\n")

    # Predict
    X = df[FEATURE_COLS].values
    predictions = pipeline.predict(X)
    df["price"] = np.round(predictions, 2)

    # Display
    print("Predictions:")
    print(df.to_string(index=False))
    print()

    # Save back
    df.to_csv(TEST_CSV, index=False)
    print(f"Updated CSV saved to {TEST_CSV}")


if __name__ == "__main__":
    main()
