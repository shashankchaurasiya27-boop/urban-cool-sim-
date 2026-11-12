import os
import uuid
from typing import Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.auth.security import get_current_user_optional, rate_limiter
from app.models.db_models import User, Report, StudyArea, Scenario, SimulationResult, OptimizationRun
from app.schemas.schemas import ReportCreate, ReportResponse
from app.reports.report_builder import ReportBuilder
from app.api.digital_twin_router import STUDY_AREAS_METADATA, generate_study_area_grid

router = APIRouter(prefix="/reports", tags=["Decision Support Reports"])

def resolve_study_area_name(study_area_id: Optional[str], db: Session) -> str:
    if not study_area_id:
        return "Urban Microclimate Pilot Area"
    sa = db.query(StudyArea).filter(StudyArea.id == study_area_id).first()
    if sa and sa.name:
        return f"{sa.name} ({sa.location_name})" if sa.location_name else sa.name
    for meta in STUDY_AREAS_METADATA:
        if meta["id"] == study_area_id:
            return f"{meta['name']}, {meta['city']}, {meta['country']}"
    return study_area_id.replace("_", " ").title()

@router.post("/generate", response_model=ReportResponse)
def generate_report(
    request: Request,
    req: ReportCreate,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional)
):
    if request.client:
        rate_limiter.check(request.client.host)
        
    report_id = str(uuid.uuid4())
    study_area_name = resolve_study_area_name(req.study_area_id, db)
    
    # Resolve scenario metrics if provided
    baseline_stats: Optional[Dict[str, float]] = None
    scenario_stats: Optional[Dict[str, float]] = None
    resolved_sim_id: Optional[str] = req.simulation_run_id
    sim_res: Optional[SimulationResult] = None

    if req.simulation_run_id:
        sim_res = db.query(SimulationResult).filter(
            SimulationResult.id == req.simulation_run_id
        ).first()
        if not sim_res:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Simulation run '{req.simulation_run_id}' not found"
            )
    elif req.scenario_id:
        sim_res = db.query(SimulationResult).filter(
            SimulationResult.scenario_id == req.scenario_id
        ).order_by(SimulationResult.created_at.desc()).first()

    if sim_res:
        if sim_res.owner_id is not None:
            if not current_user:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Authentication required to generate reports for this simulation run"
                )
            if current_user.role != "admin" and current_user.id != sim_res.owner_id:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Not authorized to reference another user's simulation run"
                )
        resolved_sim_id = sim_res.id
        baseline_stats = {
            "baseline_t_mean": sim_res.baseline_t_mean,
            "delta_t_mean": sim_res.delta_t_mean
        }
        scenario_stats = {
            "scenario_t_mean": sim_res.scenario_t_mean
        }
    
    # Resolve optimization metrics if provided
    opt_res: Optional[Dict[str, Any]] = None
    if req.optimization_run_id:
        opt_run = db.query(OptimizationRun).filter(
            OptimizationRun.id == req.optimization_run_id
        ).first()
        if opt_run and opt_run.recommended_solution:
            opt_res = {"recommended_solution": opt_run.recommended_solution}

    grid_metadata = None
    try:
        grid_metadata = generate_study_area_grid(study_area_id=req.study_area_id, rows=50, cols=50).get("metadata")
    except Exception as exc:
        print(f"[UrbanCoolSim] Report grid metadata unavailable for {req.study_area_id}: {exc}")

    md_content = ReportBuilder.generate_markdown_report(
        study_area_name=study_area_name,
        baseline_stats=baseline_stats,
        scenario_stats=scenario_stats,
        optimization_res=opt_res,
        grid_metadata=grid_metadata,
    )
    
    # Generate PDF file
    reports_dir = os.path.join(settings.STORAGE_DIR, "reports")
    os.makedirs(reports_dir, exist_ok=True)
    pdf_filepath = os.path.join(reports_dir, f"report_{report_id}.pdf")
    
    try:
        ReportBuilder.generate_pdf_report(
            output_path=pdf_filepath,
            study_area_name=study_area_name,
            baseline_stats=baseline_stats,
            scenario_stats=scenario_stats,
            optimization_res=opt_res,
            grid_metadata=grid_metadata,
        )
        pdf_path_val = f"/api/v1/reports/{report_id}/pdf"
    except Exception as e:
        print(f"[UrbanCoolSim] PDF generation notice: {e}")
        pdf_path_val = None

    report_db = Report(
        id=report_id,
        title=req.title or f"UrbanCoolSim Executive Decision Report — {study_area_name}",
        summary=f"Spatial microclimate thermodynamic assessment and optimization recommendations for {study_area_name}.",
        markdown_content=md_content,
        pdf_path=pdf_path_val,
        study_area_id=req.study_area_id,
        scenario_id=req.scenario_id,
        simulation_run_id=resolved_sim_id,
        optimization_run_id=req.optimization_run_id,
        owner_id=current_user.id if current_user else None
    )
    db.add(report_db)
    db.commit()
    db.refresh(report_db)
    
    return ReportResponse(
        id=report_db.id,
        title=report_db.title,
        summary=report_db.summary,
        markdown_content=report_db.markdown_content,
        pdf_path=report_db.pdf_path,
        simulation_run_id=report_db.simulation_run_id,
        created_at=report_db.created_at
    )

