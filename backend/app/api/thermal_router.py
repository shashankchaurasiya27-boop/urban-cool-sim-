import math
import uuid
import datetime
import threading
from typing import Optional, List, Dict, Any
import numpy as np
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.config import settings
from app.database import get_db
from app.auth.security import get_current_user_optional, rate_limiter
from app.models.db_models import User, Scenario, StudyArea, SimulationResult
from app.schemas.schemas import PhysicsSimulationRequest, SimulationResultResponse, StudyAreaId
from app.physics.energy_balance import EnergyBalanceSolver
from app.api.digital_twin_router import generate_study_area_grid
from app.spatial.geo_digital_twin import STUDY_AREA_CONFIGS, validate_grid_parameters

router = APIRouter(prefix="/thermal", tags=["Physics Thermal Simulation"])

# Concurrency limiting semaphore to prevent threadpool exhaustion (H-2)
_THERMAL_SEMAPHORE = threading.Semaphore(settings.MAX_CONCURRENT_SIMULATIONS)

class DiurnalPoint(BaseModel):
    hour: int
    time_label: str
    air_temp_c: float
    baseline_surface_temp_c: float
    scenario_surface_temp_c: float
    cooling_benefit_c: float
    solar_radiation_wm2: float

class DiurnalProfileResponse(BaseModel):
    study_area_id: StudyAreaId
    scenario_id: str
    diurnal_curve: List[DiurnalPoint]
    peak_baseline_t: float
    peak_scenario_t: float
    max_cooling_c: float
    nighttime_cooling_c: float

