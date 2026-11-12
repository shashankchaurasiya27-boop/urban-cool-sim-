from typing import Optional, List, Dict, Any, Literal
import math
from pydantic import BaseModel, EmailStr, Field, ConfigDict, model_validator, field_validator
from datetime import datetime


# Canonical Study Area Identifier
StudyAreaId = Literal[
    "delhi_cp",
    "mumbai_bkc",
    "singapore_marina",
    "phoenix_downtown",
    "tokyo_shinjuku",
]


# --- Public Digital Twin API schemas ---
class ClimateBaseline(BaseModel):
    air_temp_c: float
    solar_rad_wm2: float
    rel_humidity: float
    wind_speed_ms: float
    q_f_wm2: float


class StudyAreaMetadataItem(BaseModel):
    """Metadata advertised by GET /api/v1/digital-twin/study-areas."""

    id: str
    name: str
    city: str
    country: str
    # `crs` remains for compatibility and is the configured projected CRS.
    crs: str
    configured_projected_crs: Optional[str] = None
    bbox_crs: Optional[str] = None
    grid_coordinate_crs: Optional[str] = None
    resolution_m: float
    nominal_resolution_m: Optional[float] = None
    resolution_note: Optional[str] = None
    typology: str
    description: str
    center_lat: float
    center_lon: float
    base_climate: ClimateBaseline
    analysis_window_area_m2: Optional[float] = None
    district_area_m2: Optional[float] = None
    analysis_window_width_m: Optional[float] = None
    analysis_window_height_m: Optional[float] = None
    area_calculation_method: Optional[str] = None

    model_config = ConfigDict(extra="allow")


GridMatrix = List[List[float]]
GridTextMatrix = List[List[str]]


class DigitalTwinGridLayers(BaseModel):
    """Numerical layers returned for a single sampled grid."""

    building_density: GridMatrix
    building_height: GridMatrix
    veg_fraction: GridMatrix
    water_fraction: GridMatrix
    albedo: GridMatrix
    baseline_temperature_c: GridMatrix
    seb_temperature_c: GridMatrix
    modelled_coverage_mask: GridMatrix
    canopy_height: GridMatrix
    population_density: GridMatrix
    anthropogenic_heat_qf: GridMatrix
    surface_emissivity: GridMatrix
    sky_view_factor: GridMatrix
    lai: GridMatrix


class DigitalTwinGridMetadata(BaseModel):
    """Spatial reference, effective resolution and data-provenance metadata."""

    study_area_id: str
    name: str
    city: str
    country: str
    location: str
    crs: str
    configured_projected_crs: Optional[str] = None
    bbox_crs: Optional[str] = None
    grid_coordinate_crs: Optional[str] = None
    distance_method: Optional[str] = None
    resolution_m: float
    effective_resolution_x_m: Optional[float] = None
    effective_resolution_y_m: Optional[float] = None
    nominal_resolution_m: Optional[float] = None
    resolution_note: Optional[str] = None
    rows: int
    cols: int
    total_cells: int
    typology: str
    center_lat: float
    center_lon: float
    bbox: List[float]
    base_climate: Dict[str, float]
    is_synthetic: bool
    has_observed_satellite_lst: Optional[bool] = None
    contains_modelled_layers: Optional[bool] = None
    geometry_is_georeferenced: Optional[bool] = None
    coverage_note: Optional[str] = None
    tag: str
    provenance_note: Optional[str] = None
    layer_provenance: Optional[Dict[str, str]] = None
    sources: List[str]

    model_config = ConfigDict(extra="allow")

    @field_validator("bbox")
    @classmethod
    def validate_bbox(cls, value: List[float]) -> List[float]:
        if len(value) != 4:
            raise ValueError("bbox must contain [west, south, east, north]")
        west, south, east, north = value
        if not all(math.isfinite(v) for v in value):
            raise ValueError("bbox coordinates must be finite")
        if west >= east or south >= north:
            raise ValueError("bbox must satisfy west < east and south < north")
        return value

    @model_validator(mode="after")
    def validate_grid_metadata(self):
        if self.rows < 1 or self.cols < 1:
            raise ValueError("rows and cols must be positive")
        if self.total_cells != self.rows * self.cols:
            raise ValueError("total_cells must equal rows * cols")
        for name in ("resolution_m", "effective_resolution_x_m", "effective_resolution_y_m", "nominal_resolution_m"):
            value = getattr(self, name)
            if value is not None and (not math.isfinite(value) or value <= 0):
                raise ValueError(f"{name} must be finite and positive")
        return self


