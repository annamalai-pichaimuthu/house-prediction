"""
train.py
--------
Train a Ridge regression pipeline on the housing dataset and serialize it
with joblib. Run this once at Docker build time; the API loads the artifact
at startup.

Usage:
    python train.py
"""

import json
import logging
import os

import joblib
import numpy as np
import pandas as pd
from sklearn.linear_model import Ridge, RidgeCV
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import cross_val_score, train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

# ── Logging Configuration ────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ── Paths ────────────────────────────────────────────────────────────────────
DATA_PATH  = os.environ.get("DATA_PATH",  "House_Price_Dataset.csv")
MODEL_PATH = os.environ.get("MODEL_PATH", "app/model.joblib")
META_PATH  = os.environ.get("META_PATH",  "app/model_meta.json")

# ── Feature config ───────────────────────────────────────────────────────────
FEATURE_COLS = [
    "square_footage",
    "bedrooms",
    "bathrooms",
    "year_built",
    "lot_size",
    "distance_to_city_center",
    "school_rating",
]
TARGET_COL = "price"


def train():
    try:
        # 1. Load data
        logger.info("Loading data from %s", DATA_PATH)
        try:
            df = pd.read_csv(DATA_PATH)
            logger.info("Loaded %d rows from %s", len(df), DATA_PATH)
            logger.debug("Dataset shape: %s", df.shape)
        except FileNotFoundError:
            logger.error("Data file not found at %s", DATA_PATH)
            raise
        except Exception as e:
            logger.exception("Error loading data: %s", str(e))
            raise

        # Validate required columns
        missing_cols = [col for col in FEATURE_COLS + [TARGET_COL] if col not in df.columns]
        if missing_cols:
            logger.error("Missing required columns: %s", missing_cols)
            raise ValueError(f"Missing columns: {missing_cols}")
        logger.debug("All required columns present")

        X = df[FEATURE_COLS].values
        y = df[TARGET_COL].values
        logger.debug("Features and target extracted: X.shape=%s, y.shape=%s", X.shape, y.shape)

        # 2. Train / test split (80/20, fixed seed for reproducibility)
        logger.info("Performing train-test split (80/20)")
        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=0.2, random_state=42
        )
        logger.info("Train set: %d samples, Test set: %d samples", len(X_train), len(X_test))
        logger.debug("Training features shape: %s", X_train.shape)

        # 3. Find best alpha via RidgeCV (generalised cross-validation), then
        #    build the final pipeline with that alpha.
        logger.info("Searching for best alpha via RidgeCV (LOO-GCV)...")
        ALPHAS = np.logspace(-2, 1, 50)    # 0.01 … 10, 50 candidates
        try:
            # RidgeCV on scaled features — fit scaler first so the CV search
            # operates in the same feature space as the final model.
            scaler_for_cv = StandardScaler()
            X_train_scaled = scaler_for_cv.fit_transform(X_train)
            ridge_cv = RidgeCV(alphas=ALPHAS, scoring="r2", cv=5)
            ridge_cv.fit(X_train_scaled, y_train)
            best_alpha = float(ridge_cv.alpha_)
            logger.info("Best alpha found: %.4f (searched %d candidates)", best_alpha, len(ALPHAS))
        except Exception as e:
            best_alpha = 1.0
            logger.warning("Alpha search failed (%s) — falling back to alpha=1.0", e)

        # 4. Pipeline: StandardScaler → Ridge regression with the best alpha
        logger.info("Creating pipeline with StandardScaler and Ridge(alpha=%.4f)", best_alpha)
        pipeline = Pipeline(
            [
                ("scaler", StandardScaler()),
                ("model", Ridge(alpha=best_alpha)),
            ]
        )
        logger.debug("Pipeline created successfully")

        # 4. Fit
        logger.info("Training model...")
        try:
            pipeline.fit(X_train, y_train)
            logger.info("Model training completed successfully")
        except Exception as e:
            logger.exception("Error during model training: %s", str(e))
            raise

        # 5. Evaluate on held-out test set
        logger.info("Evaluating model on test set...")
        try:
            y_pred = pipeline.predict(X_test)
            r2   = r2_score(y_test, y_pred)
            rmse = float(np.sqrt(mean_squared_error(y_test, y_pred)))
            mae  = float(mean_absolute_error(y_test, y_pred))
            
            logger.info("Test metrics - R²: %.4f, RMSE: $%.2f, MAE: $%.2f", r2, rmse, mae)
            logger.debug("Test predictions generated: %d predictions", len(y_pred))
        except Exception as e:
            logger.exception("Error during evaluation: %s", str(e))
            raise

        # 6. 5-fold cross-validation R² (more reliable on small dataset)
        logger.info("Performing 5-fold cross-validation...")
        try:
            cv_scores = cross_val_score(pipeline, X, y, cv=5, scoring="r2")
            logger.info("CV R² (5-fold): %.4f ± %.4f", cv_scores.mean(), cv_scores.std())
            logger.debug("Individual CV scores: %s", cv_scores)
        except Exception as e:
            logger.exception("Error during cross-validation: %s", str(e))
            raise

        # 7. Extract coefficients (after inverse-scaling for interpretability)
        logger.info("Extracting model coefficients...")
        try:
            scaler = pipeline.named_steps["scaler"]
            ridge  = pipeline.named_steps["model"]
            coef_original = ridge.coef_ / scaler.scale_
            coefficients  = dict(zip(FEATURE_COLS, coef_original.tolist()))
            logger.debug("Coefficients extracted: %s", coefficients)
        except Exception as e:
            logger.exception("Error extracting coefficients: %s", str(e))
            raise

        # 8. Persist model artifact
        logger.info("Saving model to %s", MODEL_PATH)
        try:
            os.makedirs(os.path.dirname(MODEL_PATH), exist_ok=True)
            joblib.dump(pipeline, MODEL_PATH, compress=3)
            logger.info("Model saved successfully - File size check available at: %s", MODEL_PATH)
        except Exception as e:
            logger.exception("Error saving model: %s", str(e))
            raise

        # 9. Persist metadata (loaded by /model-info endpoint)
        logger.info("Creating and saving metadata to %s", META_PATH)
        try:
            # Compute per-feature min/max from the full dataset (not just train split)
            # so the ranges reflect the complete distribution the model was built from.
            X_df = df[FEATURE_COLS]
            training_ranges = {
                col: [round(float(X_df[col].min()), 4), round(float(X_df[col].max()), 4)]
                for col in FEATURE_COLS
            }
            logger.info("Training ranges computed from dataset: %s", training_ranges)

            meta = {
                "feature_columns": FEATURE_COLS,
                "target_column":   TARGET_COL,
                "model_type":      "Ridge Regression",
                "alpha":           round(best_alpha, 6),
                "alpha_search":    {
                    "method":        "RidgeCV (5-fold CV)",
                    "candidates":    len(ALPHAS),
                    "search_range":  [round(float(ALPHAS[0]), 4), round(float(ALPHAS[-1]), 1)],
                },
                "training_rows":   int(len(X_train)),
                "test_rows":       int(len(X_test)),
                "metrics": {
                    "r2_score":    round(r2, 4),
                    "rmse":        round(rmse, 2),
                    "mae":         round(mae, 2),
                    "cv_r2_mean":  round(float(cv_scores.mean()), 4),
                    "cv_r2_std":   round(float(cv_scores.std()), 4),
                },
                "coefficients":    {k: round(v, 4) for k, v in coefficients.items()},
                "intercept":       round(float(ridge.intercept_), 2),
                "training_ranges": training_ranges,
            }
            with open(META_PATH, "w") as f:
                json.dump(meta, f, indent=2)
            logger.info("Metadata saved successfully")
            logger.debug("Metadata keys: %s", list(meta.keys()))
        except Exception as e:
            logger.exception("Error saving metadata: %s", str(e))
            raise

        logger.info("Training pipeline completed successfully!")
        return meta
        
    except Exception as e:
        logger.exception("Training pipeline failed: %s", str(e))
        raise


if __name__ == "__main__":
    try:
        logger.info("Starting housing price model training...")
        train()
        logger.info("Model training finished successfully")
    except Exception as e:
        logger.error("Training failed with error: %s", str(e))
        exit(1)