@router.get("/{report_id}/pdf")
def download_report_pdf(
    report_id: str,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional)
):
    report = db.query(Report).filter(Report.id == report_id).first()
    if not report:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Report '{report_id}' not found"
        )
        
    if report.owner_id is not None:
        if not current_user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authentication required to access this report"
            )
        if current_user.role != "admin" and current_user.id != report.owner_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not authorized to access this report"
            )

    reports_dir = os.path.join(settings.STORAGE_DIR, "reports")
    pdf_filepath = os.path.join(reports_dir, f"report_{report_id}.pdf")
    
    if not os.path.exists(pdf_filepath):
        # Regenerate on the fly from the exact persisted report/run inputs and metrics
        study_area_name = resolve_study_area_name(report.study_area_id, db)
        
        # 1. Restore simulation stats from exact linked simulation_run_id
        baseline_stats = None
        scenario_stats = None
        if report.simulation_run_id:
            sim_res = db.query(SimulationResult).filter(
                SimulationResult.id == report.simulation_run_id
            ).first()
            if not sim_res:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Cannot regenerate report PDF: linked simulation run '{report.simulation_run_id}' is no longer available"
                )
            baseline_stats = {
                "baseline_t_mean": sim_res.baseline_t_mean,
                "delta_t_mean": sim_res.delta_t_mean
            }
            scenario_stats = {
                "scenario_t_mean": sim_res.scenario_t_mean
            }
        elif report.scenario_id:
            sim_res = db.query(SimulationResult).filter(
                SimulationResult.scenario_id == report.scenario_id
            ).order_by(SimulationResult.created_at.desc()).first()
            if sim_res:
                baseline_stats = {
                    "baseline_t_mean": sim_res.baseline_t_mean,
                    "delta_t_mean": sim_res.delta_t_mean
                }
                scenario_stats = {
                    "scenario_t_mean": sim_res.scenario_t_mean
                }

        # 2. Restore optimization recommendation from exact linked optimization_run_id
        opt_res = None
        if report.optimization_run_id:
            opt_run = db.query(OptimizationRun).filter(
                OptimizationRun.id == report.optimization_run_id
            ).first()
            if opt_run and opt_run.recommended_solution:
                opt_res = {"recommended_solution": opt_run.recommended_solution}

        # 3. Grid metadata
        grid_metadata = None
        try:
            grid_metadata = generate_study_area_grid(
                study_area_id=report.study_area_id or "delhi_cp", rows=50, cols=50
            ).get("metadata")
        except Exception as grid_exc:
            print(f"[UrbanCoolSim] Regenerated PDF grid metadata unavailable: {grid_exc}")

        try:
            ReportBuilder.generate_pdf_report(
                output_path=pdf_filepath,
                study_area_name=study_area_name,
                baseline_stats=baseline_stats,
                scenario_stats=scenario_stats,
                optimization_res=opt_res,
                grid_metadata=grid_metadata,
            )
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"PDF generation error: {e}")

    return FileResponse(
        path=pdf_filepath,
        media_type="application/pdf",
        filename=f"UrbanCoolSim_Executive_Report_{report_id[:8]}.pdf"
    )
