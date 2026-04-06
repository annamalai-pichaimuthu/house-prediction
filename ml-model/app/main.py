import asyncio
import json
import logging
import logging.config
import os
from contextlib import asynccontextmanager
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import joblib
import numpy as np
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse

from app.schemas import (
    BatchPrediction,
    HealthResponse,
    HouseFeatures,
    ModelInfoResponse,
    PredictRequest,
    SinglePrediction,
    compute_confidence,
)
_SERVICE_ENV = Path(__file__).resolve().parents[1] / ".env"

load_dotenv(_SERVICE_ENV)

# ── Config ────────────────────────────────────────────────────────────────────
MODEL_PATH = os.environ.get("MODEL_PATH", "app/model.joblib")
META_PATH  = os.environ.get("META_PATH",  "app/model_meta.json")
APP_ENV    = os.environ.get("APP_ENV",    "development")
LOG_LEVEL  = os.environ.get("LOG_LEVEL",  "INFO")
# Workers for CPU-bound inference. Default: min(4, cpu_count)
MAX_WORKERS = int(os.environ.get("INFERENCE_WORKERS", min(4, (os.cpu_count() or 2))))

FEATURE_COLS = [
    "square_footage",
    "bedrooms",
    "bathrooms",
    "year_built",
    "lot_size",
    "distance_to_city_center",
    "school_rating",
]

# ── Structured JSON logging ───────────────────────────────────────────────────
class _JsonFormatter(logging.Formatter):
    """Emit each log record as a single JSON line."""

    def format(self, record: logging.LogRecord) -> str:
        payload: dict = {
            "time":    self.formatTime(record, "%Y-%m-%dT%H:%M:%S"),
            "level":   record.levelname,
            "logger":  record.name,
            "message": record.getMessage(),
        }
        if record.exc_info:
            payload["exc_info"] = self.formatException(record.exc_info)
        return json.dumps(payload)


logging.config.dictConfig({
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "json": {"()": _JsonFormatter},
    },
    "handlers": {
        "stdout": {
            "class":     "logging.StreamHandler",
            "formatter": "json",
            "stream":    "ext://sys.stdout",
        }
    },
    "root": {"level": LOG_LEVEL, "handlers": ["stdout"]},
})

logger = logging.getLogger("housing_api")


# ── App state (populated at startup) ─────────────────────────────────────────
class AppState:
    model = None
    meta: dict = {}
    executor: ThreadPoolExecutor = None


state = AppState()


# ── Lifespan: load model once ─────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Load model and metadata into memory before the first request arrives."""
    try:
        logger.info("Loading model from %s …", MODEL_PATH)
        logger.info("Environment: APP_ENV=%s, LOG_LEVEL=%s, INFERENCE_WORKERS=%d", APP_ENV, LOG_LEVEL, MAX_WORKERS)
        state.model = joblib.load(MODEL_PATH)
        logger.debug("Model object loaded successfully from joblib")
        
        state.executor = ThreadPoolExecutor(max_workers=MAX_WORKERS)
        logger.debug("ThreadPoolExecutor initialized with %d workers", MAX_WORKERS)

        try:
            with open(META_PATH, encoding="utf-8") as f:
                state.meta = json.load(f)
            logger.debug("Metadata loaded successfully from %s", META_PATH)
        except FileNotFoundError:
            logger.error("Metadata file not found at %s", META_PATH)
            raise
        except json.JSONDecodeError as e:
            logger.error("Failed to parse metadata JSON from %s: %s", META_PATH, str(e))
            raise

        logger.info(
            "Model ready — type=%s, R²=%.4f",
            state.meta.get("model_type"),
            state.meta.get("metrics", {}).get("r2_score", 0),
        )
        yield  # ← app runs here

    except Exception as e:
        logger.exception("Critical error during model loading: %s", str(e))
        raise
    finally:
        try:
            if state.executor:
                state.executor.shutdown(wait=True)   # wait for in-flight inferences to finish
                logger.info("Executor shut down successfully")
        except Exception as e:
            logger.error("Error during executor shutdown: %s", str(e))


# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="Housing Price Prediction API",
    description=(
        "Predict residential property prices using a Ridge regression model "
        "trained on 7 structural and location features."
    ),
    version="1.0.0",
    lifespan=lifespan,
)

# GZip compress responses > 1 KB — important for large batch payloads
app.add_middleware(GZipMiddleware, minimum_size=1024)


# ── Helper ────────────────────────────────────────────────────────────────────
def _features_to_array(features: list[HouseFeatures]) -> np.ndarray:
    """Convert a list of HouseFeatures into a 2-D numpy matrix (n_samples × n_features)."""
    return np.array(
        [[getattr(h, col) for col in FEATURE_COLS] for h in features],
        dtype=np.float64,
    )


def _run_inference(X: np.ndarray) -> np.ndarray:
    """
    Pure CPU work — runs inside the ThreadPoolExecutor.
    sklearn's predict() calls numpy BLAS routines under the hood;
    keeping it off the event loop prevents blocking other async handlers.
    """
    try:
        logger.debug("Starting inference on batch of %d samples", X.shape[0])
        predictions = state.model.predict(X)
        logger.debug("Inference completed successfully: %d predictions generated", len(predictions))
        return predictions
    except Exception as e:
        logger.exception("Error during model inference: %s", str(e))
        raise


