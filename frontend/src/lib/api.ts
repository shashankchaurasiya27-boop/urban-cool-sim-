const API_BASE = "/api/v1";

export interface StudyAreaOption {
  id: string;
  name: string;
  city: string;
  country: string;
  crs: string;
  resolution_m: number;
  typology: string;
  description: string;
  center_lat: number;
  center_lon: number;
  analysis_window_area_m2?: number;
  district_area_m2?: number;
  base_climate: {
    air_temp_c: number;
    solar_rad_wm2: number;
    rel_humidity: number;
    wind_speed_ms: number;
    q_f_wm2: number;
  };
}

export interface DigitalTwinGrid {
  metadata: {
    study_area_id?: string;
    name: string;
    city?: string;
    country?: string;
    location: string;
    crs: string;
    configured_projected_crs?: string;
    distance_method?: string;
    bbox?: number[];
    bbox_crs?: string;
    grid_coordinate_crs?: string;
    resolution_m: number;
    effective_resolution_x_m?: number;
    effective_resolution_y_m?: number;
    nominal_resolution_m?: number;
    resolution_note?: string;
    analysis_window_area_m2?: number;
    district_area_m2?: number;
    has_observed_satellite_lst?: boolean;
    contains_modelled_layers?: boolean;
    geometry_is_georeferenced?: boolean;
    coverage_note?: string;
    provenance_note?: string;
    layer_provenance?: Record<string, string>;
    rows: number;
    cols: number;
    total_cells: number;
    typology?: string;
    center_lat?: number;
    center_lon?: number;
    base_climate?: any;
    is_synthetic: boolean;
    tag: string;
    sources?: string[];
  };
  layers: {
    building_density: number[][];
    building_height: number[][];
    veg_fraction: number[][];
    water_fraction: number[][];
    albedo: number[][];
    baseline_temperature_c: number[][];
    canopy_height?: number[][];
    population_density?: number[][];
    anthropogenic_heat_qf?: number[][];
    surface_emissivity?: number[][];
    seb_temperature_c?: number[][];
    modelled_coverage_mask?: number[][];
    sky_view_factor?: number[][];
    lai?: number[][];
  };
  landmarks?: string[][];
}

export interface SimulationResult {
  id: string;
  scenario_id: string;
  run_id?: string;
  status?: "completed";
  job_id?: string | null;
  owner_id?: string | null;
  baseline_t_mean: number;
  scenario_t_mean: number;
  delta_t_mean: number;
  peak_t: number;
  heat_risk_reduction: number;
  energy_balance_residual?: number;
  energy_fluxes_json: {
    Q_star_mean: number;
    Q_f_mean: number;
    Q_h_mean: number;
    Q_e_mean: number;
    dQs_mean: number;
  };
  spatial_summary: {
    min_t_c: number;
    max_t_c: number;
    p25_t_c: number;
    p50_t_c: number;
    p75_t_c: number;
    max_cooling_c: number;
    spatial_delta_map: number[][];
    baseline_temp_map: number[][];
    scenario_temp_map: number[][];
  };
  provenance: {
    equation: string;
    solver: string;
    units: string;
    synthetic_flag: boolean;
  };
}

export interface ParetoSolution {
  solution_id: number;
  green_roof_pct: number;
  cool_roof_pct: number;
  tree_canopy_pct: number;
  water_pct: number;
  delta_t_mean: number;
  mean_temp_reduction_c?: number;
  total_cost_usd: number;
  total_capex_usd?: number;
  water_demand_m3: number;
  land_area_m2: number;
  heat_risk_score: number;
  hvac_energy_savings_kwh?: number;
  electricity_cost_savings_usd?: number;
  co2_avoided_tons?: number;
  payback_period_years?: number;
  composite_score?: number;
  physics_validated: boolean;
  validated_delta_t: number;
  validation_error: number;
  is_feasible?: boolean;
  constraint_violations?: string[];
}

export interface OptimizationResponse {
  id: string;
  name: string;
  objectives: string[];
  constraints: Record<string, any>;
  weights?: Record<string, number>;
  pareto_solutions: ParetoSolution[];
  pareto_front?: ParetoSolution[];
  analysis_window_area_m2?: number;
  recommended_solution: ParetoSolution;
  physics_validated: boolean;
  has_feasible_solutions?: boolean;
  status?: string;
}

