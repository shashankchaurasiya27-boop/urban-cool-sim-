import numpy as np
from typing import Dict, Any, Optional, List
from fastapi import APIRouter, Query, Depends
from pydantic import BaseModel

from app.auth.security import get_current_user_optional
from app.models.db_models import User
from app.schemas.schemas import StudyAreaId
from app.api.digital_twin_router import generate_study_area_grid, STUDY_AREAS_METADATA

router = APIRouter(prefix="/heat-risk", tags=["Heat Risk & Vulnerability"])


class HeatRiskSummary(BaseModel):
    study_area_id: StudyAreaId
    location: str
    heat_alert_tier: str
    heat_alert_message: str
    mean_surface_temp_c: float
    peak_surface_temp_c: float
    total_population_estimate: int
    population_high_exposure: int
    outdoor_workers_at_risk: int
    vulnerable_area_pct: float
    critical_zones: List[Dict[str, Any]]
    ward_risk_ranking: List[Dict[str, Any]]
    hvi_distribution: Dict[str, int]
    demographic_data_source: str = "synthetic / illustrative estimates (not census-enumerated)"


@router.get("/analysis", response_model=HeatRiskSummary)
def get_heat_risk_analysis(
    study_area_id: StudyAreaId = Query(default="delhi_cp"),
    current_user: Optional[User] = Depends(get_current_user_optional)
):
    """
    Computes comprehensive Heat-Risk & Demographic Vulnerability analysis
    conforming to the 4-zone classification and Heat-Health Action Plan standards.
    """
    grid = generate_study_area_grid(study_area_id=study_area_id, rows=50, cols=50)
    layers = grid["layers"]
    meta = grid["metadata"]
    
    temps = np.array(layers["baseline_temperature_c"])
    densities = np.array(layers["building_density"])
    vegs = np.array(layers["veg_fraction"])
    waters = np.array(layers["water_fraction"])
    
    # 1. Calculate Cell-level Heat Vulnerability Index (HVI) 0.0 - 10.0
    t_norm = np.clip((temps - 30.0) / 18.0, 0.0, 1.0)
    hvi_grid = (0.50 * t_norm + 0.30 * densities + 0.20 * (1.0 - vegs)) * 10.0
    
    # Population simulation based on study area
    pop_multipliers = {
        "delhi_cp": 45000,
        "mumbai_bkc": 65000,
        "singapore_marina": 38000,
        "phoenix_downtown": 22000,
        "tokyo_shinjuku": 85000
    }
    total_pop = pop_multipliers.get(study_area_id, 40000)
    
    # High exposure count (>41.5 C)
    high_heat_mask = temps >= 41.5
    high_heat_fraction = float(np.mean(high_heat_mask))
    pop_high_exposure = int(total_pop * high_heat_fraction)
    outdoor_workers = int(pop_high_exposure * 0.28)
    
    mean_t = float(np.mean(temps))
    peak_t = float(np.max(temps))
    
    # Determine alert tier
    if peak_t >= 47.0 or mean_t >= 43.0:
        alert_tier = "RED ALERT (Severe Heatwave)"
        alert_msg = "Critical thermal stress. Immediate mandatory cool shelters and hydration stations required."
    elif peak_t >= 44.0 or mean_t >= 40.0:
        alert_tier = "ORANGE ALERT (Heatwave Warning)"
        alert_msg = "High thermal risk for outdoor workers and vulnerable populations. Reschedule intense outdoor activities."
    elif peak_t >= 40.0 or mean_t >= 36.0:
        alert_tier = "YELLOW ALERT (Heat Advisory)"
        alert_msg = "Moderate heat stress across high-density commercial corridors. Public awareness advised."
    else:
        alert_tier = "GREEN (Normal Range)"
        alert_msg = "Thermal conditions within baseline comfortable boundaries."

    # 4 Canonical Zones (Page 2 & 6 in PDF)
    zone_1_mask = vegs >= 0.40
    zone_2_mask = waters >= 0.20
    zone_3_mask = (np.array(layers["albedo"]) >= 0.22) & ~zone_1_mask & ~zone_2_mask
    zone_4_mask = (densities >= 0.50) & (vegs < 0.15)
    
    def get_zone_stats(mask, name, typ, benefit, constraint, cost_m2):
        count = int(np.sum(mask))
        pct = round((count / 2500.0) * 100, 1)
        z_temps = temps[mask] if count > 0 else np.array([mean_t])
        return {
            "zone_id": typ,
            "name": name,
            "area_pct": pct,
            "cell_count": count,
            "mean_temp_c": round(float(np.mean(z_temps)), 1),
            "peak_temp_c": round(float(np.max(z_temps)), 1),
            "benefit": benefit,
            "constraint": constraint,
            "unit_cost_usd_m2": cost_m2
        }

    critical_zones = [
        get_zone_stats(zone_1_mask, "Zone 1 · Green Infrastructure", "green", "Cooler microclimate under canopy & transpiration", "Limited space availability", 35.0),
        get_zone_stats(zone_2_mask, "Zone 2 · Water Bodies & Retention", "water", "Strong localized evaporative cooling sink", "High irrigation & maintenance requirement", 120.0),
        get_zone_stats(zone_3_mask, "Zone 3 · High-Albedo Surfaces", "albedo", "Reduces shortwave heat absorption", "Lower ground-level pedestrian shading benefit", 18.0),
        get_zone_stats(zone_4_mask, "Zone 4 · Dense Built-Up Area", "dense", "Highest heat exposure & heat accumulation", "Complex retrofit constraints & structural load", 75.0)
    ]
    
    # 5 Sub-Wards Ranking
    ward_names = {
        "delhi_cp": ["Inner Radial Core", "Middle Commercial Ring", "Outer Circus Corridor", "Radial Arteries (Janpath)", "Barakhamba Commercial Wing"],
        "mumbai_bkc": ["G-Block Financial Core", "Mithi River Waterfront", "Bandra East Arterial", "BKC Central Plaza", "Kalanagar Junction"],
        "singapore_marina": ["Marina Bay Promenade", "Downtown Core High-Rise", "Gardens Connector", "Raffles Financial Corridor", "Marina South Hub"],
        "phoenix_downtown": ["Central Avenue Corridor", "Government District", "Roosevelt Row", "Warehouse District", "Convention Core"],
        "tokyo_shinjuku": ["Nishi-Shinjuku Skyscraper Strip", "Kabukicho Dense Core", "Shinjuku Station Plaza", "South Exit Promenade", "Gyoen Buffer Zone"]
    }
    wards = ward_names.get(study_area_id, ward_names["delhi_cp"])
    
    ward_ranking = []
    for i, w_name in enumerate(wards):
        w_mean_t = round(mean_t + (i * 0.8) - 1.6, 1)
        w_pop = int(total_pop * (0.28 - i * 0.03))
        w_hvi = round(float(np.mean(hvi_grid)) + (i * 0.4) - 0.8, 1)
        ward_ranking.append({
            "rank": i + 1,
            "ward_name": w_name,
            "mean_temp_c": w_mean_t,
            "population_exposed": w_pop,
            "hvi_score": min(10.0, max(1.0, w_hvi)),
            "risk_tier": "CRITICAL" if w_mean_t >= 43.0 else ("HIGH" if w_mean_t >= 39.5 else "MODERATE"),
            "primary_driver": "Low Albedo Roofs" if i % 2 == 0 else "Asphalt Solar Trapping",
            "recommended_action": "Cool Roof Retrofits (Δα +0.40)" if i % 2 == 0 else "Tree Canopy Corridor Shading (+30%)"
        })

    # HVI distribution buckets
    hvi_dist = {
        "low": int(np.sum(hvi_grid < 4.0)),
        "medium": int(np.sum((hvi_grid >= 4.0) & (hvi_grid < 7.0))),
        "high": int(np.sum(hvi_grid >= 7.0))
    }

    return HeatRiskSummary(
        study_area_id=study_area_id,
        location=meta["location"],
        heat_alert_tier=alert_tier,
        heat_alert_message=alert_msg,
        mean_surface_temp_c=round(mean_t, 1),
        peak_surface_temp_c=round(peak_t, 1),
        total_population_estimate=total_pop,
        population_high_exposure=pop_high_exposure,
        outdoor_workers_at_risk=outdoor_workers,
        vulnerable_area_pct=round(high_heat_fraction * 100, 1),
        critical_zones=critical_zones,
        ward_risk_ranking=ward_ranking,
        hvi_distribution=hvi_dist,
        demographic_data_source="synthetic / illustrative estimates (not census-enumerated)"
    )
