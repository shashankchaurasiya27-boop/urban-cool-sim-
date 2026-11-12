from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import List, Optional

from app.database import get_db
from app.auth.security import get_current_user_optional
from app.models.db_models import User, Scenario, StudyArea
from app.schemas.schemas import ScenarioCreate, ScenarioResponse, StudyAreaId

router = APIRouter(prefix="/scenarios", tags=["Scenarios & Interventions"])

@router.post("", response_model=ScenarioResponse, status_code=status.HTTP_201_CREATED)
def create_scenario(
    scen_in: ScenarioCreate,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional)
):
    scen = Scenario(
        name=scen_in.name,
        description=scen_in.description,
        scenario_type=scen_in.scenario_type,
        parameters=scen_in.parameters.model_dump(),
        study_area_id=scen_in.study_area_id,
        is_baseline=(scen_in.scenario_type == "baseline"),
        owner_id=current_user.id if current_user else None
    )
    db.add(scen)
    db.commit()
    db.refresh(scen)
    return scen

@router.get("", response_model=List[ScenarioResponse])
def list_scenarios(
    study_area_id: StudyAreaId = Query(default="delhi_cp"),
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional)
):
    """
    M-7: Lists scenarios filtered by study_area_id without dynamic GET-handler seeding.
    """
    scenarios = db.query(Scenario).filter(
        Scenario.study_area_id == study_area_id
    ).order_by(Scenario.created_at.asc()).all()
    
    return scenarios
