from typing import Optional
import numpy as np
from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session

from app.database import get_db
from app.auth.security import get_current_user_optional, rate_limiter
from app.models.db_models import User, ValidationRun
from app.schemas.schemas import ValidationResponse, StudyAreaId
from app.validation.evaluator import ValidationEvaluator
from app.api.digital_twin_router import generate_study_area_grid

router = APIRouter(prefix="/validation", tags=["Internal Self-Consistency Checks"])

@router.post("/run", response_model=ValidationResponse)
def execute_validation(
    request: Request,
    study_area_id: StudyAreaId = Query(default="delhi_cp"),
    scenario_id: str = Query(default="scen_baseline"),
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional)
):
    """
    Executes an internal microclimate self-consistency check.
    Compares simulated surface temperatures against synthetic benchmark states with injected sensor noise.
    """
    if request.client:
        rate_limiter.check(request.client.host)
        
    grid = generate_study_area_grid(study_area_id=study_area_id, rows=40, cols=40)
    simulated_ts = np.array(grid["layers"]["baseline_temperature_c"])
    
    # Generate benchmark fields with controlled variance
    rng = np.random.default_rng(101)
    observed_lst = simulated_ts + rng.normal(0, 0.45, simulated_ts.shape)
    
    val_res = ValidationEvaluator.evaluate_against_observations(simulated_ts, observed_lst)
    
    run_db = ValidationRun(
        name=f"Internal Self-Consistency Check — {study_area_id}",
        observed_source=val_res["observed_source"],
        simulated_scenario_id=scenario_id,
        mae=val_res["mae"],
        rmse=val_res["rmse"],
        r2=val_res["r2"],
        spatial_error_summary=val_res["error_quantiles"],
        calibration_status=val_res["calibration_status"],
        owner_id=current_user.id if current_user else None
    )
    db.add(run_db)
    db.commit()
    db.refresh(run_db)
    
    return ValidationResponse(
        id=run_db.id,
        name=run_db.name,
        study_area_id=study_area_id,
        observed_source=run_db.observed_source,
        simulated_scenario_id=run_db.simulated_scenario_id,
        mae=run_db.mae,
        rmse=run_db.rmse,
        r2=run_db.r2,
        mean_bias=val_res["mean_bias"],
        spatial_error_summary=run_db.spatial_error_summary,
        scatter_points=val_res["scatter_points"],
        provenance=val_res["provenance"],
        calibration_status=run_db.calibration_status,
        created_at=run_db.created_at
    )