class DigitalTwinGridResponse(BaseModel):
    """Response contract for GET /api/v1/digital-twin/grid."""

    metadata: DigitalTwinGridMetadata
    layers: DigitalTwinGridLayers
    landmarks: Optional[GridTextMatrix] = None

    @model_validator(mode="after")
    def validate_layer_dimensions(self):
        rows = self.metadata.rows
        cols = self.metadata.cols
        for layer_name, matrix in self.layers.model_dump().items():
            if len(matrix) != rows or any(len(row) != cols for row in matrix):
                raise ValueError(f"layers.{layer_name} must have shape ({rows}, {cols})")
            if any(not __import__("math").isfinite(float(value)) for row in matrix for value in row):
                raise ValueError(f"layers.{layer_name} must contain only finite values")
        mask = self.layers.model_dump()["modelled_coverage_mask"]
        if any(value not in (0, 1, 0.0, 1.0) for row in mask for value in row):
            raise ValueError("modelled_coverage_mask must be binary")
        return self

# --- Auth Schemas ---
class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=6)
    full_name: Optional[str] = None
    role: Optional[str] = "user"

class UserResponse(BaseModel):
    id: str
    email: str
    full_name: Optional[str] = None
    role: str
    is_active: bool
    created_at: datetime
    
    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

# --- Study Area Schemas ---
class StudyAreaCreate(BaseModel):
    name: str
    description: Optional[str] = None
    location_name: Optional[str] = None
    crs: str = "EPSG:32643"
    resolution_m: float = 10.0
    grid_rows: int = 50
    grid_cols: int = 50

class StudyAreaResponse(BaseModel):
    id: str
    name: str
    description: Optional[str]
    location_name: Optional[str]
    crs: str
    resolution_m: float
    grid_rows: int
    grid_cols: int
    is_synthetic: bool
    created_at: datetime

    class Config:
        from_attributes = True

# --- Intervention & Scenario Schemas ---
class InterventionParameters(BaseModel):
    green_roof_coverage: float = Field(default=0.0, ge=0.0, le=1.0)       # 0.0 - 1.0 fraction of building roofs
    cool_roof_albedo_boost: float = Field(default=0.0, ge=0.0, le=0.6)    # Albedo increment (e.g. +0.3)
    cool_roof_coverage: float = Field(default=0.0, ge=0.0, le=1.0)
    tree_canopy_addition: float = Field(default=0.0, ge=0.0, le=0.5)      # Fractional canopy increase per cell
    reflective_pavement_albedo: float = Field(default=0.0, ge=0.0, le=0.4) # Albedo increment on pavement
    water_feature_fraction: float = Field(default=0.0, ge=0.0, le=0.3)    # Water fraction added
    wetness_factor: float = Field(default=0.0, ge=0.0, le=1.0)             # Evapotranspiration moisture availability

class ScenarioCreate(BaseModel):
    name: str
    description: Optional[str] = None
    scenario_type: str = "custom"  # baseline, green_roofs, cool_roofs, tree_canopy, water_features, hybrid, custom
    parameters: InterventionParameters
    study_area_id: StudyAreaId

class ScenarioResponse(BaseModel):
    id: str
    name: str
    description: Optional[str]
    scenario_type: str
    parameters: Dict[str, Any]
    is_baseline: bool
    study_area_id: StudyAreaId
    created_at: datetime

    class Config:
        from_attributes = True

