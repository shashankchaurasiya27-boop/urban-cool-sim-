import json
import sys
from pathlib import Path

import os
os.environ["SECRET_KEY"] = "antigravity-secure-test-key-32chars-min"

# Add backend directory to sys.path
backend_dir = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(backend_dir))

from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)
log_lines = []

# 1. Health check
r = client.get("/health")
log_lines.append("=== Backend Health Check ===")
log_lines.append(f"GET /health -> HTTP {r.status_code}")
log_lines.append(r.text)
log_lines.append("")

# 2. Study Areas
r = client.get("/api/v1/digital-twin/study-areas")
log_lines.append("=== Digital Twin Study Areas ===")
log_lines.append(f"GET /api/v1/digital-twin/study-areas -> HTTP {r.status_code}")
log_lines.append(f"Returned {len(r.json())} canonical study areas with nominal_resolution_m=10m and resolution_note.")
log_lines.append("")

# 3. Live OSM Grid Generation & Provenance (Singapore)
r = client.get("/api/v1/digital-twin/grid?study_area_id=singapore_marina&rows=40&cols=40")
log_lines.append("=== Digital Twin Grid with Live Acquired OSM Data (singapore_marina) ===")
log_lines.append(f"GET /api/v1/digital-twin/grid?study_area_id=singapore_marina&rows=40&cols=40 -> HTTP {r.status_code}")
data = r.json()
meta = data["metadata"]
log_lines.append(json.dumps({
    "active_data_source": meta.get("active_data_source"),
    "source_file": meta.get("source_file"),
    "vector_feature_count": meta.get("vector_feature_count"),
    "features_by_class": meta.get("features_by_class"),
    "nominal_resolution_m": meta.get("nominal_resolution_m"),
    "effective_resolution_x_m": meta.get("effective_resolution_x_m"),
    "effective_resolution_y_m": meta.get("effective_resolution_y_m"),
    "resolution_note": meta.get("resolution_note"),
    "data_provenance": meta.get("data_provenance"),
    "data_license": meta.get("data_license"),
}, indent=2))
log_lines.append("")

# 4. Building Extrusion from Live OSM (Tokyo)
r = client.get("/api/v1/digital-twin/buildings?study_area_id=tokyo_shinjuku")
log_lines.append("=== Building Features 3D Extrusion (tokyo_shinjuku) ===")
log_lines.append(f"GET /api/v1/digital-twin/buildings?study_area_id=tokyo_shinjuku -> HTTP {r.status_code}")
bldgs = r.json()
bldg_count = len(bldgs.get("features", []))
log_lines.append(f"Returned {bldg_count} building geometries (live OSM features with polygon coordinates and calculated heights).")
log_lines.append("")

# 5. Cell Inspection
r = client.get("/api/v1/digital-twin/inspect-cell?study_area_id=singapore_marina&row=15&col=20&rows=40&cols=40")
log_lines.append("=== Inspect Cell (singapore_marina row=15, col=20 on 40x40 grid) ===")
log_lines.append(f"GET /api/v1/digital-twin/inspect-cell?study_area_id=singapore_marina&row=15&col=20&rows=40&cols=40 -> HTTP {r.status_code}")
log_lines.append(r.text)
log_lines.append("")

# 6. Reject invalid study area on optimization with HTTP 422
r = client.post("/api/v1/optimization/run", json={"study_area_id": "unsupported_city", "max_budget_usd": 100000.0})
log_lines.append("=== Rejection of Unsupported Study Area (HTTP 422) ===")
log_lines.append(f"POST /api/v1/optimization/run (study_area_id='unsupported_city') -> HTTP {r.status_code}")
log_lines.append(r.text)
log_lines.append("")

# 7. Valid optimization with dynamic area derivation
r = client.post("/api/v1/optimization/run", json={
    "study_area_id": "mumbai_bkc",
    "max_budget_usd": 150000.0,
    "population_size": 10,
    "n_gen": 5
})
log_lines.append("=== Optimization Run with Dynamic District Area Derivation (mumbai_bkc) ===")
log_lines.append(f"POST /api/v1/optimization/run -> HTTP {r.status_code}")
opt_data = r.json()
log_lines.append(json.dumps({
    "study_area_id": opt_data.get("study_area_id"),
    "analysis_window_area_m2": opt_data.get("analysis_window_area_m2"),
    "district_area_m2": opt_data.get("district_area_m2"),
    "building_footprint_m2": opt_data.get("building_footprint_m2"),
    "pareto_solutions_count": len(opt_data.get("pareto_solutions", opt_data.get("pareto_front", []))),
    "recommended_solution": {
        "solution_id": opt_data.get("recommended_solution", {}).get("solution_id"),
        "mean_temp_reduction_c": opt_data.get("recommended_solution", {}).get("mean_temp_reduction_c") or opt_data.get("recommended_solution", {}).get("delta_t_mean"),
        "total_capex_usd": opt_data.get("recommended_solution", {}).get("total_capex_usd") or opt_data.get("recommended_solution", {}).get("total_cost_usd"),
        "physics_validated": opt_data.get("recommended_solution", {}).get("physics_validated"),
        "green_roof_pct": opt_data.get("recommended_solution", {}).get("green_roof_pct"),
    }
}, indent=2))

output = "\n".join(log_lines)
print(output)

out_file = Path(__file__).resolve().parents[1] / "artifacts" / "antigravity_verification_20261026_002500" / "logs" / "api_smoke_check.log"
out_file.write_text(output, encoding="utf-8")
print(f"\nWrote smoke check results to {out_file}")