@router.post("/simulate", response_model=SimulationResultResponse)
def run_physics_simulation(
    request: Request,
    req: PhysicsSimulationRequest,
    study_area_id: StudyAreaId = Query(default="delhi_cp"),
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional)
):
    """
    Executes first-principles Surface Energy Balance (SEB) physics simulation.
    Protected by concurrency semaphore (H-2) and exposes numerical residual (Phase 4.4).
    """
    if request.client:
        rate_limiter.check(request.client.host)
        
    acquired = _THERMAL_SEMAPHORE.acquire(blocking=True, timeout=10.0)
    if not acquired:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="The thermal simulation engine is currently at maximum concurrent capacity. Please retry shortly."
        )
        
    try:
        # Fetch scenario parameters if available
        interventions = {}
        if req.interventions:
            interventions = dict(req.interventions)
        elif req.custom_parameters:
            interventions = dict(req.custom_parameters)
        elif req.scenario_id:
            scen = db.query(Scenario).filter(Scenario.id == req.scenario_id).first()
            if scen and scen.parameters and len(scen.parameters) > 0:
                interventions = dict(scen.parameters)
            elif "hybrid" in req.scenario_id or req.scenario_id in ("optimized", "scen_hybrid_cp"):
                interventions = {
                    "green_roof_coverage": 0.35,
                    "cool_roof_albedo_boost": 0.25,
                    "tree_canopy_addition": 0.20,
                    "reflective_pavement_albedo": 0.15,
                    "water_feature_fraction": 0.05,
                    "wetness_factor": 0.60
                }
            elif "cool" in req.scenario_id:
                interventions = {
                    "cool_roof_albedo_boost": 0.35,
                    "reflective_pavement_albedo": 0.20,
                    "cool_roof_coverage": 0.60
                }
            elif "green" in req.scenario_id:
                interventions = {
                    "green_roof_coverage": 0.50,
                    "wetness_factor": 0.60
                }
            elif "canopy" in req.scenario_id or "tree" in req.scenario_id:
                interventions = {
                    "tree_canopy_addition": 0.30,
                    "wetness_factor": 0.55
                }
                
        # Grid dimension & resolution validation via shared authoritative validator
        try:
            g_mode, target_res, g_rows, g_cols = validate_grid_parameters(
                grid_mode=req.grid_mode,
                resolution_m=req.grid_resolution_m,
                rows=req.rows,
                cols=req.cols,
            )
        except ValueError as val_err:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=str(val_err)
            )

        active_area_id = req.study_area_id or study_area_id
        config = STUDY_AREA_CONFIGS.get(active_area_id, STUDY_AREA_CONFIGS["delhi_cp"])
        base_climate = config.get("base_climate", {})

        try:
            grid = generate_study_area_grid(
                study_area_id=active_area_id,
                rows=g_rows,
                cols=g_cols,
                resolution_m=target_res,
                grid_mode=g_mode
            )
        except ValueError as val_err:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=str(val_err)
            )
        layers = grid["layers"]
        
        # Adapt to country/study area base climate when generic defaults are passed
        air_temp = req.air_temperature_c if req.air_temperature_c != 38.5 else base_climate.get("air_temp_c", 38.5)
        solar_rad = req.solar_radiation_wm2 if req.solar_radiation_wm2 != 850.0 else base_climate.get("solar_rad_wm2", 850.0)
        rel_hum = req.relative_humidity if req.relative_humidity != 0.45 else base_climate.get("rel_humidity", 0.45)
        wind_spd = req.wind_speed_ms if req.wind_speed_ms != 2.5 else base_climate.get("wind_speed_ms", 2.5)
        q_f_val = req.anthropogenic_heat_wm2 if req.anthropogenic_heat_wm2 != 35.0 else base_climate.get("q_f_wm2", 35.0)

        solver = EnergyBalanceSolver(
            solar_rad=solar_rad,
            air_temp_c=air_temp,
            rel_humidity=rel_hum,
            wind_speed=wind_spd
        )
        
        grid_inputs = {
            "albedo": np.array(layers["albedo"]),
            "emissivity": 0.95,
            "veg_fraction": np.array(layers["veg_fraction"]),
            "water_fraction": np.array(layers["water_fraction"]),
            "building_height": np.array(layers["building_height"]),
            "building_density": np.array(layers["building_density"]),
            "q_f": q_f_val
        }
        
        # Run Baseline Simulation
        base_res = solver.solve_grid(grid_inputs, interventions={})
        # Run Scenario Simulation
        scen_res = solver.solve_grid(grid_inputs, interventions=interventions)
        
        base_ts = base_res["T_surface_c"]
        scen_ts = scen_res["T_surface_c"]
        delta_ts = base_ts - scen_ts
        
        base_t_mean = float(np.mean(base_ts))
        scen_t_mean = float(np.mean(scen_ts))
        delta_t_mean = float(np.mean(delta_ts))
        peak_t = float(np.max(scen_ts))
        
        mean_residual = float(np.mean(scen_res.get("residual", np.zeros_like(scen_ts))))
        
        # Energy fluxes spatial means
        fluxes_summary = {
            "Q_star_mean": float(np.mean(scen_res["Q_star"])),
            "Q_f_mean": float(req.anthropogenic_heat_wm2),
            "Q_h_mean": float(np.mean(scen_res["Q_h"])),
            "Q_e_mean": float(np.mean(scen_res["Q_e"])),
            "dQs_mean": float(np.mean(scen_res["dQs"])),
        }
        
        spatial_summary = {
            "min_t_c": float(np.min(scen_ts)),
            "max_t_c": peak_t,
            "p25_t_c": float(np.percentile(scen_ts, 25)),
            "p50_t_c": float(np.median(scen_ts)),
            "p75_t_c": float(np.percentile(scen_ts, 75)),
            "max_cooling_c": float(np.max(delta_ts)),
            "spatial_delta_map": np.round(delta_ts, 2).tolist(),
            "baseline_temp_map": np.round(base_ts, 2).tolist(),
            "scenario_temp_map": np.round(scen_ts, 2).tolist()
        }
        
        provenance = {
            "equation": "Q* + Qf = Qh + Qe + dQs",
            "solver": "Newton-Raphson Surface Energy Balance Solver with Bisection Fallback",
            "units": "°C, W/m²",
            "synthetic_flag": True,
            "is_physics_informed": True,
            "grid": {
                "rows": grid["metadata"]["rows"],
                "cols": grid["metadata"]["cols"],
                "bbox": grid["metadata"]["bbox"],
                "bbox_crs": grid["metadata"]["bbox_crs"],
                "grid_coordinate_crs": grid["metadata"]["grid_coordinate_crs"],
                "nominal_resolution_m": grid["metadata"]["nominal_resolution_m"],
                "effective_resolution_x_m": grid["metadata"]["effective_resolution_x_m"],
                "effective_resolution_y_m": grid["metadata"]["effective_resolution_y_m"],
                "effective_resolution_m": grid["metadata"]["resolution_m"],
                "resolution_note": grid["metadata"]["resolution_note"],
            }
        }
        
        # Ensure scenario exists for referential integrity
        active_scenario_id = req.scenario_id or "scen_baseline"
        scen = db.query(Scenario).filter(Scenario.id == active_scenario_id).first()
        if not scen:
            sa_id = active_area_id if db.query(StudyArea).filter(StudyArea.id == active_area_id).first() else "delhi_cp"
            scen = Scenario(
                id=active_scenario_id,
                name=active_scenario_id.replace("_", " ").title(),
                description="Auto-registered scenario for simulation run",
                scenario_type="custom",
                parameters=interventions,
                study_area_id=sa_id
            )
            db.add(scen)
            try:
                db.commit()
                db.refresh(scen)
            except Exception:
                db.rollback()
                scen = db.query(Scenario).filter(Scenario.id == active_scenario_id).first()

        # Generate persistent run_id with full 128-bit collision resistance (UUID4 hex)
        run_id = f"sim_{uuid.uuid4().hex}"

        sim_record = SimulationResult(
            id=run_id,
            job_id=None,
            scenario_id=scen.id if scen else active_scenario_id,
            owner_id=current_user.id if current_user else None,
            baseline_t_mean=round(base_t_mean, 2),
            scenario_t_mean=round(scen_t_mean, 2),
            delta_t_mean=round(delta_t_mean, 2),
            peak_t=round(peak_t, 2),
            heat_risk_reduction=round(delta_t_mean * 15.0, 1),
            energy_fluxes_json=fluxes_summary,
            spatial_summary=spatial_summary,
            provenance=provenance,
            created_at=datetime.datetime.utcnow()
        )
        db.add(sim_record)
        try:
            db.commit()
            db.refresh(sim_record)
        except Exception as e:
            db.rollback()
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Simulation result persistence failed: {str(e)}"
            )

        return SimulationResultResponse(
            id=sim_record.id,
            run_id=sim_record.id,
            status="completed",
            job_id=sim_record.job_id,
            owner_id=sim_record.owner_id,
            scenario_id=sim_record.scenario_id,
            baseline_t_mean=sim_record.baseline_t_mean,
            scenario_t_mean=sim_record.scenario_t_mean,
            delta_t_mean=sim_record.delta_t_mean,
            peak_t=sim_record.peak_t,
            heat_risk_reduction=sim_record.heat_risk_reduction,
            energy_fluxes_json=sim_record.energy_fluxes_json,
            spatial_summary=sim_record.spatial_summary,
            energy_balance_residual=round(mean_residual, 4),
            provenance=sim_record.provenance,
            created_at=sim_record.created_at
        )
    finally:
        _THERMAL_SEMAPHORE.release()