# ── Endpoints ─────────────────────────────────────────────────────────────────

@app.get(
    "/health",
    response_model=HealthResponse,
    summary="Health check",
    tags=["Operations"],
)
async def health():
    """
    Lightweight liveness probe — safe to poll at high frequency.
    No model inference; just reads in-memory state.
    """
    try:
        logger.debug("Health check requested")
        response = HealthResponse(
            status="ok",
            model_loaded=state.model is not None,
            model_type=state.meta.get("model_type", "unknown"),
        )
        logger.debug("Health check passed - model_loaded=%s", response.model_loaded)
        return response
    except Exception as e:
        logger.exception("Error in health check: %s", str(e))
        return HealthResponse(
            status="error",
            model_loaded=False,
            model_type="unknown",
        )


@app.get(
    "/model-info",
    response_model=ModelInfoResponse,
    summary="Model coefficients and performance metrics",
    tags=["Model"],
)
async def model_info():
    """
    Returns:
    - Feature coefficients (in original feature units, $/unit)
    - Intercept
    - Test-set metrics: R², RMSE, MAE
    - 5-fold CV R² mean ± std
    - Training / test split sizes
    """
    try:
        logger.debug("Model info requested")
        if not state.meta:
            logger.warning("Model metadata not available for /model-info request")
            raise HTTPException(status_code=503, detail="Model metadata not loaded.")
        
        # state.meta already contains training_ranges (persisted in model_meta.json);
        # pass it directly to avoid a duplicate-keyword TypeError.
        response = ModelInfoResponse(**state.meta)
        logger.debug("Model info returned successfully")
        return response
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error retrieving model info: %s", str(e))
        raise HTTPException(status_code=500, detail="Error retrieving model information.")


@app.post(
    "/predict",
    summary="Predict housing price — single or batch",
    tags=["Prediction"],
)
async def predict(request: PredictRequest):
    """
    Accepts either a **single** house or a **batch** (up to 10,000):

    **Single:**
    ```json
    { "features": { "square_footage": 1700, "bedrooms": 3, ... } }
    ```

    **Batch:**
    ```json
    { "features": [ { "square_footage": 1700, ... }, { "square_footage": 2200, ... } ] }
    ```

    Responses:
    - Single → `{ "predicted_price": 275000.0, "currency": "USD" }`
    - Batch  → `{ "predictions": [275000.0, 345000.0], "count": 2, "currency": "USD" }`
    """
    try:
        if state.model is None:
            logger.error("Prediction request received but model is not loaded")
            raise HTTPException(status_code=503, detail="Model not loaded.")

        is_single = isinstance(request.features, HouseFeatures)
        houses    = [request.features] if is_single else request.features
        
        logger.info("Prediction request - type=%s, count=%d", 
                   "single" if is_single else "batch", len(houses))

        try:
            # Build numpy matrix — fast list comprehension, no pandas overhead
            X = _features_to_array(houses)
            logger.debug("Feature array built successfully: shape=%s", X.shape)
        except Exception as e:
            logger.error("Failed to convert features to array: %s", str(e))
            raise HTTPException(status_code=400, detail="Invalid feature format.")

        try:
            # Offload CPU-bound sklearn predict to thread pool
            loop        = asyncio.get_running_loop()
            predictions = await loop.run_in_executor(state.executor, _run_inference, X)
            logger.debug("Inference completed for %d samples", len(predictions))
        except Exception as e:
            logger.exception("Inference execution failed: %s", str(e))
            raise HTTPException(status_code=500, detail="Model inference failed.")

        # Pass live training_ranges from metadata so confidence is not hardcoded
        live_ranges: dict[str, list[float]] = state.meta.get("training_ranges", {})

        if is_single:
            response = SinglePrediction(
                predicted_price=round(float(predictions[0]), 2),
                confidence=compute_confidence(houses[0], live_ranges),
            )
            logger.info("Single prediction returned: price=%.2f, confidence=%s",
                       response.predicted_price, response.confidence)
            return response
        else:
            response = BatchPrediction(
                predictions=[round(float(p), 2) for p in predictions],
                confidences=[compute_confidence(h, live_ranges) for h in houses],
                count=len(predictions),
            )
            logger.info("Batch prediction returned: count=%d", response.count)
            return response
            
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Unexpected error in predict endpoint: %s", str(e))
        raise HTTPException(status_code=500, detail="Internal server error.")


# ── Global error handler ──────────────────────────────────────────────────────
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    try:
        logger.exception("Unhandled error on %s %s", request.method, request.url)
        return JSONResponse(
            status_code=500,
            content={"detail": "Internal server error."},
        )
    except Exception as e:
        logger.exception("Error in global exception handler: %s", str(e))
        return JSONResponse(
            status_code=500,
            content={"detail": "Internal server error."},
        )