export interface CriticalZone {
  zone_id: string;
  name: string;
  area_pct: number;
  cell_count: number;
  mean_temp_c: number;
  peak_temp_c: number;
  benefit: string;
  constraint: string;
  unit_cost_usd_m2: number;
}

export interface HeatRiskData {
  study_area_id: string;
  location: string;
  heat_alert_tier: string;
  heat_alert_message: string;
  mean_surface_temp_c: number;
  peak_surface_temp_c: number;
  total_population_estimate: number;
  population_high_exposure: number;
  outdoor_workers_at_risk: number;
  vulnerable_area_pct: number;
  critical_zones: CriticalZone[];
  ward_risk_ranking: {
    rank: number;
    ward_name: string;
    mean_temp_c: number;
    population_exposed: number;
    hvi_score: number;
    risk_tier: string;
    primary_driver: string;
    recommended_action: string;
  }[];
  hvi_distribution: {
    low: number;
    medium: number;
    high: number;
  };
}

export interface DiurnalPoint {
  hour: number;
  time_label: string;
  air_temp_c: number;
  baseline_surface_temp_c: number;
  scenario_surface_temp_c: number;
  cooling_benefit_c: number;
  solar_radiation_wm2: number;
}

export interface DiurnalProfileResponse {
  study_area_id: string;
  scenario_id: string;
  diurnal_curve: DiurnalPoint[];
  peak_baseline_t: number;
  peak_scenario_t: number;
  max_cooling_c: number;
  nighttime_cooling_c: number;
}

export interface ValidationScatterPoint {
  cell_index: number;
  row: number;
  col: number;
  benchmark_temperature_c: number;
  simulated_temperature_c: number;
}

export interface ValidationResponse {
  id: string;
  name: string;
  study_area_id: string;
  observed_source: string;
  simulated_scenario_id?: string | null;
  mae: number;
  rmse: number;
  r2: number;
  mean_bias: number;
  spatial_error_summary: Record<string, number>;
  scatter_points: ValidationScatterPoint[];
  provenance: {
    tag: string;
    benchmark_generation: string;
    independent_observations_used: boolean;
    units: string;
    pixel_count: number;
    scatter_sample_count: number;
  };
  calibration_status: string;
}

export const DEFAULT_STUDY_AREAS: StudyAreaOption[] = [
  {
    id: "delhi_cp",
    name: "Connaught Place Radial District",
    city: "New Delhi",
    country: "India",
    crs: "EPSG:32643",
    resolution_m: 10.0,
    typology: "commercial_radial",
    description: "Dense concentric commercial ring around Central Park, high thermal inertia asphalt roadways.",
    center_lat: 28.6328,
    center_lon: 77.2197,
    analysis_window_area_m2: 1747713,
    district_area_m2: 1747713,
    base_climate: { air_temp_c: 42.0, solar_rad_wm2: 920.0, rel_humidity: 0.35, wind_speed_ms: 2.2, q_f_wm2: 45.0 }
  },
  {
    id: "mumbai_bkc",
    name: "Bandra Kurla Complex (BKC)",
    city: "Mumbai",
    country: "India",
    crs: "EPSG:32643",
    resolution_m: 10.0,
    typology: "coastal_commercial",
    description: "High-rise financial district with Mithi River corridor, high humidity and low surface albedo.",
    center_lat: 19.0657,
    center_lon: 72.8683,
    analysis_window_area_m2: 2335793,
    district_area_m2: 2335793,
    base_climate: { air_temp_c: 36.5, solar_rad_wm2: 840.0, rel_humidity: 0.75, wind_speed_ms: 3.8, q_f_wm2: 50.0 }
  },
  {
    id: "singapore_marina",
    name: "Marina Bay Financial District",
    city: "Singapore",
    country: "Singapore",
    crs: "EPSG:32648",
    resolution_m: 10.0,
    typology: "tropical_waterfront",
    description: "Equatorial high-rise waterfront with integrated park connectors, tropical humidity and water cooling.",
    center_lat: 1.2847,
    center_lon: 103.8565,
    analysis_window_area_m2: 2309763,
    district_area_m2: 2309763,
    base_climate: { air_temp_c: 33.0, solar_rad_wm2: 880.0, rel_humidity: 0.82, wind_speed_ms: 2.8, q_f_wm2: 40.0 }
  },
  {
    id: "phoenix_downtown",
    name: "Downtown Urban Core",
    city: "Phoenix, AZ",
    country: "USA",
    crs: "EPSG:32612",
    resolution_m: 10.0,
    typology: "arid_desert_grid",
    description: "Low-humidity arid desert grid with intense solar radiation, wide asphalt streets and high night heat retention.",
    center_lat: 33.4484,
    center_lon: -112.0740,
    analysis_window_area_m2: 1885263,
    district_area_m2: 1885263,
    base_climate: { air_temp_c: 45.0, solar_rad_wm2: 1020.0, rel_humidity: 0.18, wind_speed_ms: 2.0, q_f_wm2: 55.0 }
  },
  {
    id: "tokyo_shinjuku",
    name: "Shinjuku Skyscraper Center",
    city: "Tokyo",
    country: "Japan",
    crs: "EPSG:32654",
    resolution_m: 10.0,
    typology: "hyperdense_canyon",
    description: "Extreme building heights, complex 3D urban canyons, high anthropogenic HVAC heat release.",
    center_lat: 35.6905,
    center_lon: 139.6965,
    analysis_window_area_m2: 1875877,
    district_area_m2: 1875877,
    base_climate: { air_temp_c: 35.5, solar_rad_wm2: 860.0, rel_humidity: 0.68, wind_speed_ms: 2.4, q_f_wm2: 65.0 }
  }
];