@router.get("/runs/{run_id}", response_model=SimulationResultResponse)
def get_simulation_run(
    run_id: str,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional)
):
    """
    Retrieves an authoritative past simulation run by its unique run_id.
    Enforces authorization: runs owned by a specific user are accessible only
    by that user or an administrator. Public/unowned runs are accessible to all.
    """
    sim_res = db.query(SimulationResult).filter(SimulationResult.id == run_id).first()
    if not sim_res:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Simulation run '{run_id}' not found"
        )
    
    if sim_res.owner_id is not None:
        if not current_user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authentication required to access this simulation run"
            )
        if current_user.role != "admin" and current_user.id != sim_res.owner_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not authorized to access this simulation run"
            )

    return SimulationResultResponse(
        id=sim_res.id,
        run_id=sim_res.id,
        status="completed",
        job_id=sim_res.job_id,
        owner_id=sim_res.owner_id,
        scenario_id=sim_res.scenario_id,
        baseline_t_mean=sim_res.baseline_t_mean,
        scenario_t_mean=sim_res.scenario_t_mean,
        delta_t_mean=sim_res.delta_t_mean,
        peak_t=sim_res.peak_t,
        heat_risk_reduction=sim_res.heat_risk_reduction,
        energy_fluxes_json=sim_res.energy_fluxes_json or {},
        spatial_summary=sim_res.spatial_summary or {},
        provenance=sim_res.provenance or {},
        created_at=sim_res.created_at
    )


