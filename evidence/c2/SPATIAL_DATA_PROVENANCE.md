# UrbanCoolSim: Consolidated Geospatial Data Provenance Ledger

**Document ID**: `UCS-PROV-20261026-SPATIAL`  
**Status**: VERIFIED & AUDITED  
**Date**: 2026-10-26  
**Scope**: Checkpoint C2 Closure — Physical Geospatial Datasets & Active Provenance  

---

## 1. Overview and Architecture

UrbanCoolSim bridges live physical geospatial features with numerical surface thermodynamics. To ensure 100% scientific integrity, reproducibility, and legal compliance, all geospatial features ingested by the platform are catalogued with explicit provenance, licensing, timestamps, geometry counts, and pipeline transformation steps.

```
+-------------------------------------------------------------------------------+
|                        OpenStreetMap Overpass API                             |
|              (ODbL 1.0 License, (c) OpenStreetMap contributors)               |
+-------------------------------------------------------------------------------+
                                     |
                     [Overpass Turbo Query / osmnx]
                                     |
                                     v
+-------------------------------------------------------------------------------+
| RAW SPATIAL SNAPSHOTS                                                         |
| dataset/raw/vector/osm/{study_area_id}_features.geojson                       |
| Full geographic extent covering the expanded study area district              |
+-------------------------------------------------------------------------------+
                                     |
                     [analysis window spatial clipping]
                                     |
                                     v
+-------------------------------------------------------------------------------+
| PROCESSED CLIPPED VECTORS                                                     |
| dataset/processed/spatial_vectors/{study_area_id}_features_clipped.geojson    |
| Strictly clipped to analysis bounding box in EPSG:4326 (WGS 84)               |
+-------------------------------------------------------------------------------+
                                     |
             +-----------------------+-----------------------+
             |                                               |
             v                                               v
+-----------------------------+               +-----------------------------+
| 3D VECTOR EXTRUSION         |               | VECTOR MICROGRID RASTERIZER |
| deck.gl Building Layer      |               | geo_digital_twin.py         |
| Direct Polygon Rendering    |               | Ray-casting & Buffer Masks  |
+-----------------------------+               +-----------------------------+
                                                             |
                                                             v
                                              +-----------------------------+
                                              | PHYSICAL ENERGY BALANCE     |
                                              | EnergyBalanceSolver (H-5)   |
                                              | Surface Temp & Fluxes       |
                                              +-----------------------------+
```

---

## 2. Study Area Geospatial Inventory

All five canonical study areas use real OpenStreetMap physical vectors retrieved via Overpass Turbo queries, clipped to the configured model analysis window:

| Study Area ID | Canonical Location | Bounding Box (W, S, E, N) | Total Acquired Features | Building Count | Transport (Road) Count | Green Space Count | Water Features | Landuse / Context | Source License & Attribution |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `mumbai_bkc` | Bandra Kurla Complex, Mumbai, India | `[72.8600, 19.0600, 72.8760, 19.0750]` | **941** | 275 | 574 | 19 | 5 | 68 | ODbL 1.0 (© OpenStreetMap contributors) |
| `delhi_cp` | Connaught Place, New Delhi, India | `[77.2100, 28.6250, 77.2250, 28.6380]` | **1,555** | 418 | 1,067 | 9 | 0 | 61 | ODbL 1.0 (© OpenStreetMap contributors) |
| `singapore_marina`| Marina Bay, Singapore | `[103.8500, 1.2750, 103.8650, 1.2900]` | **2,166** | 253 | 1,784 | 96 | 18 | 15 | ODbL 1.0 (© OpenStreetMap contributors) |
| `phoenix_downtown`| Downtown Core, Phoenix, AZ, USA | `[-112.0800, 33.4450, -112.0650, 33.4600]` | **2,885** | 401 | 2,316 | 81 | 11 | 76 | ODbL 1.0 (© OpenStreetMap contributors) |
| `tokyo_shinjuku` | Shinjuku Canyon, Tokyo, Japan | `[139.6900, 35.6850, 139.7050, 35.7000]` | **6,333** | 2,438 | 3,603 | 174 | 13 | 104 | ODbL 1.0 (© OpenStreetMap contributors) |

**Total Ingested Physical Features**: **13,880** real vector entities across the 5 global urban centers.

---

## 3. Physical Feature Normalization & Schema Mapping

The raw Overpass vector features contain heterogeneous OSM tags (`building`, `building:levels`, `height`, `highway`, `leisure`, `natural`, `waterway`, `amenity`). The ingestion pipeline standardizes these attributes into normalized physical properties consumed by the rasterizer and 3D extrusion engines:

| Normalized Class (`feature_class`) | Source OSM Tags | Standardized Attributes Assigned | Physical Simulation Role |
| :--- | :--- | :--- | :--- |
| **`building`** | `building=*`, `building:levels=*`, `height=*` | `height` (default 22m or $3.5 \times \text{levels}$), `albedo: 0.18`, `emissivity: 0.90` | Occupies building density raster; determines Sky View Factor (SVF) canyon shadowing; anthropogenic heat source. |
| **`transport`** | `highway=*` (`primary`, `secondary`, `tertiary`, `residential`, `service`) | `width_m` (6.0m to 35.0m depending on classification), `albedo: 0.12`, `roughness: 0.05` | Road raster mask; impermeable pavement sensible heat generator; determines street tree verge zones. |
| **`green_space`** | `leisure=park`, `landuse=grass`, `natural=wood` | `veg_fraction: 0.85–0.98`, `canopy_height: 12–18m`, `albedo: 0.22`, `LAI: 3.5` | Evapotranspirative latent heat sink ($Q_e$); enhances urban microclimate cooling. |
| **`water`** | `natural=water`, `waterway=*`, `water=*` | `water_fraction: 0.98`, `albedo: 0.06`, `emissivity: 0.98`, `width_m: 15–45m` | Evaporative thermal buffer; provides strong localized sensible heat reduction ($Q_h$). |
| **`landuse_context`** | `landuse=commercial`, `retail`, `residential` | `context_tag`, `density_prior` | Ambient background boundary condition. |

---

## 4. Rigorous Truth in Labeling & Provenance Disclaimers

In accordance with Checkpoint C2 remediation mandates:
1. **Modelled vs Observed Separation**:
   - Every grid response payload contains:
     `"has_observed_satellite_lst": false`
     `"contains_modelled_layers": true`
     `"data_provenance": "OpenStreetMap Overpass physical vector snapshot (ODbL, © OpenStreetMap contributors)"`
     `"data_license": "ODbL-1.0 (© OpenStreetMap contributors)"`
2. **Thermal Heat Layers**:
   - The surface temperature field (`baseline_temperature_c`) is produced by the Surface Energy Balance (SEB) numerical solver. It is strictly labelled as **Modelled SEB Temperature**, not satellite radiometer retrieval.
3. **Internal Self-Consistency Checks**:
   - The validation route evaluates simulation consistency against controlled synthetic benchmark states with injected sensor noise ($\sigma = 0.45^\circ\text{C}$). It is strictly labelled as an **Internal Self-Consistency Benchmark**, with zero false claims of Landsat 8/9 or ECOSTRESS ground-truth calibration.