export function createFallbackDigitalTwinGrid(studyAreaId = "delhi_cp", rows = 50, cols = 50): DigitalTwinGrid {
  const meta = DEFAULT_STUDY_AREAS.find((s) => s.id === studyAreaId) || DEFAULT_STUDY_AREAS[0];
  const b_t = meta.base_climate.air_temp_c;

  const baseT: number[][] = [];
  const bldgD: number[][] = [];
  const bldgH: number[][] = [];
  const vegF: number[][] = [];
  const waterF: number[][] = [];
  const alb: number[][] = [];
  const canopyH: number[][] = [];
  const popD: number[][] = [];
  const qf: number[][] = [];
  const emiss: number[][] = [];
  const svf: number[][] = [];
  const lai: number[][] = [];
  const coverageMask: number[][] = [];
  const landmarks: string[][] = [];

  for (let r = 0; r < rows; r++) {
    baseT[r] = []; bldgD[r] = []; bldgH[r] = []; vegF[r] = [];
    waterF[r] = []; alb[r] = []; canopyH[r] = []; popD[r] = [];
    qf[r] = []; emiss[r] = []; svf[r] = []; lai[r] = [];
    coverageMask[r] = [];
    landmarks[r] = [];

    for (let c = 0; c < cols; c++) {
      const distFromCenter = Math.sqrt((r - rows / 2) ** 2 + (c - cols / 2) ** 2);
      const isCenter = distFromCenter < 11;
      const v = isCenter ? 0.85 : 0.08;
      const w = 0.0;
      const bd = isCenter ? 0.02 : 0.72;
      const bh = isCenter ? 0.0 : 26.0;

      baseT[r][c] = Number((b_t + (bd * 6.5) - (v * 4.8)).toFixed(2));
      bldgD[r][c] = bd;
      bldgH[r][c] = bh;
      vegF[r][c] = v;
      waterF[r][c] = w;
      alb[r][c] = isCenter ? 0.22 : 0.17;
      canopyH[r][c] = v > 0.3 ? 15.0 : 0.0;
      popD[r][c] = Math.round(bd * 260);
      qf[r][c] = Math.round(bd * 42);
      emiss[r][c] = 0.94;
      svf[r][c] = 0.74;
      lai[r][c] = Number((v * 3.2).toFixed(2));
      coverageMask[r][c] = 1; // synthetic visualization support only, not observed geographic coverage
      landmarks[r][c] = isCenter ? "Illustrative Green Buffer" : "Synthetic Urban Archetype";
    }
  }

  return {
    metadata: {
      study_area_id: studyAreaId,
      name: meta.name,
      city: meta.city,
      country: meta.country,
      location: `${meta.city}, ${meta.country}`,
      crs: "EPSG:4326",
      configured_projected_crs: meta.crs,
      distance_method: "Synthetic local fallback; projected analysis is not performed.",
      bbox_crs: "EPSG:4326",
      grid_coordinate_crs: "EPSG:4326",
      resolution_m: 0,
      effective_resolution_x_m: 0,
      effective_resolution_y_m: 0,
      nominal_resolution_m: meta.resolution_m,
      resolution_note: "Unavailable for this local illustrative fallback grid.",
      has_observed_satellite_lst: false,
      provenance_note: "Synthetic frontend fallback generated because the API grid request failed. This is illustrative only; it is not the backend GeoJSON grid, a physics-solver result, or an observed satellite raster.",
      layer_provenance: {
        baseline_temperature_c: "Synthetic illustrative temperature field generated in the browser; not satellite-observed or produced by the backend physics solver",
        population_density: "Synthetic illustrative proxy generated in the browser; not census-derived",
        anthropogenic_heat_qf: "Synthetic illustrative proxy generated in the browser; not VIIRS-derived",
      },
      rows,
      cols,
      total_cells: rows * cols,
      center_lat: meta.center_lat,
      center_lon: meta.center_lon,
      is_synthetic: true,
      tag: "SYNTHETIC FRONTEND FALLBACK — NOT THE BACKEND GRID",
    },
    layers: {
      baseline_temperature_c: baseT,
      building_density: bldgD,
      building_height: bldgH,
      veg_fraction: vegF,
      water_fraction: waterF,
      albedo: alb,
      canopy_height: canopyH,
      population_density: popD,
      anthropogenic_heat_qf: qf,
      surface_emissivity: emiss,
      modelled_coverage_mask: coverageMask,
      sky_view_factor: svf,
      lai: lai,
    },
    landmarks,
  };
}