@router.get("/runs", response_model=List[SimulationResultResponse])
def list_simulation_runs(
    study_area_id: Optional[StudyAreaId] = Query(default=None),
    scenario_id: Optional[str] = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional)
):
    """
    Lists recent simulation runs, optionally filtered by scenario_id or study_area_id.
    Enforces authorization:
    - Admins see all runs.
    - Authenticated users see their own runs and unowned (public) runs.
    - Unauthenticated users see unowned (public) runs.
    """
    query = db.query(SimulationResult)
    if current_user:
        if current_user.role != "admin":
            query = query.filter(
                (SimulationResult.owner_id == current_user.id) | (SimulationResult.owner_id.is_(None))
            )
    else:
        query = query.filter(SimulationResult.owner_id.is_(None))

    if scenario_id:
        query = query.filter(SimulationResult.scenario_id == scenario_id)
    if study_area_id:
        query = query.join(Scenario).filter(Scenario.study_area_id == study_area_id)
    runs = query.order_by(SimulationResult.created_at.desc()).limit(limit).all()
    return [
        SimulationResultResponse(
            id=r.id,
            run_id=r.id,
            status="completed",
            job_id=r.job_id,
            owner_id=r.owner_id,
            scenario_id=r.scenario_id,
            baseline_t_mean=r.baseline_t_mean,
            scenario_t_mean=r.scenario_t_mean,
            delta_t_mean=r.delta_t_mean,
            peak_t=r.peak_t,
            heat_risk_reduction=r.heat_risk_reduction,
            energy_fluxes_json=r.energy_fluxes_json or {},
            spatial_summary=r.spatial_summary or {},
            provenance=r.provenance or {},
            created_at=r.created_at
        )
        for r in runs
    ]