# --- Physics Simulation Request & Result Schemas ---
class PhysicsSimulationRequest(BaseModel):
    scenario_id: str
    study_area_id: Optional[StudyAreaId] = None
    grid_resolution_m: Optional[float] = Field(
        default=None, ge=1.0, le=100.0,
        description="Target resolution in meters. When set to 10.0 or omitted with metric_10m mode, generates true 10m projected grid.",
    )
    grid_mode: Optional[Literal["standard", "metric_10m"]] = None
    rows: Optional[int] = Field(default=None, ge=10, le=250, description="Grid rows; optional when grid_resolution_m is specified.")
    cols: Optional[int] = Field(default=None, ge=10, le=250, description="Grid columns; optional when grid_resolution_m is specified.")
    air_temperature_c: float = Field(default=38.5, ge=-20.0, le=65.0)       # Ambient air temp (°C)
    relative_humidity: float = Field(default=0.45, ge=0.01, le=1.0)          # Relative humidity (0.01 - 1.0)
    wind_speed_ms: float = Field(default=2.5, ge=0.1, le=50.0)               # Wind speed m/s (min 0.1 to avoid zero division)
    solar_radiation_wm2: float = Field(default=850.0, ge=0.0, le=1400.0)     # Peak solar irradiance W/m²
    anthropogenic_heat_wm2: float = Field(default=35.0, ge=0.0, le=500.0)    # Qf baseline traffic/AC heat
    custom_parameters: Optional[Dict[str, Any]] = None
    interventions: Optional[Dict[str, Any]] = None

class SimulationResultResponse(BaseModel):
    id: str
    run_id: Optional[str] = None
    status: Optional[str] = "completed"
    job_id: Optional[str] = None
    owner_id: Optional[str] = None
    scenario_id: str
    baseline_t_mean: float
    scenario_t_mean: float
    delta_t_mean: float
    peak_t: float
    heat_risk_reduction: float
    energy_fluxes_json: Dict[str, Any]
    spatial_summary: Dict[str, Any]
    energy_balance_residual: Optional[float] = None
    provenance: Dict[str, Any]
    created_at: datetime

    class Config:
        from_attributes = True

# --- Optimization Schemas ---
class OptimizationRequest(BaseModel):
    study_area_id: StudyAreaId = "delhi_cp"
    max_budget_usd: float = Field(default=500000.0, ge=1000.0, le=100000000.0)
    max_water_demand_m3: float = Field(default=10000.0, ge=0.0, le=1000000.0)
    max_land_area_m2: float = Field(default=50000.0, ge=0.0, le=10000000.0)
    target_cooling_c: float = Field(default=2.5, ge=0.0, le=15.0)
    weight_cooling: float = Field(default=0.35, ge=0.0, le=1.0)
    weight_cost: float = Field(default=0.25, ge=0.0, le=1.0)
    weight_population: float = Field(default=0.20, ge=0.0, le=1.0)
    weight_water: float = Field(default=0.10, ge=0.0, le=1.0)
    weight_energy: float = Field(default=0.10, ge=0.0, le=1.0)
    min_cool_roof_reflectance: float = Field(default=0.70, ge=0.10, le=0.95)
    max_tree_area_pct: float = Field(default=0.35, ge=0.0, le=0.90)
    population_size: int = Field(default=40, ge=10, le=100)                  # Aligned with MAX_POPULATION_SIZE=100
    n_gen: int = Field(default=30, ge=5, le=200)                             # Aligned with MAX_OPTIMIZATION_ITERATIONS=200

class ParetoSolution(BaseModel):
    solution_id: int
    green_roof_pct: float
    cool_roof_pct: float
    tree_canopy_pct: float
    water_pct: float
    delta_t_mean: float
    total_cost_usd: float
    water_demand_m3: float
    land_area_m2: float
    heat_risk_score: float
    hvac_energy_savings_kwh: Optional[float] = None
    electricity_cost_savings_usd: Optional[float] = None
    co2_avoided_tons: Optional[float] = None
    payback_period_years: Optional[float] = None
    composite_score: Optional[float] = None
    physics_validated: bool = False
    validated_delta_t: Optional[float] = None
    validation_error: Optional[float] = None
    mean_temp_reduction_c: Optional[float] = None
    total_capex_usd: Optional[float] = None
    is_feasible: bool = True
    constraint_violations: List[str] = Field(default_factory=list)

    @model_validator(mode="before")
    @classmethod
    def populate_solution_aliases(cls, data: Any) -> Any:
        if isinstance(data, dict):
            mapped = dict(data)
            if "mean_temp_reduction_c" not in mapped and "delta_t_mean" in mapped:
                mapped["mean_temp_reduction_c"] = mapped["delta_t_mean"]
            if "total_capex_usd" not in mapped and "total_cost_usd" in mapped:
                mapped["total_capex_usd"] = mapped["total_cost_usd"]
            return mapped
        return data