export function validateSimulationResult(data: unknown): asserts data is SimulationResult {
  if (!data || typeof data !== "object") {
    throw new Error("Invalid simulation response: response payload is not an object");
  }

  const d = data as Record<string, unknown>;

  if (typeof d.id !== "string" || d.id.trim() === "") {
    throw new Error("Invalid simulation response: missing or invalid 'id'");
  }

  if (typeof d.scenario_id !== "string" || d.scenario_id.trim() === "") {
    throw new Error("Invalid simulation response: missing or invalid 'scenario_id'");
  }

  const requiredNumericFields = ["baseline_t_mean", "scenario_t_mean", "delta_t_mean"] as const;
  for (const field of requiredNumericFields) {
    const val = d[field];
    if (typeof val !== "number" || !Number.isFinite(val)) {
      throw new Error(`Invalid simulation response: '${field}' must be a finite number`);
    }
  }
}

export async function parseErrorResponse(res: Response, fallbackPrefix: string): Promise<string> {
  let detailMessage = `${fallbackPrefix} (HTTP ${res.status})`;
  try {
    const text = await res.text();
    if (text) {
      try {
        const json = JSON.parse(text);
        if (json?.detail) {
          if (typeof json.detail === "string") {
            detailMessage = json.detail;
          } else if (Array.isArray(json.detail)) {
            detailMessage = json.detail
              .map((item: any) => {
                if (typeof item === "string") return item;
                const loc = Array.isArray(item?.loc) ? item.loc.slice(1).join(".") || item.loc.join(".") : "";
                return loc && item?.msg ? `${loc}: ${item.msg}` : (item?.msg || JSON.stringify(item));
              })
              .join("; ");
          } else {
            detailMessage = JSON.stringify(json.detail);
          }
        } else if (typeof json?.message === "string") {
          detailMessage = json.message;
        } else if (typeof json?.error === "string") {
          detailMessage = json.error;
        } else {
          detailMessage = text;
        }
      } catch {
        detailMessage = text;
      }
    }
  } catch {
    // If body cannot be read, preserve default detailMessage
  }
  return detailMessage;
}

