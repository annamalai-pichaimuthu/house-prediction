from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

_SERVICE_ENV = str(Path(__file__).resolve().parents[1] / ".env")


class Settings(BaseSettings):
    # ── Inter-service URLs ────────────────────────────────────────────────────
    ml_model_url:          str = "http://localhost:8000"
    backend_python_port:   int = 8001

    # ── Application ───────────────────────────────────────────────────────────
    app_env:               str = "development"
    log_level:             str = "INFO"

    # ── Service-specific ──────────────────────────────────────────────────────
    database_url: str = "sqlite+aiosqlite:///./history.db"
    app_title:    str = "Property Value Estimator API"
    app_version:  str = "1.0.0"

    model_config = SettingsConfigDict(
        env_file=_SERVICE_ENV,
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()
