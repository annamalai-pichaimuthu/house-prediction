from __future__ import annotations
import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import PredictionRecord, get_db
from app.schemas import HistoryItem, HistoryResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/history", tags=["History"])


@router.get("", response_model=HistoryResponse, summary="List prediction history")
async def get_history(db: AsyncSession = Depends(get_db)):
    """Return all past single predictions, newest first."""
    try:
        logger.debug("Fetching prediction history")
        result = await db.execute(
            select(PredictionRecord).order_by(PredictionRecord.created_at.desc())
        )
        records = result.scalars().all()
        logger.info("History fetched: %d record(s) returned", len(records))
        return HistoryResponse(
            count=len(records),
            items=[HistoryItem.model_validate(r) for r in records],
        )
    except Exception as e:
        logger.exception("Error fetching prediction history: %s", str(e))
        raise HTTPException(status_code=500, detail="Failed to retrieve prediction history.")


@router.delete("/{record_id}", status_code=204, summary="Delete a history record")
async def delete_history(record_id: int, db: AsyncSession = Depends(get_db)):
    """Remove a single prediction record by ID."""
    try:
        logger.debug("Attempting to delete history record id=%d", record_id)
        result = await db.execute(
            select(PredictionRecord).where(PredictionRecord.id == record_id)
        )
        record = result.scalar_one_or_none()
        if record is None:
            logger.warning("Delete request for non-existent record id=%d", record_id)
            raise HTTPException(status_code=404, detail=f"Record {record_id} not found.")

        await db.execute(delete(PredictionRecord).where(PredictionRecord.id == record_id))
        await db.commit()
        logger.info("History record id=%d deleted successfully", record_id)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error deleting history record id=%d: %s", record_id, str(e))
        raise HTTPException(status_code=500, detail="Failed to delete history record.")