@router.get("/diurnal-profile", response_model=DiurnalProfileResponse)
def get_diurnal_profile(
    study_area_id: StudyAreaId = Query(default="delhi_cp"),
    scenario_id: str = Query(default="scen_hybrid_cp"),
    green_roof_pct: Optional[float] = Query(default=None),
    cool_roof_pct: Optional[float] = Query(default=None),
    tree_canopy_pct: Optional[float] = Query(default=None),
    water_pct: Optional[float] = Query(default=None),
    db: Session = Depends(get_db)
):
    """
    Computes 24-hour Diurnal Temperature Profile (00:00 to 23:00) using
    time-stepped Surface Energy Balance (SEB) solver physics.
    Accurately accounts for requested scenario interventions (H-7).
    """
    config = STUDY_AREA_CONFIGS.get(study_area_id, STUDY_AREA_CONFIGS["delhi_cp"])
    base_climate = config.get("base_climate", {})
    peak_solar = float(base_climate.get("solar_rad_wm2", 920.0))
    base_air_peak = float(base_climate.get("air_temp_c", 42.0))
    air_diurnal_amplitude = 7.5
    
    # Resolve scenario parameters (H-7)
    params = {}
    if scenario_id:
        scen = db.query(Scenario).filter(Scenario.id == scenario_id).first()
        if scen and scen.parameters:
            params = dict(scen.parameters)
        elif "hybrid" in scenario_id or scenario_id in ("scen_hybrid_cp", "hybrid", "optimized"):
            params = {
                "green_roof_coverage": 0.35,
                "cool_roof_albedo_boost": 0.25,
                "tree_canopy_addition": 0.20,
                "reflective_pavement_albedo": 0.15,
                "water_feature_fraction": 0.05,
                "wetness_factor": 0.60
            }
        elif scenario_id in ("cool_roofs", "scen_cool_roofs"):
            params = {
                "green_roof_coverage": 0.0,
                "cool_roof_albedo_boost": 0.45,
                "tree_canopy_addition": 0.0,
                "reflective_pavement_albedo": 0.20,
                "water_feature_fraction": 0.0,
                "wetness_factor": 0.50
            }
        elif scenario_id in ("green_roofs", "scen_green_roofs"):
            params = {
                "green_roof_coverage": 0.50,
                "cool_roof_albedo_boost": 0.0,
                "tree_canopy_addition": 0.0,
                "reflective_pavement_albedo": 0.0,
                "water_feature_fraction": 0.0,
                "wetness_factor": 0.70
            }
        elif scenario_id in ("tree_canopy", "scen_tree_canopy"):
            params = {
                "green_roof_coverage": 0.0,
                "cool_roof_albedo_boost": 0.0,
                "tree_canopy_addition": 0.35,
                "reflective_pavement_albedo": 0.0,
                "water_feature_fraction": 0.0,
                "wetness_factor": 0.65
            }

    # Override with explicitly supplied query parameters if present (e.g. from NSGA-II solution)
    if green_roof_pct is not None:
        params["green_roof_coverage"] = green_roof_pct
    if cool_roof_pct is not None:
        params["cool_roof_albedo_boost"] = cool_roof_pct
    if tree_canopy_pct is not None:
        params["tree_canopy_addition"] = tree_canopy_pct
    if water_pct is not None:
        params["water_feature_fraction"] = water_pct
            
    base_albedo = 0.18
    base_veg = 0.12
    base_water = 0.02
    
    scen_albedo = base_albedo + (0.45 * params.get("cool_roof_albedo_boost", 0.0)) + (0.55 * params.get("reflective_pavement_albedo", 0.0))
    scen_veg = base_veg + (0.45 * params.get("green_roof_coverage", 0.0)) + params.get("tree_canopy_addition", 0.0)
    scen_water = base_water + params.get("water_feature_fraction", 0.0)
    wetness = params.get("wetness_factor", 0.5)

    points = []
    for h in range(24):
        time_lbl = f"{h:02d}:00"
        
        # Diurnal Solar Curve
        if 6 <= h <= 18:
            solar = peak_solar * (math.sin(math.pi * (h - 6) / 12.0) ** 1.2)
        else:
            solar = 0.0
            
        # Diurnal Air Temp (peaks at ~15:00)
        air_t = base_air_peak - (air_diurnal_amplitude * (1.0 - math.cos(math.pi * (h - 15) / 12.0)) / 2.0)
        
        # Step through real physics solver for baseline and scenario (H-7)
        rel_hum = float(base_climate.get("rel_humidity", 0.45))
        wind_spd = float(base_climate.get("wind_speed_ms", 2.5))
        q_f_base = float(base_climate.get("q_f_wm2", 35.0))
        bldg_h = 16.6 if study_area_id == "tokyo_shinjuku" else (15.0 if study_area_id == "delhi_cp" else 14.0)
        bldg_dens = 0.26 if study_area_id == "tokyo_shinjuku" else (0.28 if study_area_id == "delhi_cp" else 0.25)

        solver_h = EnergyBalanceSolver(
            solar_rad=solar,
            air_temp_c=air_t,
            rel_humidity=rel_hum,
            wind_speed=wind_spd
        )
        
        base_eq = solver_h.solve_cell_equilibrium(
            albedo=base_albedo,
            emissivity=0.95,
            veg_fraction=base_veg,
            water_fraction=base_water,
            building_height=bldg_h,
            building_density=bldg_dens,
            q_f=q_f_base,
            wetness_factor=0.5
        )
        
        scen_eq = solver_h.solve_cell_equilibrium(
            albedo=scen_albedo,
            emissivity=0.95,
            veg_fraction=scen_veg,
            water_fraction=scen_water,
            building_height=bldg_h,
            building_density=bldg_dens,
            q_f=q_f_base,
            wetness_factor=wetness
        )
        
        base_surf_t = base_eq["T_surface_c"]
        scen_surf_t = scen_eq["T_surface_c"]
        benefit = base_surf_t - scen_surf_t
        
        points.append(DiurnalPoint(
            hour=h,
            time_label=time_lbl,
            air_temp_c=round(float(air_t), 1),
            baseline_surface_temp_c=round(float(base_surf_t), 1),
            scenario_surface_temp_c=round(float(scen_surf_t), 1),
            cooling_benefit_c=round(float(benefit), 2),
            solar_radiation_wm2=round(float(solar), 0)
        ))
        
    peak_base = max(p.baseline_surface_temp_c for p in points)
    peak_scen = max(p.scenario_surface_temp_c for p in points)
    max_cool = max(p.cooling_benefit_c for p in points)
    night_cool = float(np.mean([p.cooling_benefit_c for p in points if p.hour < 6 or p.hour > 20]))
    
    return DiurnalProfileResponse(
        study_area_id=study_area_id,
        scenario_id=scenario_id,
        diurnal_curve=points,
        peak_baseline_t=peak_base,
        peak_scenario_t=peak_scen,
        max_cooling_c=round(float(max_cool), 2),
        nighttime_cooling_c=round(float(night_cool), 2)
    )
