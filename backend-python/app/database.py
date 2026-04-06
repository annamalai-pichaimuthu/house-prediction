import logging
from datetime import datetime, timezone
from sqlalchemy import DateTime, Float, Integer, String
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from app.config import settings

logger = logging.getLogger(__name__)

engine = create_async_engine(settings.database_url, echo=False)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)
logger.debug("Database engine created with URL: %s", settings.database_url)


class Base(DeclarativeBase):
    pass


class PredictionRecord(Base):
    """One row per prediction request."""

    __tablename__ = "predictions"

    id: Mapped[int]   = mapped_column(Integer, primary_key=True, autoincrement=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )
    # Input features
    square_footage:         Mapped[float] = mapped_column(Float, nullable=False)
    bedrooms:               Mapped[int]   = mapped_column(Integer, nullable=False)
    bathrooms:              Mapped[float] = mapped_column(Float, nullable=False)
    year_built:             Mapped[int]   = mapped_column(Integer, nullable=False)
    lot_size:               Mapped[float] = mapped_column(Float, nullable=False)
    distance_to_city_center: Mapped[float] = mapped_column(Float, nullable=False)
    school_rating:          Mapped[float] = mapped_column(Float, nullable=False)
    # Output
    predicted_price: Mapped[float] = mapped_column(Float, nullable=False)
    confidence: Mapped[str] = mapped_column(String(6), nullable=False, default="high")


async def init_db() -> None:
    """Create tables if they don't exist yet (called at startup)."""
    try:
        logger.info("Creating database tables if not present...")
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        logger.info("Database tables ready")
    except Exception as e:
        logger.exception("Error initialising database tables: %s", str(e))
        raise


async def get_db() -> AsyncSession:
    """FastAPI dependency that yields an async DB session."""
    try:
        async with AsyncSessionLocal() as session:
            logger.debug("Database session opened")
            yield session
            logger.debug("Database session closed")
    except Exception as e:
        logger.exception("Database session error: %s", str(e))
        raise
