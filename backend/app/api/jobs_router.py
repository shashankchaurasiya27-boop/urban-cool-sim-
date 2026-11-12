from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional

from app.database import get_db
from app.auth.security import get_current_user_optional
from app.models.db_models import User, SimulationJob

router = APIRouter(prefix="/jobs", tags=["Background Computation Jobs"])

@router.get("", response_model=List[dict])
def list_jobs(
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional)
):
    """
    Lists real simulation jobs recorded in the database.
    Returns an empty list [] if no jobs exist, never synthetic records.
    """
    query = db.query(SimulationJob)
    if current_user and current_user.role != "admin":
        query = query.filter(
            (SimulationJob.owner_id == current_user.id) | (SimulationJob.owner_id.is_(None))
        )
    jobs = query.order_by(SimulationJob.created_at.desc()).limit(20).all()
    return [
        {
            "id": j.id,
            "job_type": j.job_type,
            "status": j.status,
            "progress": j.progress,
            "error_message": j.error_message,
            "result_metadata": j.result_metadata,
            "owner_id": j.owner_id,
            "study_area_id": j.study_area_id,
            "scenario_id": j.scenario_id,
            "created_at": j.created_at.isoformat() if j.created_at else None,
            "updated_at": j.updated_at.isoformat() if j.updated_at else None,
        }
        for j in jobs
    ]

@router.get("/{job_id}")
def get_job_status(
    job_id: str,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional)
):
    """
    Retrieves execution status for a specific simulation job.
    Returns HTTP 404 if the job does not exist.
    """
    job = db.query(SimulationJob).filter(SimulationJob.id == job_id).first()
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Simulation job '{job_id}' not found"
        )
    return {
        "id": job.id,
        "job_type": job.job_type,
        "status": job.status,
        "progress": job.progress,
        "error_message": job.error_message,
        "result_metadata": job.result_metadata,
        "owner_id": job.owner_id,
        "study_area_id": job.study_area_id,
        "scenario_id": job.scenario_id,
        "created_at": job.created_at.isoformat() if job.created_at else None,
        "updated_at": job.updated_at.isoformat() if job.updated_at else None,
    }