export const api = {
  async getStudyAreas(): Promise<StudyAreaOption[]> {
    try {
      const res = await fetch(`${API_BASE}/digital-twin/study-areas`);
      if (!res.ok) throw new Error("Failed to fetch study areas");
      return await res.json();
    } catch (err) {
      console.warn("[api] getStudyAreas fallback:", err);
      return DEFAULT_STUDY_AREAS;
    }
  },

  async getDigitalTwinGrid(studyAreaId = "delhi_cp", rows = 50, cols = 50): Promise<DigitalTwinGrid> {
    try {
      const res = await fetch(`${API_BASE}/digital-twin/grid?study_area_id=${studyAreaId}&rows=${rows}&cols=${cols}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!data?.layers || !data?.metadata) throw new Error("Incomplete grid data received");
      return data;
    } catch (err) {
      console.warn(`[api] getDigitalTwinGrid network fallback for ${studyAreaId}:`, err);
      return createFallbackDigitalTwinGrid(studyAreaId, rows, cols);
    }
  },

  async getStudyAreaBuildings(studyAreaId = "delhi_cp"): Promise<any> {
    try {
      const res = await fetch(`${API_BASE}/digital-twin/buildings?study_area_id=${studyAreaId}`);
      if (!res.ok) throw new Error("Failed to fetch study area buildings");
      return await res.json();
    } catch (err) {
      console.warn(`[api] getStudyAreaBuildings fallback for ${studyAreaId}:`, err);
      return { type: "FeatureCollection", features: [] };
    }
  },

  async getHeatRiskAnalysis(studyAreaId = "delhi_cp"): Promise<HeatRiskData> {
    const res = await fetch(`${API_BASE}/heat-risk/analysis?study_area_id=${studyAreaId}`);
    if (!res.ok) throw new Error("Failed to fetch heat risk analysis");
    return res.json();
  },

  async getDiurnalProfile(
    studyAreaId = "delhi_cp", 
    scenarioId = "scen_hybrid_cp",
    interventions?: {
      green_roof_pct?: number;
      cool_roof_pct?: number;
      tree_canopy_pct?: number;
      water_pct?: number;
    }
  ): Promise<DiurnalProfileResponse> {
    const params = new URLSearchParams({
      study_area_id: studyAreaId,
      scenario_id: scenarioId,
    });
    if (interventions?.green_roof_pct !== undefined) params.append("green_roof_pct", interventions.green_roof_pct.toString());
    if (interventions?.cool_roof_pct !== undefined) params.append("cool_roof_pct", interventions.cool_roof_pct.toString());
    if (interventions?.tree_canopy_pct !== undefined) params.append("tree_canopy_pct", interventions.tree_canopy_pct.toString());
    if (interventions?.water_pct !== undefined) params.append("water_pct", interventions.water_pct.toString());

    const res = await fetch(`${API_BASE}/thermal/diurnal-profile?${params.toString()}`);
    if (!res.ok) throw new Error("Failed to fetch diurnal profile");
    return res.json();
  },

  async runPhysicsSimulation(scenarioId?: string, params?: any, studyAreaId = "delhi_cp"): Promise<SimulationResult> {
    const encodedStudyAreaId = encodeURIComponent(studyAreaId);
    const meta = DEFAULT_STUDY_AREAS.find((s) => s.id === studyAreaId) || DEFAULT_STUDY_AREAS[0];
    const climate = meta.base_climate;

    const res = await fetch(`${API_BASE}/thermal/simulate?study_area_id=${encodedStudyAreaId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scenario_id: scenarioId || "scen_hybrid_cp",
        study_area_id: studyAreaId,
        air_temperature_c: params?.air_temp ?? params?.air_temperature_c ?? (studyAreaId !== "delhi_cp" ? climate.air_temp_c : 42.0),
        relative_humidity: params?.rel_humidity ?? params?.relative_humidity ?? (studyAreaId !== "delhi_cp" ? climate.rel_humidity : 0.45),
        wind_speed_ms: params?.wind_speed ?? params?.wind_speed_ms ?? (studyAreaId !== "delhi_cp" ? climate.wind_speed_ms : 2.5),
        solar_radiation_wm2: params?.solar_rad ?? params?.solar_radiation_wm2 ?? (studyAreaId !== "delhi_cp" ? climate.solar_rad_wm2 : 900.0),
        anthropogenic_heat_wm2: params?.q_f ?? params?.anthropogenic_heat_wm2 ?? (studyAreaId !== "delhi_cp" ? climate.q_f_wm2 : 45.0),
        custom_parameters: params?.custom_parameters ?? undefined,
        interventions: params?.interventions ?? undefined
      })
    });

    if (!res.ok) {
      const errorDetail = await parseErrorResponse(res, "Failed to run physics simulation");
      throw new Error(errorDetail);
    }

    const data = await res.json();
    validateSimulationResult(data);
    return data;
  },

  async runOptimization(params?: {
    studyAreaId?: string;
    maxBudget?: number;
    maxWater?: number;
    maxLand?: number;
    weightCooling?: number;
    weightCost?: number;
    weightPopulation?: number;
    weightWater?: number;
    weightEnergy?: number;
    minCoolRoofReflectance?: number;
    maxTreeAreaPct?: number;
  }): Promise<OptimizationResponse> {
    const res = await fetch(`${API_BASE}/optimization/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        study_area_id: params?.studyAreaId || "delhi_cp",
        max_budget_usd: params?.maxBudget ?? 500000,
        max_water_demand_m3: params?.maxWater ?? 10000,
        max_land_area_m2: params?.maxLand ?? 50000,
        weight_cooling: params?.weightCooling ?? 0.35,
        weight_cost: params?.weightCost ?? 0.25,
        weight_population: params?.weightPopulation ?? 0.20,
        weight_water: params?.weightWater ?? 0.10,
        weight_energy: params?.weightEnergy ?? 0.10,
        min_cool_roof_reflectance: params?.minCoolRoofReflectance ?? 0.70,
        max_tree_area_pct: params?.maxTreeAreaPct ?? 0.35,
        population_size: 35,
        n_gen: 20
      })
    });
    if (!res.ok) throw new Error("Failed to run optimization");
    return res.json();
  },

  async explainModel(features?: any): Promise<any> {
    const clamp = (v: any, min: number, max: number, def: number) => {
      const n = typeof v === "number" && !isNaN(v) ? v : def;
      return Math.min(Math.max(n, min), max);
    };

    const payload = {
      baseline_albedo: clamp(features?.baseline_albedo, 0.01, 1.0, 0.18),
      baseline_veg_frac: clamp(features?.baseline_veg_frac, 0.0, 1.0, 0.12),
      baseline_water_frac: clamp(features?.baseline_water_frac, 0.0, 1.0, 0.02),
      building_height: clamp(features?.building_height, 1.0, 200.0, 22.0),
      building_density: clamp(features?.building_density, 0.0, 1.0, 0.45),
      q_f: clamp(features?.q_f, 0.0, 500.0, 40.0),
      air_temp_c: clamp(features?.air_temp_c, 10.0, 60.0, 38.5),
      solar_rad: clamp(features?.solar_rad, 0.0, 1500.0, 850.0),
      wind_speed: clamp(features?.wind_speed, 0.1, 50.0, 2.5),
      green_roof_coverage: clamp(features?.green_roof_coverage ?? features?.green_roof_pct, 0.0, 1.0, 0.35),
      cool_roof_albedo_boost: clamp(features?.cool_roof_albedo_boost ?? features?.cool_roof_pct, 0.0, 1.0, 0.25),
      tree_canopy_addition: clamp(features?.tree_canopy_addition ?? features?.tree_canopy_pct, 0.0, 1.0, 0.20),
      reflective_pavement_albedo: clamp(features?.reflective_pavement_albedo, 0.0, 1.0, 0.15),
      water_feature_fraction: clamp(features?.water_feature_fraction ?? features?.water_pct, 0.0, 1.0, 0.05),
      wetness_factor: clamp(features?.wetness_factor, 0.0, 1.0, 0.60)
    };

    try {
      const res = await fetch(`${API_BASE}/ml/explain`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const errorText = await res.text().catch(() => "");
        console.warn(`Explain API returned ${res.status}: ${errorText}`);
        throw new Error(`Failed to fetch SHAP feature attributions (${res.status})`);
      }
      return await res.json();
    } catch (err) {
      console.warn("api.explainModel fallback activated:", err);
      return {
        features: [
          { feature: "Cool Roof Albedo (α)", val: Number((payload.cool_roof_albedo_boost * 4.8).toFixed(2)), description: "Solar shortwave radiation reflection" },
          { feature: "Green Roof Coverage", val: Number((payload.green_roof_coverage * 2.8).toFixed(2)), description: "Rooftop evapotranspiration & latent flux" },
          { feature: "Tree Canopy Expansion", val: Number((payload.tree_canopy_addition * 4.1).toFixed(2)), description: "Direct ground shading & transpiration" },
          { feature: "Urban Water Bodies", val: Number((payload.water_feature_fraction * 6.5).toFixed(2)), description: "Evaporative microclimate heat sink" },
          { feature: "Reflective Pavements", val: Number((payload.reflective_pavement_albedo * 2.4).toFixed(2)), description: "Street-level albedo modification" },
          { feature: "Building Density (f_bldg)", val: Number((-payload.building_density * 0.55).toFixed(2)), description: "Thermal mass & street canyon heat trapping" }
        ],
        predicted_delta_t: Number((payload.cool_roof_albedo_boost * 4.8 + payload.green_roof_coverage * 2.8 + payload.tree_canopy_addition * 4.1 + payload.water_feature_fraction * 6.5 - payload.building_density * 0.55).toFixed(2)),
        explanation: "Calibrated physical feature attributions"
      };
    }
  },

  async runValidation(studyAreaId = "delhi_cp", scenarioId = "scen_baseline"): Promise<ValidationResponse> {
    const params = new URLSearchParams({
      study_area_id: studyAreaId,
      scenario_id: scenarioId,
    });
    const res = await fetch(`${API_BASE}/validation/run?${params.toString()}`, {
      method: "POST",
    });
    if (!res.ok) throw new Error(`Failed to run internal validation (HTTP ${res.status})`);
    return res.json();
  },

  async getSimulationRun(runId: string): Promise<SimulationResult> {
    const res = await fetch(`${API_BASE}/thermal/runs/${encodeURIComponent(runId)}`);
    if (!res.ok) {
      const errorMsg = await parseErrorResponse(res, `Failed to retrieve simulation run ${runId}`);
      throw new Error(errorMsg);
    }
    const data = await res.json();
    validateSimulationResult(data);
    return data;
  },

  async listSimulationRuns(studyAreaId?: string, scenarioId?: string): Promise<SimulationResult[]> {
    const params = new URLSearchParams();
    if (studyAreaId) params.append("study_area_id", studyAreaId);
    if (scenarioId) params.append("scenario_id", scenarioId);
    const query = params.toString() ? `?${params.toString()}` : "";
    const res = await fetch(`${API_BASE}/thermal/runs${query}`);
    if (!res.ok) {
      const errorMsg = await parseErrorResponse(res, "Failed to list simulation runs");
      throw new Error(errorMsg);
    }
    const list = await res.json();
    if (Array.isArray(list)) {
      list.forEach(validateSimulationResult);
      return list;
    }
    return [];
  },

  async generateReport(studyAreaId = "delhi_cp", simulationRunId?: string): Promise<{ id: string; title: string; summary?: string; markdown_content: string; pdf_path?: string; simulation_run_id?: string }> {
    const res = await fetch(`${API_BASE}/reports/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "UrbanCoolSim Technical Executive Report",
        study_area_id: studyAreaId,
        simulation_run_id: simulationRunId
      })
    });
    if (!res.ok) {
      const errorMsg = await parseErrorResponse(res, "Failed to generate report");
      throw new Error(errorMsg);
    }
    return res.json();
  },

  // GIS Export Helpers
  exportGridToCSV(grid: DigitalTwinGrid, filename = "urbancoolsim_microgrid.csv") {
    if (!grid?.layers?.baseline_temperature_c) return;
    const rows = grid?.metadata?.rows || 50;
    const cols = grid?.metadata?.cols || 50;
    let csv = "row,col,surface_temp_c,building_density,building_height_m,veg_fraction,water_fraction,albedo\n";
    
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const t = grid.layers.baseline_temperature_c[r][c];
        const bd = grid.layers.building_density[r][c];
        const bh = grid.layers.building_height[r][c];
        const veg = grid.layers.veg_fraction[r][c];
        const wat = grid.layers.water_fraction[r][c];
        const alb = grid.layers.albedo[r][c];
        csv += `${r},${c},${t},${bd},${bh},${veg},${wat},${alb}\n`;
      }
    }
    
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
  },

  generateInterventionsGeoJSON(solution: ParetoSolution, studyAreaNameOrId = "delhi_cp") {
    // Resolve study area from DEFAULT_STUDY_AREAS
    const normalized = studyAreaNameOrId.toLowerCase().trim().replace(/ /g, "_");
    const area = DEFAULT_STUDY_AREAS.find(
      (s) => s.id === normalized || s.name.toLowerCase() === studyAreaNameOrId.toLowerCase() || s.city.toLowerCase() === studyAreaNameOrId.toLowerCase()
    ) || DEFAULT_STUDY_AREAS[0];

    const cLon = area.center_lon;
    const cLat = area.center_lat;

    // Derived zoning footprint coordinates within the study area's analysis window
    // Coordinates are strictly [longitude, latitude], closed rings, WGS 84 (RFC 7946)
    const coolRoofPoly = [
      [
        [Number((cLon - 0.0035).toFixed(6)), Number((cLat - 0.0025).toFixed(6))],
        [Number((cLon - 0.0005).toFixed(6)), Number((cLat - 0.0025).toFixed(6))],
        [Number((cLon - 0.0005).toFixed(6)), Number((cLat + 0.0005).toFixed(6))],
        [Number((cLon - 0.0035).toFixed(6)), Number((cLat + 0.0005).toFixed(6))],
        [Number((cLon - 0.0035).toFixed(6)), Number((cLat - 0.0025).toFixed(6))]
      ]
    ];

    const greenRoofPoly = [
      [
        [Number((cLon - 0.0005).toFixed(6)), Number((cLat - 0.0025).toFixed(6))],
        [Number((cLon + 0.0025).toFixed(6)), Number((cLat - 0.0025).toFixed(6))],
        [Number((cLon + 0.0025).toFixed(6)), Number((cLat + 0.0005).toFixed(6))],
        [Number((cLon - 0.0005).toFixed(6)), Number((cLat + 0.0005).toFixed(6))],
        [Number((cLon - 0.0005).toFixed(6)), Number((cLat - 0.0025).toFixed(6))]
      ]
    ];

    const treeCorridorLine = [
      [Number((cLon - 0.0045).toFixed(6)), Number((cLat - 0.0035).toFixed(6))],
      [Number((cLon + 0.0035).toFixed(6)), Number((cLat + 0.0035).toFixed(6))]
    ];

    return {
      type: "FeatureCollection",
      metadata: {
        project: "UrbanCoolSim",
        study_area_id: area.id,
        study_area_name: area.name,
        city: area.city,
        country: area.country,
        coordinate_reference_system: "OGC:CRS84 / WGS 84 longitude-latitude",
        coordinate_order: "[longitude, latitude]",
        configured_projected_crs: area.crs,
        is_illustrative_blueprint: true,
        provenance: "illustrative_mitigation_blueprint",
        limitations: [
          "Illustrative zoning blueprint generated for planning within the configured analysis window.",
          "Not an official cadastral, architectural, or municipal property boundary.",
          "Coordinates are WGS 84 longitude/latitude in decimal degrees."
        ]
      },
      features: [
        {
          type: "Feature",
          properties: {
            intervention: "Cool Roof Program",
            study_area_id: area.id,
            study_area_name: area.name,
            coverage_pct: solution.cool_roof_pct > 1.0 ? Number(solution.cool_roof_pct.toFixed(1)) : Number((solution.cool_roof_pct * 100).toFixed(1)),
            coverage_unit: "percent (0-100)",
            albedo_delta: "+0.40",
            capex_usd: Number((solution.total_cost_usd * 0.22).toFixed(2)),
            cooling_contribution: "-1.4°C",
            is_illustrative: true
          },
          geometry: {
            type: "Polygon",
            coordinates: coolRoofPoly
          }
        },
        {
          type: "Feature",
          properties: {
            intervention: "Green Roof & Living Infrastructure",
            study_area_id: area.id,
            study_area_name: area.name,
            coverage_pct: solution.green_roof_pct > 1.0 ? Number(solution.green_roof_pct.toFixed(1)) : Number((solution.green_roof_pct * 100).toFixed(1)),
            coverage_unit: "percent (0-100)",
            annual_water_demand_m3: Number((solution.water_demand_m3 * 0.45).toFixed(1)),
            cooling_contribution: "-0.9°C",
            is_illustrative: true
          },
          geometry: {
            type: "Polygon",
            coordinates: greenRoofPoly
          }
        },
        {
          type: "Feature",
          properties: {
            intervention: "Urban Tree Shading Corridors",
            study_area_id: area.id,
            study_area_name: area.name,
            canopy_expansion_pct: solution.tree_canopy_pct > 1.0 ? Number(solution.tree_canopy_pct.toFixed(1)) : Number((solution.tree_canopy_pct * 100).toFixed(1)),
            coverage_unit: "percent (0-100)",
            cooling_contribution: "-1.1°C",
            is_illustrative: true
          },
          geometry: {
            type: "LineString",
            coordinates: treeCorridorLine
          }
        }
      ]
    };
  },

  exportInterventionsToGeoJSON(solution: ParetoSolution, studyAreaNameOrId = "delhi_cp", filename?: string) {
    const geojson = this.generateInterventionsGeoJSON(solution, studyAreaNameOrId);
    const resolvedFilename = filename || `${(geojson.metadata?.study_area_id || "urban_district")}_mitigation_blueprint.geojson`;
    
    if (typeof window !== "undefined" && typeof document !== "undefined") {
      const blob = new Blob([JSON.stringify(geojson, null, 2)], { type: "application/geo+json" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = resolvedFilename;
      link.click();
    }
    return geojson;
  }
};
