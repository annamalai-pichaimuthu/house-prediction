import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from app.config import settings
from app.database import init_db
from app.routers import history, model_info, predict

logger = logging.getLogger("property_api")

logging.basicConfig(
    level=settings.log_level,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting up %s v%s", settings.app_title, settings.app_version)
    logger.info(
        "Environment: APP_ENV=%s, LOG_LEVEL=%s, ML_MODEL_URL=%s, PORT=%d",
        settings.app_env, settings.log_level, settings.ml_model_url, settings.backend_python_port,
    )
    try:
        logger.info("Initialising database...")
        await init_db()
        logger.info("Database initialised successfully")
    except Exception as e:
        logger.exception("Failed to initialise database: %s", str(e))
        raise
    yield
    logger.info("Shutting down %s", settings.app_title)


app = FastAPI(
    title=settings.app_title,
    version=settings.app_version,
    description="Property Value Estimator backend — proxies the ML model and stores prediction history.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(predict.router)
app.include_router(history.router)
app.include_router(model_info.router)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.exception("Unhandled error on %s %s: %s", request.method, request.url, str(exc))
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error."},
    )