class OptimizationResponse(BaseModel):
    id: str
    name: str
    study_area_id: Optional[str] = None
    analysis_window_area_m2: Optional[float] = None
    district_area_m2: Optional[float] = None
    building_footprint_m2: Optional[float] = None
    objectives: List[str]
    constraints: Dict[str, Any]
    weights: Optional[Dict[str, float]] = None
    pareto_solutions: List[ParetoSolution]
    pareto_front: Optional[List[ParetoSolution]] = None
    recommended_solution: Optional[ParetoSolution] = None
    physics_validated: bool
    has_feasible_solutions: Optional[bool] = True
    status: Optional[str] = "optimal"
    created_at: datetime

    @model_validator(mode="before")
    @classmethod
    def populate_opt_aliases(cls, data: Any) -> Any:
        if isinstance(data, dict):
            mapped = dict(data)
            if "pareto_front" not in mapped and "pareto_solutions" in mapped:
                mapped["pareto_front"] = mapped["pareto_solutions"]
            if "analysis_window_area_m2" not in mapped and "district_area_m2" in mapped:
                mapped["analysis_window_area_m2"] = mapped["district_area_m2"]
            return mapped
        return data

# --- Surrogate Inference Request (M-9) ---
class SurrogateInferenceRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    
    baseline_albedo: float = Field(default=0.18, ge=0.01, le=1.0)
    baseline_veg_frac: float = Field(default=0.12, ge=0.0, le=1.0)
    baseline_water_frac: float = Field(default=0.02, ge=0.0, le=1.0)
    building_height: float = Field(default=22.0, ge=1.0, le=200.0)
    building_density: float = Field(default=0.45, ge=0.0, le=1.0)
    q_f: float = Field(default=40.0, ge=0.0, le=500.0)
    air_temp_c: float = Field(default=38.5, ge=10.0, le=60.0)
    solar_rad: float = Field(default=850.0, ge=0.0, le=1500.0)
    wind_speed: float = Field(default=2.5, ge=0.1, le=50.0)
    green_roof_coverage: float = Field(default=0.0, ge=0.0, le=1.0)
    cool_roof_albedo_boost: float = Field(default=0.0, ge=0.0, le=1.0)
    tree_canopy_addition: float = Field(default=0.0, ge=0.0, le=1.0)
    reflective_pavement_albedo: float = Field(default=0.0, ge=0.0, le=1.0)
    water_feature_fraction: float = Field(default=0.0, ge=0.0, le=1.0)
    wetness_factor: float = Field(default=0.5, ge=0.0, le=1.0)

    @model_validator(mode="before")
    @classmethod
    def map_aliases(cls, data: Any) -> Any:
        if isinstance(data, dict):
            mapped = dict(data)
            if "green_roof_pct" in mapped:
                mapped["green_roof_coverage"] = mapped.pop("green_roof_pct")
            if "cool_roof_pct" in mapped:
                mapped["cool_roof_albedo_boost"] = mapped.pop("cool_roof_pct")
            if "tree_canopy_pct" in mapped:
                mapped["tree_canopy_addition"] = mapped.pop("tree_canopy_pct")
            if "water_pct" in mapped:
                mapped["water_feature_fraction"] = mapped.pop("water_pct")
            return mapped
        return data

# --- Validation Schemas ---
class ValidationScatterPoint(BaseModel):
    cell_index: int
    row: int
    col: int
    benchmark_temperature_c: float
    simulated_temperature_c: float

class ValidationResponse(BaseModel):
    id: str
    name: str
    study_area_id: StudyAreaId
    observed_source: str
    simulated_scenario_id: Optional[str]
    mae: float
    rmse: float
    r2: float
    mean_bias: float
    spatial_error_summary: Dict[str, Any]
    scatter_points: List[ValidationScatterPoint]
    provenance: Dict[str, Any]
    calibration_status: str
    created_at: datetime

# --- Report Schemas ---
class ReportCreate(BaseModel):
    title: Optional[str] = None
    study_area_id: StudyAreaId = "delhi_cp"
    scenario_id: Optional[str] = None
    simulation_run_id: Optional[str] = None
    optimization_run_id: Optional[str] = None

class ReportResponse(BaseModel):
    id: str
    title: str
    summary: Optional[str]
    markdown_content: str
    pdf_path: Optional[str]
    simulation_run_id: Optional[str] = None
    created_at: datetime
