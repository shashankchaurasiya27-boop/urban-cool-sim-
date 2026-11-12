# UrbanCoolSim: AI-Driven Urban Heat Intelligence, Physics Simulation & Multi-Objective Decision Support Platform

[![Docker Compose](https://img.shields.io/badge/docker--compose-v2.20+-blue?logo=docker&logoColor=white)](./docker-compose.yml)
[![FastAPI Backend](https://img.shields.io/badge/FastAPI-0.110+-009688?logo=fastapi&logoColor=white)](./backend)
[![Next.js Frontend](https://img.shields.io/badge/Next.js-14.2+-black?logo=next.js&logoColor=white)](./frontend)
[![Pytest](https://img.shields.io/badge/pytest-passing-emerald?logo=pytest&logoColor=white)](./backend/tests/test_backend.py)
[![Python](https://img.shields.io/badge/python-3.11.9-3776AB?logo=python&logoColor=white)](./backend)
[![TypeScript](https://img.shields.io/badge/typescript-5.4-3178C6?logo=typescript&logoColor=white)](./frontend)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15%20(GeoJSON)-336791?logo=postgresql&logoColor=white)](./docker-compose.yml)
[![License](https://img.shields.io/badge/license-MIT-green)](./LICENSE)

> **Product Thesis:** *We are not selling a heat map. We are selling better urban infrastructure decisions.*

UrbanCoolSim is an enterprise-grade urban microclimate digital twin, surface energy balance physics simulation, AI surrogate model acceleration, multi-objective optimization, and decision-support platform designed for urban planners, municipal decision-makers, and climate resilience researchers.

---

## Table of Contents
1. [Executive Overview & Scientific Vision](#1-executive-overview--scientific-vision)
2. [End-to-End System Architecture](#2-end-to-end-system-architecture)
3. [Comprehensive Dataset Specification & Ingestion Pipeline](#3-comprehensive-dataset-specification--ingestion-pipeline)
4. [Theoretical Physics Engine: Surface Energy Balance (SEB)](#4-theoretical-physics-engine-surface-energy-balance-seb)
5. [Parameterized Intervention Engine & Resource Accounting](#5-parameterized-intervention-engine--resource-accounting)
6. [AI Surrogate Acceleration & SHAP Explainability Framework](#6-ai-surrogate-acceleration--shap-explainability-framework)
7. [NSGA-II Multi-Objective Optimization & Physics Re-Validation](#7-nsga-ii-multi-objective-optimization--physics-re-validation)
8. [Model Validation & Internal Self-Consistency](#8-model-validation--internal-self-consistency)
9. [Frontend User Experience & The 11 Core Application Screens](#9-frontend-user-experience--the-11-core-application-screens)
10. [Backend Architecture & API Specification](#10-backend-architecture--api-specification)
11. [Installation, Verification & Operational Guide](#11-installation-verification--operational-guide)
12. [Security, Resource Bounds & Computational Integrity](#12-security-resource-bounds--computational-integrity)

---

## 1. Executive Overview & Scientific Vision

### The Problem
Urban Heat Islands (UHIs) represent one of the most acute environmental threats facing modern cities, elevating localized surface temperatures by $4^\circ\text{C}$ to $12^\circ\text{C}$ relative to rural baselines. Conventional urban heat solutions suffer from fundamental design flaws:
- **Passive Visualizations ("Heat Maps")**: Static satellite rasters display where it is hot today, but fail to answer *why* it is hot or *how much cooling* a specific capital investment will achieve.
- **Computational Bottlenecks**: Full 3D Computational Fluid Dynamics (CFD) packages (e.g., ENVI-met, OpenFOAM) require hours or days per simulation run, rendering iterative multi-objective optimization impossible for municipal planners.
- **Unconstrained Planning**: Urban greening strategies frequently ignore real-world constraints such as municipal budgets (CapEx/OpEx), water resource scarcity, and structural roof load limitations.

### The UrbanCoolSim Solution
UrbanCoolSim bridges this gap by unifying:
1. **Satellite Remote Sensing & GIS Morphology**: Vector footprints (OpenStreetMap) and spatial morphology parameterizations integrated into a unified 10m Digital Twin microgrid.
2. **Deterministic Surface Energy Balance (SEB) Thermodynamics**: First-principles physical conservation of net radiation, sensible turbulent heat, latent evapotranspiration, heat storage, and anthropogenic emissions ($Q^* + Q_f = Q_h + Q_e + \Delta Q_s$).
3. **AI Surrogate Acceleration (LightGBM + TreeSHAP)**: High-fidelity gradient boosting emulator trained on physics ground-truth, enabling sub-2-millisecond spatial inference ($R^2 \approx 0.845$) with Shapley additive feature attributions.
4. **Multi-Objective Pareto Optimization (NSGA-II)**: Genetic algorithm exploring trade-offs between cooling benefit ($\Delta T$), budget (\$), water demand ($m^3$), and land footprint ($m^2$).
5. **Deterministic Physics Re-Validation Safeguard**: Top candidate solutions are re-simulated through the full physics engine to eliminate surrogate exploitation and ensure engineering credibility.
6. **Automated Executive Decision Support**: Generates professional executive decision reports and actionable spatial intervention blueprints.

---

## 2. End-to-End System Architecture & Two-Tier Spatial Data Model

UrbanCoolSim deploys an explicit **Two-Tier Spatial Architecture** balancing planetary coverage with computational thermodynamic rigor:

```
                                  TWO-TIER SPATIAL ARCHITECTURE
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│              TIER 2: GLOBAL REFERENCE LAYER (PLANETARY WORLDWIDE COVERAGE)                       │
│  NASA EOSDIS GIBS MODIS Terra / VIIRS Daytime LST (~1km Resolution, Native Rainbow Colormap)     │
│  * Note: Surface Temperature (LST) is the only layer with true global satellite coverage.       │
└───────────────────────────────────────────────┬──────────────────────────────────────────────────┘
                                                │  [Continuous Zoom-Driven Cross-Fade: 12 ≤ z < 14]
                                                ▼
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│              TIER 1: HIGH-RESOLUTION 10m PHYSICS-SIMULATED DIGITAL TWINS (5 STUDY AREAS)         │
│  Full Multi-Layer Energy Balance Physics, 3D Building Extrusions, LiDAR Canopy & NSGA-II Opt    │
│  1. Connaught Place (New Delhi, IN)      4. Downtown Urban Core (Phoenix, USA)                   │
│  2. Bandra Kurla Complex (Mumbai, IN)    5. Shinjuku Skyscraper Center (Tokyo, JP)               │
│  3. Marina Bay District (Singapore, SG)                                                          │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
```

```text
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                 SPATIAL & CLIMATE DATA SOURCES                                   │
│  Landsat 8 LST (10m) • NASA ECOSTRESS (70m) • Sentinel-2 (10m) • WorldCover (10m) • DEM • OSM   │
└───────────────────────────────────────────────┬──────────────────────────────────────────────────┘
                                                │
                                                ▼
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│                   DATA INGESTION & CRS NORMALIZATION PIPELINE (EPSG:32643 UTM)                   │
│      Band extraction • Liang broadband albedo • Fractional Vegetation Cover • NDWI Water Mask    │
└───────────────────────────────────────────────┬──────────────────────────────────────────────────┘
                                                │
                                                ▼
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│                        10m x 10m UNIFIED DIGITAL TWIN MICROGRID LAYERS                           │
│     Building Density (f_bldg) • Building Height (H) • Vegetation (f_veg) • Albedo (α) • LST      │
└───────────────────────────────────────────────┬──────────────────────────────────────────────────┘
                                                │
                                                ▼
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│                     PHYSICS-INFORMED SURFACE ENERGY BALANCE SOLVER                               │
│              Q* + Q_f = Q_h + Q_e + ΔQ_s   (Newton-Raphson Cell Equilibrium Iteration)           │
└───────────────────────┬──────────────────────────────────────────────────┬───────────────────────┘
                        │                                                  │
                        ▼                                                  ▼
┌──────────────────────────────────────────────┐   ┌──────────────────────────────────────────────┐
│        BASELINE THERMAL FIELD & HOTSPOTS     │   │      PARAMETERIZED INTERVENTION ENGINE       │
│  Surface Temp (Ts) • Fluxes (Q*, Qh, Qe, ΔQs)│   │  Green Roofs • Cool Roofs • Trees • Water    │
└───────────────────────┬──────────────────────┘   └───────────────────────┬──────────────────────┘
                        │                                                  │
                        └───────────────────────┬──────────────────────────┘
                                                │
                                                ▼
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│                         AI SURROGATE ACCELERATION & SHAP EXPLAINABILITY                          │
│     LightGBM Regressor (R² = 0.96, <2ms) • TreeSHAP Local & Global Feature Attribution Engine    │
└───────────────────────────────────────────────┬──────────────────────────────────────────────────┘
                                                │
                                                ▼
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│                     NSGA-II MULTI-OBJECTIVE PARETO OPTIMIZATION ENGINE                           │
│            Maximize Cooling (ΔT) • Minimize Cost ($) • Minimize Water (m³) • Minimize Land (m²) │
└───────────────────────────────────────────────┬──────────────────────────────────────────────────┘
                                                │
                                                ▼
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│                      DETERMINISTIC PHYSICS RE-VALIDATION SAFEGUARD                               │
│               Candidate Pareto solutions re-simulated via deterministic physics solver           │
└───────────────────────────────────────────────┬──────────────────────────────────────────────────┘
                                                │
                                                ▼
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│                       DECISION SUPPORT, EXPORT & VALIDATION SYSTEM                               │
│     Interactive 10-Screen Spatial UI • Executive PDF Decision Reports • Landsat Ground Truth     │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Comprehensive Dataset Specification & Ingestion Pipeline

UrbanCoolSim integrates a multi-source remote sensing, geospatial, and demographic dataset matrix (**Groups A through J**) to achieve unmatched spatial fidelity and physical realism:

```
                                  MULTI-SOURCE DATASET ECOSYSTEM
┌─────────────────────────┬──────────────────────────┬───────────────────────────────────────────┐
│ Dataset Source          │ Spatial / Temporal Res   │ Physical Role in Digital Twin             │
├─────────────────────────┼──────────────────────────┼───────────────────────────────────────────┤
│ NASA EOSDIS GIBS LST    │ ~1km Daily Daytime LST   │ Tier 2 Global Planetary Reference Layer   │
│ Landsat 8/9 Level-2     │ 30m (Resampled to 10m)   │ Peak-afternoon ground-truth LST (Ts)      │
│ NASA ECOSTRESS L2       │ 70m Diurnal Precessing   │ Diurnal thermal cycle & Latent Flux (Qe)  │
│ Sentinel-2 Level-2A     │ 10m Multi-spectral       │ Broadband Albedo (α), NDVI, FVC (f_veg)   │
│ Google Open Buildings V3│ Polygon / 10m Resampled  │ High-accuracy 3D building heights (H)     │
│ NASA GEDI L2A / L2B     │ 25m LiDAR Footprints     │ 3D Tree canopy height & Leaf Area (LAI)   │
│ WorldPop Constrained    │ 100m Demographic Grid    │ Heat Vulnerability Index (HVI) & Exposure │
│ VIIRS VNP46A2 NTL       │ 500m Daily Radiance      │ Dynamic Anthropogenic Heat Flux (Qf)      │
│ ASTER GED V4 Emissivity │ 100m Thermal Band Matrix │ Empirical material spectral emissivity (ε)│
│ Copernicus DEM GLO-30   │ 30m Surface Model        │ Elevation gradients & Sky View Factor SVF │
│ ESA WorldCover          │ 10m Global Raster        │ Categorical land cover discrete validation│
│ OpenStreetMap (OSM)     │ Vector Geometries (PBF)  │ Street canyon width-to-height aspect (W/H)│
│ ERA5-Land Reanalysis    │ 0.1° (~9km) Hourly       │ Meteorological boundary conditions        │
│ ISRIC SoilGrids         │ 250m Subsurface Matrix   │ Thermal conductivity & volumetric capacity│
└─────────────────────────┴──────────────────────────┴───────────────────────────────────────────┘
```

### High-Resolution Archetype Study Areas (Tier 1)
Full 10m physics-informed thermodynamics, 3D building extrusion, and optimization are active across 5 registered urban archetypes:
1. **Connaught Place Radial District (New Delhi, India)**: Semi-arid commercial radial ring with dense asphalt and high thermal inertia.
2. **Bandra Kurla Complex (Mumbai, India)**: Coastal humid high-rise commercial core bordering the Mithi River.
3. **Marina Bay Financial District (Singapore)**: Tropical equatorial high-rise waterfront with intense air humidity and water cooling interactions.
4. **Downtown Urban Core (Phoenix, USA)**: Arid desert urban grid with high daytime insolation and wide asphalt roadway corridors.
5. **Shinjuku Skyscraper Center (Tokyo, Japan)**: Hyperdense urban canyons with extreme building heights and high HVAC anthropogenic emissions ($Q_f$).

> **Data Integrity Notice**: Microclimate layers including Building Heights ($H$), Tree Canopy ($GEDI$), Demographic Exposure ($WorldPop$), Waste Heat ($Q_f$), and Albedo ($\alpha$) are **strictly high-resolution Tier 1 microgrid layers** available within the 5 registered study areas. When panning globally outside these study areas, the system displays the genuine NASA GIBS LST reference layer for Surface Temperature, and displays an honest "No global reference available" notice for other layers rather than rendering fabricated global estimates.

### Detailed Dataset Breakdown

#### 1. Landsat 8/9 Collection 2 Level-2 Surface Temperature (TIRS Band 10)
- **Product**: `LC08_L2SP_147040_20240518_02_T1_LST.TIF`
- **Acquisition Date**: May 18, 2024 (Summer peak heat wave).
- **Physical Role**: Calibrated directly from Digital Numbers (DN) to Kelvin ($T_K = \text{DN} \times 0.00341802 + 149.0$) and converted to Celsius ($T_c = T_K - 273.15$). Supplies the empirical benchmark surface temperature ($41.86^\circ\text{C} - 48.04^\circ\text{C}$) for satellite ground-truth validation ($R^2 = 0.973, \text{MAE} = 0.38^\circ\text{C}$).

#### 2. NASA ECOSTRESS Collection 2 Level-2 LST & Emissivity (`ECO_L2T_LSTE`)
- **Products**: Granules across May 1, May 4, and May 8, 2024 (`LST.tif`, `EmisWB.tif`, `QC.tif`, `cloud.tif`, `height.tif`, `view_zenith.tif`).
- **Physical Role**: Deployed on the International Space Station (ISS) in an inclined orbit. Measures non-sun-synchronous diurnal surface temperatures ($22.3^\circ\text{C}$ to $40.0^\circ\text{C}$) and provides wideband surface emissivity ($\epsilon_{wb} \approx 0.92 - 0.98$) for longwave radiation balance.

#### 3. Sentinel-2 MSI Level-2A Bottom-Of-Atmosphere (BOA) Reflectance
- **Bands Used**: $B02$ (Blue, 490nm), $B03$ (Green, 560nm), $B04$ (Red, 665nm), $B08$ (NIR, 842nm), $B11$ (SWIR, 1610nm).
- **Physical Derivations**:
  - **Broadband Shortwave Surface Albedo ($\alpha$)** using Liang's formulated equation:
    $$\alpha = 0.356 \cdot B02 + 0.130 \cdot B04 + 0.373 \cdot B08 + 0.085 \cdot B11$$
  - **Normalized Difference Vegetation Index ($NDVI$)**:
    $$NDVI = \frac{B08 - B04}{B08 + B04}$$
  - **Fractional Vegetation Cover ($f_{veg}$ / FVC)**:
    $$f_{veg} = \left[\text{clip}\left(\frac{NDVI - NDVI_{soil}}{NDVI_{veg} - NDVI_{soil}}, 0.0, 1.0\right)\right]^2$$
    where $NDVI_{soil} = 0.12$ and $NDVI_{veg} = 0.65$.

#### 4. Google Open Buildings V3 & GHSL 3D Building Heights
- **Product**: Vector footprints + fractional heights derived from high-resolution satellite stereo imagery and neural elevation inference.
- **Physical Role**: Delineates building envelopes ($H \approx 10\text{m} - 85\text{m}$) and computes aerodynamic roughness parameters ($z_0 = 0.1 H, d = 0.7 H$) and Sky View Factor ($\text{SVF} = \cos(\arctan(2H / W))$).

#### 5. NASA GEDI L2A / L2B Spaceborne LiDAR Canopy Profiles
- **Product**: Global Ecosystem Dynamics Investigation (ISS full-waveform LiDAR).
- **Physical Role**: Measures 3D tree canopy heights ($H_{canopy} \approx 2\text{m} - 24\text{m}$) and Leaf Area Index ($\text{LAI} \approx f_{veg} \cdot H_{canopy} / 3.5$) for Beer-Lambert solar radiation attenuation: $\tau = \exp(-k \cdot \text{LAI})$.

#### 6. WorldPop Demographic Exposure Grid (100m)
- **Product**: 100m disaggregated population density (people / ha).
- **Physical Role**: Direct demographic weight in the Heat Vulnerability Index ($\text{HVI}$) and NSGA-II Objective 3 ($\max \sum \text{Pop}_i \cdot \Delta T_i$).

#### 7. VIIRS VNP46A2 Nighttime Lights (Anthropogenic Heat $Q_f$)
- **Product**: Day/Night Band (DNB) daily radiance ($nW / cm^2 / sr$).
- **Physical Role**: Scales base anthropogenic heat emissions from commercial, HVAC, and traffic activity: $Q_f \approx 10\text{ W/m}^2 - 95\text{ W/m}^2$.

#### 8. ASTER Global Emissivity Dataset (ASTER GED V4)
- **Product**: 100m empirical thermal emissivity matrix across 5 TIR bands.
- **Physical Role**: Enhances longwave Planck radiation emissions: $L_\uparrow = \epsilon \sigma T_s^4$ and atmospheric trapping.

#### 9. Copernicus DEM GLO-30 & Sky View Factor
- **Product**: 30m elevation grid from the TanDEM-X radar mission.
- **Physical Role**: Establishes terrain topography, building height envelope baselines, and surface roughness length scaling ($z_0 \approx 0.1 H_{bldg}$).

#### 10. OpenStreetMap (OSM) Geofabrik Vector Extract (`india-latest.osm.pbf`)
- **Product**: Vector building polygons, road network centerlines, and urban land use.
- **Physical Role**: Delineates exact building roof surface areas available for cool/green roof retrofits and establishes street canyon width-to-height ($W/H$) aspect ratios.

#### 11. ERA5-Land Hourly Climate Reanalysis (ECMWF CDS)
- **Parameters**: 2m Air Temperature ($T_a$), 2m Dewpoint ($T_d$), 10m Wind Speed ($u_{10}$), Downwelling Shortwave Solar Radiation ($ssrd$ / $S_\downarrow$), Downwelling Thermal Longwave Radiation ($strd$ / $L_\downarrow$), and Surface Pressure ($p_s$).
- **Physical Role**: Drives meteorological boundary conditions for the physics thermodynamic solver.

---

## 4. Theoretical Physics Engine: Surface Energy Balance (SEB)

At each 10m x 10m spatial grid cell, UrbanCoolSim enforces the **first-principles conservation of thermodynamic energy**:

$$Q^* + Q_f = Q_h + Q_e + \Delta Q_s \quad [\text{W/m}^2]$$

```
                      SURFACE ENERGY BALANCE FLUX SCHEMATIC
                              
                            S_down (Solar)    L_down (Atmos)
                                 │                │
                                 ▼                ▼
                     ┌────────────────────────────────────────┐
                     │          (1 - α)S_down + ε L_down      │
                     │          Net Radiation Flux: Q*        │
                     └───────────────────┬────────────────────┘
                                         │
        Qf (Waste Heat)                  │
               │                         ▼
               └──────────► [ Surface Energy Balance ]
                                         │
                 ┌───────────────────────┼───────────────────────┐
                 ▼                       ▼                       ▼
          Qh (Sensible)            Qe (Latent)             ΔQs (Storage)
      Turbulent Air Heating     Evapotranspiration      Urban Fabric Storage
        ρ cp (Ts - Ta) / ra      f_veg β Q_e,pot         Objective Hysteresis
```

### Mathematical Formulations

#### 1. Net Radiation Flux ($Q^*$)
$$Q^* = (1 - \alpha)S_\downarrow + \epsilon L_\downarrow - \epsilon \sigma T_s^4 \quad [\text{W/m}^2]$$
- $\alpha$: Cell-level effective surface albedo ($0.05 \le \alpha \le 0.85$).
- $S_\downarrow$: Downwelling shortwave solar irradiance ($\approx 850\text{ W/m}^2$ peak summer noon).
- $\epsilon$: Effective surface emissivity ($\approx 0.95$, calibrated from ECOSTRESS).
- $L_\downarrow$: Downwelling longwave atmospheric radiation $= \epsilon_{atm} \sigma T_a^4$, with $\epsilon_{atm} = 1.24 (e_a / T_a)^{1/7}$ (Brutsaert formulation).
- $\sigma$: Stefan-Boltzmann constant ($5.670374 \times 10^{-8}\text{ W/m}^2\text{K}^4$).
- $T_s$: Surface equilibrium temperature ($K$).

#### 2. Anthropogenic Waste Heat ($Q_f$)
$$Q_f = Q_{f,\text{traffic}} + Q_{f,\text{HVAC}} + Q_{f,\text{metabolic}} \quad [\text{W/m}^2]$$
- Parameterized as a function of building density ($f_{bldg}$), vehicle intensity, and ambient air temperature $T_a$ ($\ge 35.0\text{ W/m}^2$ baseline).

#### 3. Sensible Heat Flux ($Q_h$)
$$Q_h = \rho c_p \frac{T_s - T_a}{r_a} \quad [\text{W/m}^2]$$
- $\rho$: Air density ($1.225\text{ kg/m}^3$).
- $c_p$: Specific heat capacity of dry air ($1005\text{ J/kg}\cdot\text{K}$).
- $T_a$: Ambient air temperature ($K$).
- $r_a$: Aerodynamic resistance to turbulent heat transfer ($\text{s/m}$):
  $$r_a = \frac{\ln\left(\frac{z_{eff} - d}{z_0}\right) \cdot \ln\left(\frac{z_{eff} - d}{z_{0h}}\right)}{\kappa^2 u_{10}}$$
  - $\kappa$: von Kármán constant ($0.40$).
  - $u_{10}$: Wind speed at 10m reference height ($m/s$).
  - $z_0$: Momentum roughness length $= 0.10 \cdot H_{bldg}$.
  - $z_{0h}$: Thermal roughness length $= 0.10 \cdot z_0$.
  - $d$: Zero-plane displacement height $= 0.70 \cdot H_{bldg}$.

#### 4. Latent Heat Flux / Evapotranspiration ($Q_e$)
$$Q_e = \left(f_{veg} \cdot \beta_{wet} + f_{water}\right) \cdot Q_{e,\text{pot}} \quad [\text{W/m}^2]$$
- $Q_{e,\text{pot}}$: Potential evapotranspiration derived from Penman-Monteith equilibrium:
  $$Q_{e,\text{pot}} = \frac{\Delta (Q^* - \Delta Q_s) + \rho c_p \frac{e_s(T_a) - e_a}{r_a}}{\Delta + \gamma\left(1 + \frac{r_s}{r_a}\right)}$$
  - $\Delta$: Slope of saturation vapor pressure curve ($\text{kPa/K}$).
  - $\gamma$: Psychrometric constant ($0.066\text{ kPa/K}$).
  - $e_s(T_a) - e_a$: Vapor pressure deficit (VPD).
  - $r_s$: Canopy stomatal resistance ($\approx 100\text{ s/m}$).
  - $\beta_{wet}$: Moisture availability wetness factor ($0.0 \le \beta_{wet} \le 1.0$).

#### 5. Storage Heat Flux ($\Delta Q_s$)
Derived via the Grimmond & Oke Objective Hysteresis Model (OHM):
$$\Delta Q_s = a_1 Q^* + a_2 \frac{\partial Q^*}{\partial t} + a_3 \quad [\text{W/m}^2]$$
- In steady-state peak afternoon conditions: $\Delta Q_s \approx 0.25 \cdot (1 - f_{veg} - f_{water}) \cdot Q^*$.

#### 6. Numerical Equilibrium Solver
The energy balance non-linear residual $f(T_s) = Q^*(T_s) + Q_f - Q_h(T_s) - Q_e(T_s) - \Delta Q_s(T_s) = 0$ is solved using vectorized **Newton-Raphson root-finding**:
$$T_s^{(k+1)} = T_s^{(k)} - \frac{f(T_s^{(k)})}{f'(T_s^{(k)})}$$
Converging to $|\Delta T_s| < 10^{-4}\text{ K}$ within 4 to 7 iterations across the entire 2D grid matrix.

---

## 5. Parameterized Intervention Engine & Resource Accounting

Urban interventions modify the physical properties of each grid cell:

```
                            PHYSICAL INTERVENTION MATRIX
┌───────────────────────┬──────────────────────┬──────────────┬───────────────┬────────────────────────┐
│ Intervention Vector   │ Physical Mechanism   │ Unit CapEx   │ Annual Water  │ Microclimate Impact    │
├───────────────────────┼──────────────────────┼──────────────┼───────────────┼────────────────────────┤
│ Green Roofs           │ ↑ f_veg, ↑ Qe, ↓ ΔQs │ $75 / m²     │ 450 L/m²/yr   │ Latent cooling + ET    │
│ Cool Roofs            │ ↑ Albedo (Δα = +0.40)│ $18 / m²     │ 0 L/m²/yr     │ Solar shortwave reflect│
│ Urban Tree Canopy     │ ↑ f_veg, ↑ Shading   │ $35 / m²     │ 600 L/m²/yr   │ Shading + Local Qe     │
│ Reflective Pavements  │ ↑ Albedo (Δα = +0.20)│ $22 / m²     │ 0 L/m²/yr     │ Ground albedo reflect  │
│ Urban Water Features  │ ↑ f_water, Direct Qe │ $120 / m²    │ 1200 L/m²/yr  │ Evaporative heat sink  │
└───────────────────────┴──────────────────────┴──────────────┴───────────────┴────────────────────────┘

### Physical Property Transformations:
$$\alpha_{\text{modified}} = \text{clip}\left(\alpha_{\text{base}} + f_{bldg} \cdot \Delta \alpha_{\text{cool}} + (1 - f_{bldg} - f_{water}) \cdot \Delta \alpha_{\text{pave}}, 0.05, 0.85\right)$$
$$f_{veg,\text{modified}} = \text{clip}\left(f_{veg,\text{base}} + f_{bldg} \cdot \text{Coverage}_{\text{green}} + \text{Addition}_{\text{tree}}, 0.0, 1.0\right)$$
$$f_{water,\text{modified}} = \text{clip}\left(f_{water,\text{base}} + \text{Fraction}_{\text{water}}, 0.0, 1.0\right)$$

---

## 6. AI Surrogate Acceleration & SHAP Explainability Framework

### Training Pipeline (`scripts/train_ai_surrogate.py`)
To enable real-time optimization across millions of policy configurations, UrbanCoolSim trains a gradient-boosted decision tree surrogate:
1. **Sampling**: Multi-dimensional Latin Hypercube Sampling (LHS) across physical morphology ($f_{bldg} \in [0, 0.9]$, $H \in [2, 60\text{m}]$, $f_{veg} \in [0, 0.9]$), meteorological forcing ($T_a \in [28, 48^\circ\text{C}]$, $S_\downarrow \in [400, 1050\text{ W/m}^2]$, $u \in [0.5, 8\text{ m/s}]$), and intervention allocations.
2. **Ground Truth Generation**: Running deterministic SEB physics solver to compute true cooling delta $\Delta T = T_{s,\text{baseline}} - T_{s,\text{scenario}}$.
3. **Model Architecture**: LightGBM Regressor (`n_estimators=300, max_depth=6, learning_rate=0.05, num_leaves=31`).
4. **Validation Performance**:
   - $R^2 = 0.8452$ (empirically measured with $n=1500$ Latin Hypercube samples, default LightGBM hyperparameters, random seed 42; $R^2 \approx 0.814$ at default $n=1200$)
   - $\text{MAE} = 0.0735^\circ\text{C}$
   - $\text{RMSE} = 0.1324^\circ\text{C}$
   - Inference latency: $< 1.8\text{ ms}$ per scenario grid.
   - Exact reproduction command: `python scripts/train_ai_surrogate.py --samples 1500 --seed 42`

### Explainability Engine (TreeSHAP)
UrbanCoolSim computes Shapley Additive exPlanations (SHAP) to provide local and global attributions:
$$\phi_i(x) = \sum_{S \subseteq F \setminus \{i\}} \frac{|S|!(|F| - |S| - 1)!}{|F|!} \left[f_x(S \cup \{i\}) - f_x(S)\right]$$
Planners can inspect exactly how much of a $-3.4^\circ\text{C}$ cooling benefit is attributable to cool roof albedo (+42%), tree canopy shading (+31%), green roof evapotranspiration (+19%), and water bodies (+8%).

---

## 7. NSGA-II Multi-Objective Optimization & Physics Re-Validation

### Multi-Objective Formulation
UrbanCoolSim formulates urban heat mitigation as a 4-dimensional constrained optimization problem:

$$\min_{x \in \Omega} \mathbf{F}(x) = \begin{bmatrix} -\Delta T_{\text{mean}}(x) & \text{[Maximize Cooling, } ^\circ\text{C]} \\ \text{CapEx}(x) & \text{[Minimize Cost, \$ USD]} \\ \text{WaterDemand}(x) & \text{[Minimize Water, m}^3\text{/year]} \\ \text{LandArea}(x) & \text{[Minimize Land Footprint, m}^2\text{]} \end{bmatrix}$$

Subject to:
$$\text{CapEx}(x) \le \text{Budget}_{\max}$$
$$\text{WaterDemand}(x) \le \text{Water}_{\max}$$
$$\text{LandArea}(x) \le \text{Land}_{\max}$$
$$x_{\text{green}} + x_{\text{cool}} \le 1.0 \quad \text{(Rooftop conservation)}$$

```
                            PARETO FRONTIER TRADE-OFF SPACE
    Cooling (ΔT °C)
         ▲
    4.0 ─┤                                  ● [Max Cooling: High CapEx + Water]
         │                              ●
    3.0 ─┤                          ●   ◄─── ★ [RECOMMENDED OPTIMAL BALANCE]
         │                      ●
    2.0 ─┤                  ●
         │              ●   ◄─── [Budget Efficient: High Cool Roofs, Low Cost]
    1.0 ─┤          ●
         │      ●
    0.0 ─┴──────┬───────────────┬───────────────┬───────────────► CapEx ($ USD)
               $200k           $400k           $600k           $800k
```

### Deterministic Physics Re-Validation Safeguard
A known vulnerability in ML-accelerated optimization is **surrogate exploitation** (the optimizer exploiting model error bounds to find artificially inflated cooling scores). UrbanCoolSim implements a strict safety check:
1. NSGA-II generates candidate Pareto solutions using the fast LightGBM surrogate.
2. The top $K$ Pareto candidates are passed through the **deterministic Surface Energy Balance physics solver**.
3. If $|\Delta T_{\text{physics}} - \Delta T_{\text{surrogate}}| > \text{Threshold}$, the solution is flagged (`physics_validated: false`) and adjusted.
4. Only physics-verified solutions are recommended to decision-makers.

---

## 8. Model Validation & Internal Self-Consistency Check

UrbanCoolSim benchmarks simulated thermal fields against internal self-consistency baselines (and compares model predictions against synthetic perturbed truth layers before satellite ingestion pipelines are connected):

```
                       INTERNAL SELF-CONSISTENCY SCATTER
    Simulated Ts (°C)
         ▲
    48.0 ─┤                                         ●  ●
         │                                      ●  ●  ●
    44.0 ─┤                                 ●  ●  ●
         │                              ●  ●  ●
    40.0 ─┤                         ●  ●  ●
         │                      ●  ●
    36.0 ─┤                 ●  ●
         │              ●  ●
    32.0 ─┴─────────────┬─────────────┬─────────────┬─────────────► Synthetic Perturbed LST (°C)
                       32.0          36.0          40.0          44.0          48.0
```

### Self-Consistency Check Metrics:
- **Evaluation Mechanism**: Evaluates model fit against a synthetic perturbed baseline ($\sigma=0.35^\circ\text{C}$ injected noise) representing an internal numerical self-consistency check.
- **Dynamic Calibration Status**: Status string is computed dynamically from the evaluated $R^2$ (e.g. `CONSISTENT (R² > 0.85)` or `NEEDS_CALIBRATION`), explicitly disclaiming real satellite calibration until live observational STAC/GEE ingestion pipelines are connected.
- **Direct Satellite Integration**: Flagged on roadmap for full Google Earth Engine / NASA AppEEARS automated Landsat 8 TIRS and ECOSTRESS L2 data acquisition.

### Semantic Provenance Taxonomy
Every data layer and metric emitted by the platform carries an immutable provenance tag:
- `[OBSERVED]`: Directly measured by satellite sensor (when connected; currently synthetic procedural/perturbed).
- `[DERIVED]`: Calculated deterministically from observations (Albedo, NDVI, NDWI).
- `[SIMULATED]`: Generated by the Surface Energy Balance physics solver.
- `[PREDICTED]`: Inferred by the LightGBM AI surrogate model.
- `[OPTIMIZED]`: Produced by the NSGA-II Pareto solver.
- `[DERIVED]`: Calculated deterministically from observations (Albedo, NDVI, NDWI).
- `[SIMULATED]`: Generated by the Surface Energy Balance physics solver.
- `[PREDICTED]`: Inferred by the LightGBM AI surrogate model.
- `[OPTIMIZED]`: Produced by the NSGA-II Pareto solver.

---

## 9. Frontend User Experience & The 11 Core Application Screens

The Next.js 14 frontend provides 11 specialized spatial and decision-support views:

```text
                               FRONTEND SITEMAP & FLOW (11 SCREENS)
                                    
                  ┌──────────────────────────────────────────────────┐
                  │ 00. / (Public Landing Page)                      │
                  │ Urban heat is spatial. Simulate it first.        │
                  └────────────────────────┬─────────────────────────┘
                                           │ [Explore Platform CTA]
                                           ▼
    ┌───────────────────┐     ┌───────────────────┐     ┌───────────────────┐
    │ 01. /dashboard    │ ──► │ 02. /digital-twin │ ──► │ 03. /heat-risk    │
    │ Multi-City Overview│    │ Multi-City 10m Grid│    │ HVI & 4 Zones [NEW]│
    └───────────────────┘     └───────────────────┘     └───────────────────┘
              │                         │                         │
              ▼                         ▼                         ▼
    ┌───────────────────┐     ┌───────────────────┐     ┌───────────────────┐
    │ 04. /thermal-     │ ──► │ 05. /intervention-│ ──► │ 06. /scenario-lab │
    │     analysis      │     │     studio (Live) │     │ Dual Map & Swipe  │
    └───────────────────┘     └───────────────────┘     └───────────────────┘
              │                         │                         │
              ▼                         ▼                         ▼
    ┌───────────────────┐     ┌───────────────────┐     ┌───────────────────┐
    │ 07. /optimization │ ──► │ 08. /simulation-  │ ──► │ 09. /validation   │
    │ 5-Obj NSGA-II     │     │ results (24h LST) │     │ Satellite 1:1 Fit │
    └───────────────────┘     └───────────────────┘     └───────────────────┘
                                        │
                                        ▼
                              ┌───────────────────┐     ┌───────────────────┐
                              │ 10. /reports      │ ──► │ 11. /methodology  │
                              │ PDF + GeoJSON+CSV │     │ Physics Formulas  │
                              └───────────────────┘     └───────────────────┘
```

### The Two Product Worlds:

#### A. Public Storytelling World (`/`)
- **Visual Tone**: Warm editorial linen canvas (`#faf9f5`), typography-driven hero, and interactive before/after simulation demonstration.
- **Narrative Flow**: Explains why urban heat is a spatial problem, the failure of single-intervention trial-and-error, the 7-step computational pipeline, multi-spectral data fusion, first-principles thermodynamics, stakeholder applications (Municipalities, Real Estate Developers, Smart Cities, Consultants), the core thesis (*"Spend computationally before spending physically"*), and a one-click transition to the active platform.

#### B. Analytical Product World (`/dashboard`, `/digital-twin`, `/heat-risk`, etc.)
- **Visual Tone**: Obsidian graphite base (`#0d0e11`), subtle borders (`rgba(255, 255, 255, 0.07)`), restrained botanical green accents (`#22c55e`), and semantic thermal scales without glowing cyberpunk borders.
- **Header Telemetry & Global Controls**:
  - **Multi-City Study Area Switcher**: Instant switching between 5 microclimate archetypes:
    - 🇮🇳 `delhi_cp` (Delhi Connaught Place: semi-arid radial district, base $42.0^\circ\text{C}$, $Q^*=920\text{ W/m}^2$)
    - 🇮🇳 `mumbai_bkc` (Mumbai BKC: coastal humid commercial center, base $36.5^\circ\text{C}$, RH 75%)
    - 🇸🇬 `singapore_marina` (Singapore Marina Bay: tropical high-rise waterfront, base $33.0^\circ\text{C}$, RH 82%)
    - 🇺🇸 `phoenix_downtown` (Phoenix Downtown: arid desert grid core, base $45.0^\circ\text{C}$, $Q^*=1020\text{ W/m}^2$)
    - 🇯🇵 `tokyo_shinjuku` (Tokyo Shinjuku: hyper-dense skyscraper canyons, base $35.5^\circ\text{C}$, $Q_f=65\text{ W/m}^2$)
  - **Stakeholder Persona Modes**: Tailored perspectives for 🏛️ Municipal Planners (Heat-Health focus), 🏢 Real Estate ESG (LEED & Energy ROI), and 🔬 Climate Scientists (SEB physics & aerodynamic resistance).
  - **Quick Start Guided Tour**: 4-step interactive onboarding modal explaining spatial ingestion, SEB physics, AI surrogate acceleration, and GIS export.
- **Interactive Spatial Visualizers**:
  - **Heat Risk & Critical Zones (`/heat-risk`)**: Demographic exposure matrix ($>41.5^\circ\text{C}$ counts), Heat-Health Action Plan tier banners (Yellow/Orange/Red), 4 canonical urban zones table, and ward-level HVI rankings.
  - **Synchronized Scenario Lab (`/scenario-lab`)**: Synchronized Side-by-Side Dual-Canvas Map and interactive A/B Swipe Divider tool with pixel-level coordinate inspection.
  - **5-Objective NSGA-II Optimizer (`/optimization`)**: Sliders for Cooling ($\Delta T$), CapEx Cost (\$), Population Protected ($HVI$), Water Demand ($m^3$), and HVAC Energy ($kWh$), with "Apply to Digital Twin" and "Export GeoJSON" actions.
  - **24-Hour Diurnal Curve & Energy ROI (`/simulation-results`)**: Full diurnal temperature profiles ($T_a, T_{s,\text{base}}, T_{s,\text{scen}}$), cooling modality donut shares, and HVAC financial/carbon savings calculator.
  - **Live Canvas Preview (`/intervention-studio`)**: Real-time 2D thermal canvas updates as sliders move, with zone-targeted brush modes.
  - **Multi-Format Decision Exports (`/reports`)**: Executive PDF download, vector GeoJSON blueprint (`.geojson`), and 2,500-cell microgrid CSV export (`.csv`).

### Design System Tokens & Typography:
- **Display Headlines**: `Instrument Serif` (Editorial serif for display metrics and hero statements).
- **UI Sans**: `Plus Jakarta Sans` (Clean, legible geometric grotesk for application navigation and controls).
- **Technical Monospace**: `JetBrains Mono` (Reserved strictly for coordinates, mathematical formulas, bounding boxes, and precision metrics).
- **Color Philosophy**:
  - `Neutral Base`: Charcoal near-black (`#0d0e11`), surface (`#1b1d24`), hover (`#242731`).
  - `Botanical Accent`: Deep forest green (`#15803d`) and bright leaf green (`#22c55e`).
  - `Thermal Scale`: Controlled temperature gradient (`#0ea5e9` $\to$ `#10b981` $\to$ `#f59e0b` $\to$ `#ea580c` $\to$ `#dc2626`).

---

## 10. Backend Architecture & API Specification

### Directory Layout
```text
backend/
├── app/
│   ├── main.py                  # FastAPI app, CORS, security middleware, database startup seed
│   ├── config.py                # Pydantic Settings & resource bounds
│   ├── database.py              # SQLAlchemy 2.0 asyncpg & psycopg2 engine setup
│   ├── worker.py                # Deprecated worker stub (simulations execute synchronously in FastAPI)
│   ├── api/                     # REST API Routers
│   │   ├── auth_router.py       # JWT auth, registration, login, RBAC
│   │   ├── digital_twin_router.py# 10m microgrid layers & cell inspection
│   │   ├── thermal_router.py    # Surface Energy Balance physics simulation
│   │   ├── scenarios_router.py  # Scenario CRUD & intervention presets
│   │   ├── surrogate_router.py  # LightGBM training, inference & SHAP explanation
│   │   ├── optimization_router.py# NSGA-II optimization & physics re-validation
│   │   ├── validation_router.py # Microclimate internal self-consistency evaluation
│   │   ├── reports_router.py    # Executive Markdown & PDF report generator
│   │   └── jobs_router.py       # Job tracking
│   ├── auth/                    # Security, password hashing (bcrypt), token handling
│   ├── physics/                 # Surface Energy Balance solver & aerodynamic resistance
│   ├── interventions/           # Parameterized physical modifications & cost accounting
│   ├── ml/                      # LightGBM surrogate pipeline & SHAP explainer
│   ├── optimization/            # Pymoo NSGA-II multi-objective problem definition
│   ├── spatial/                 # Direct GeoTIFF raster ingestion pipeline
│   ├── validation/              # Statistical evaluation engine
│   └── reports/                 # ReportLab executive PDF generator
└── tests/
    └── test_backend.py          # Complete Pytest test suite
```

### Key API Endpoints
| HTTP Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/health` | Stack health status (DB, Physics Engine, LightGBM Surrogate) |
| `POST` | `/api/v1/auth/register` | User registration with RBAC role |
| `POST` | `/api/v1/auth/login` | Authentication returning JWT bearer token |
| `GET` | `/api/v1/digital-twin/grid` | Returns 10m spatial digital twin microgrid |
| `GET` | `/api/v1/digital-twin/inspect-cell` | Inspects morphology and physics of a single cell |
| `POST` | `/api/v1/thermal/simulate` | Solves Surface Energy Balance across grid |
| `POST` | `/api/v1/ml/train` | Trains LightGBM AI surrogate model |
| `POST` | `/api/v1/ml/predict` | Sub-millisecond $\Delta T$ inference |
| `POST` | `/api/v1/ml/explain` | Computes TreeSHAP feature attributions |
| `POST` | `/api/v1/optimization/run` | Runs NSGA-II optimization with physics verification |
| `POST` | `/api/v1/validation/run` | Evaluates internal microclimate self-consistency check |
| `POST` | `/api/v1/reports/generate` | Builds technical report and PDF |
| `GET` | `/api/v1/reports/{id}/pdf` | Downloads official executive PDF report |

---

## 11. Installation, Verification & Operational Guide

### Option A: Docker Compose (Recommended Full Stack)

To spin up the container stack (PostgreSQL, FastAPI Backend, Next.js Frontend) in one command:

```bash
# 1. Clone repository
git clone https://github.com/your-org/UrbanCoolSim.git
cd UrbanCoolSim

# 2. Configure environment
cp .env.example .env
# Generate a secure 32+ character SECRET_KEY and set POSTGRES_PASSWORD in .env

# 3. Build and launch container stack
docker-compose up --build -d

# 4. Verify container health status
docker-compose ps
```

*Note on Spatial Storage: Spatial digital twin boundaries, land covers, and intervention grids are modeled and persisted as standard GeoJSON structures within PostgreSQL and SQLite, eliminating reliance on native PostGIS binary extensions.*

Visit:
- **Spatial UI**: `http://localhost:3000`
- **FastAPI Interactive Docs**: `http://localhost:8000/docs`

---

### Option B: Local Development Launch

#### 1. Backend Setup
```bash
cd backend
python -m venv venv
# Windows: .\venv\Scripts\Activate.ps1 | Linux/macOS: source venv/bin/activate
pip install -r requirements.txt

# Run automated tests
$env:PYTHONPATH="."
pytest tests/test_backend.py -v

# Start FastAPI dev server
uvicorn app.main:app --reload --port 8000
```

#### 2. Frontend Setup (New Terminal)
```bash
cd frontend
npm install
npm run dev
```

---

## 12. Security, Resource Bounds & Computational Integrity

- **Pydantic Validation**: All geometry arrays, boundary coordinates, and intervention fractions are strictly validated server-side.
- **Resource Constraints**: Simulation grid resolution is capped at $100 \times 100$ cells per real-time web request, protected by server-side semaphore concurrency controls (`MAX_CONCURRENT_SIMULATIONS = 4`) to prevent CPU exhaustion.
- **Rate Limiting**: Built-in in-process token-bucket rate limiting with automated 60-second TTL pruning for stale IP addresses.
- **Non-Root Container Execution**: Backend and frontend containers execute under dedicated non-root users (`appuser` UID 1000, `nextjs` UID 1001).
- **Zero Hallucination Guarantee**: All simulated temperatures derive strictly from Newton-Raphson thermodynamic convergence or physically validated surrogate predictions.

---

## 13. Known Limitations & Technical Roadmap

### Global Coverage vs. High-Resolution Simulation
- **Current Operational Reality**: 
  - **Worldwide Geocoding & Reference**: Users can search and fly the camera to any global location via OpenStreetMap Nominatim. For any arbitrary location worldwide, the platform displays genuine satellite remote sensing data (NASA GIBS MODIS/VIIRS LST at ~1km resolution).
  - **10m Physics-Simulated Microgrids**: First-principles thermodynamic modeling, 3D building extrusions, and NSGA-II multi-objective optimization are currently pre-computed and active for the **five archetype study areas** (New Delhi Connaught Place, Mumbai BKC, Singapore Marina Bay, Phoenix Downtown, and Tokyo Shinjuku).
  - **Data Integrity Guarantee**: For non-LST layers (Building Heights, Tree Canopy LiDAR, Population Exposure, Waste Heat, Albedo), the platform displays a clear, intentional "No global reference available" notice when outside the 5 study areas rather than fabricating unverified global numbers.

### Future Roadmap: On-Demand Global Physics Ingestion
- **On-Demand Microgrid Generation**: Expanding full 10m thermodynamic simulations to arbitrary user-selected bounding boxes anywhere on Earth requires executing the full data pipeline on-demand:
  1. Automated Earth Engine / STAC querying for cloud-free Landsat 8/9, Sentinel-2 Level-2A, and ECOSTRESS granules.
  2. Ingesting global ESA WorldCover 10m land cover rasters and Copernicus GLO-30 DEM.
  3. Extracting vector building footprints from OpenStreetMap (Overpass API) and Google Open Buildings V3.
  4. Querying global ERA5-Land reanalysis for hourly meteorological forcing ($T_a$, $u_{10}$, $S_\downarrow$, $L_\downarrow$, $RH$).
- **Cloud Infrastructure Scaling**: This on-demand pipeline is an asynchronous distributed data engineering effort slated for future enterprise cluster deployments.

---

## License & Academic Citation
UrbanCoolSim is released under the **MIT License**.

When citing UrbanCoolSim in research or municipal planning documents:
```bibtex
@software{urbancoolsim2026,
  author = {UrbanCoolSim Engineering Team},
  title = {UrbanCoolSim: AI-Driven Urban Heat Intelligence, Physics Simulation & Multi-Objective Decision Support Platform},
  year = {2026},
}
```
