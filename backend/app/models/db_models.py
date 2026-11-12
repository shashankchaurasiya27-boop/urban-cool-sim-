import datetime
import uuid
from sqlalchemy import Column, String, Integer, Float, Boolean, DateTime, ForeignKey, Text, JSON
from sqlalchemy.orm import relationship

from app.database import Base

def generate_uuid():
    return str(uuid.uuid4())

class User(Base):
    __tablename__ = "users"
    
    id = Column(String, primary_key=True, default=generate_uuid)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    full_name = Column(String, nullable=True)
    role = Column(String, default="planner")  # admin, scientist, planner, viewer
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

class Organization(Base):
    __tablename__ = "organizations"
    
    id = Column(String, primary_key=True, default=generate_uuid)
    name = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

class Project(Base):
    __tablename__ = "projects"
    
    id = Column(String, primary_key=True, default=generate_uuid)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    organization_id = Column(String, ForeignKey("organizations.id"), nullable=True)
    owner_id = Column(String, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    
    study_areas = relationship("StudyArea", back_populates="project")

class StudyArea(Base):
    __tablename__ = "study_areas"
    
    id = Column(String, primary_key=True, default=generate_uuid)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    location_name = Column(String, nullable=True)
    bounds_geojson = Column(JSON, nullable=True)
    crs = Column(String, default="EPSG:32643")
    resolution_m = Column(Float, default=10.0)
    grid_rows = Column(Integer, default=50)
    grid_cols = Column(Integer, default=50)
    is_synthetic = Column(Boolean, default=True)
    project_id = Column(String, ForeignKey("projects.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    
    project = relationship("Project", back_populates="study_areas")
    scenarios = relationship("Scenario", back_populates="study_area")

class Scenario(Base):
    __tablename__ = "scenarios"
    
    id = Column(String, primary_key=True, default=generate_uuid)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    scenario_type = Column(String, default="baseline")  # baseline, green_roofs, cool_roofs, tree_canopy, water_features, hybrid, custom
    parameters = Column(JSON, nullable=False, default={})
    is_baseline = Column(Boolean, default=False)
    study_area_id = Column(String, ForeignKey("study_areas.id"), nullable=False)
    owner_id = Column(String, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    
    study_area = relationship("StudyArea", back_populates="scenarios")
    simulation_results = relationship("SimulationResult", back_populates="scenario")

class SimulationJob(Base):
    __tablename__ = "simulation_jobs"
    
    id = Column(String, primary_key=True, default=generate_uuid)
    job_type = Column(String, nullable=False)  # physics_simulation, surrogate_training, optimization_sweep, report_generation
    status = Column(String, default="queued")  # queued, running, completed, failed, cancelled
    progress = Column(Float, default=0.0)
    error_message = Column(Text, nullable=True)
    result_metadata = Column(JSON, nullable=True)
    owner_id = Column(String, ForeignKey("users.id"), nullable=True)
    study_area_id = Column(String, ForeignKey("study_areas.id"), nullable=True)
    scenario_id = Column(String, ForeignKey("scenarios.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

class SimulationResult(Base):
    __tablename__ = "simulation_results"
    
    id = Column(String, primary_key=True, default=generate_uuid, unique=True)
    job_id = Column(String, ForeignKey("simulation_jobs.id"), nullable=True)
    scenario_id = Column(String, ForeignKey("scenarios.id"), nullable=False)
    owner_id = Column(String, ForeignKey("users.id"), nullable=True)
    baseline_t_mean = Column(Float, nullable=False)
    scenario_t_mean = Column(Float, nullable=False)
    delta_t_mean = Column(Float, nullable=False)
    peak_t = Column(Float, nullable=False)
    heat_risk_reduction = Column(Float, default=0.0)
    energy_fluxes_json = Column(JSON, nullable=True)  # Q*, Qf, Qh, Qe, dQs spatial stats
    spatial_summary = Column(JSON, nullable=True)     # Min, Max, Quantiles of delta_T
    raster_file_path = Column(String, nullable=True)
    provenance = Column(JSON, nullable=True)          # physics_version, equations, timestamp, synthetic_flag
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    
    scenario = relationship("Scenario", back_populates="simulation_results")
    owner = relationship("User")

class ModelVersion(Base):
    __tablename__ = "model_versions"
    
    id = Column(String, primary_key=True, default=generate_uuid)
    name = Column(String, nullable=False)
    model_type = Column(String, default="LightGBMRegressor")
    target_variable = Column(String, default="delta_T")
    mae = Column(Float, nullable=True)
    rmse = Column(Float, nullable=True)
    r2 = Column(Float, nullable=True)
    metrics = Column(JSON, nullable=True)
    feature_importance = Column(JSON, nullable=True)
    artifact_path = Column(String, nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

class OptimizationRun(Base):
    __tablename__ = "optimization_runs"
    
    id = Column(String, primary_key=True, default=generate_uuid)
    name = Column(String, nullable=False)
    objectives = Column(JSON, nullable=False)      # e.g., ["max_cooling", "min_cost", "min_water"]
    constraints = Column(JSON, nullable=False)     # e.g., {"max_budget": 500000, "max_water": 10000}
    pareto_solutions = Column(JSON, nullable=False) # List of non-dominated solutions
    recommended_solution = Column(JSON, nullable=True)
    study_area_id = Column(String, ForeignKey("study_areas.id"), nullable=False)
    physics_validated = Column(Boolean, default=False)
    owner_id = Column(String, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

class ValidationRun(Base):
    __tablename__ = "validation_runs"
    
    id = Column(String, primary_key=True, default=generate_uuid)
    name = Column(String, nullable=False)
    observed_source = Column(String, default="synthetic baseline (procedural)")
    simulated_scenario_id = Column(String, ForeignKey("scenarios.id"), nullable=True)
    mae = Column(Float, nullable=False)
    rmse = Column(Float, nullable=False)
    r2 = Column(Float, nullable=False)
    spatial_error_summary = Column(JSON, nullable=True)
    calibration_status = Column(String, default="Self-Consistent")
    owner_id = Column(String, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

class Report(Base):
    __tablename__ = "reports"
    
    id = Column(String, primary_key=True, default=generate_uuid)
    title = Column(String, nullable=False)
    summary = Column(Text, nullable=True)
    markdown_content = Column(Text, nullable=False)
    pdf_path = Column(String, nullable=True)
    study_area_id = Column(String, ForeignKey("study_areas.id"), nullable=True)
    scenario_id = Column(String, ForeignKey("scenarios.id"), nullable=True)
    simulation_run_id = Column(String, ForeignKey("simulation_results.id"), nullable=True)
    optimization_run_id = Column(String, ForeignKey("optimization_runs.id"), nullable=True)
    owner_id = Column(String, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
