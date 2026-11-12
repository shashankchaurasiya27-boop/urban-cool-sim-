# UrbanCoolSim Dataset Requirements & Specification

This document details all required, optional, and recommended datasets for running UrbanCoolSim with real-world spatial climate inputs.

---

## 1. Primary Dataset Inventory

| Dataset Name | Role | Provider | Spatial Res. | Format | Access / License | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Landsat 8/9 Thermal Infrared (TIRS)** | Baseline LST & Calibration | USGS / NASA | 30 m (resampled to 10 m) | GeoTIFF (`.tif`) | Free / Public Domain | **REQUIRED** |
| **Sentinel-2 MSI Surface Reflectance** | Albedo & NDVI calculation | ESA Copernicus | 10 m | GeoTIFF (`.tif`) | Free / CC-BY-4.0 | **REQUIRED** |
| **ERA5-Land Reanalysis** | Surface Weather Forcing ($T_a, S_{\downarrow}, u, q$) | ECMWF | 9 km (downscaled) | NetCDF (`.nc`) / CSV | Free / Open Data | **REQUIRED** |
| **OpenStreetMap (OSM) Footprints** | Building heights & building density | OpenStreetMap / Geofabrik | Vector | GeoJSON / Geopackage | Free / ODbL | **REQUIRED** |
| **ESA WorldCover 10m** | Land Use / Land Cover classification | ESA | 10 m | GeoTIFF (`.tif`) | Free / CC-BY-4.0 | **REQUIRED** |
| **ECOSTRESS LST & Evapotranspiration** | High-res diurnal thermal validation | NASA JPL / LP DAAC | 70 m | GeoTIFF / HDF5 | Free / Public Domain | **OPTIONAL** |
| **Copernicus DEM (GLO-30)** | Elevation, slope, surface aspect | ESA / Copernicus | 30 m | GeoTIFF (`.tif`) | Free / Public Domain | **OPTIONAL** |
| **Global Human Settlement Layer (GHSL)** | Population density & urban exposure | EU JRC | 100 m | GeoTIFF (`.tif`) | Free / CC-BY-4.0 | **NICE TO HAVE** |

---

## 2. Dataset Detailed Specifications

### A. Landsat 8/9 Surface Temperature (LST)
- **Purpose**: Ground-truth baseline surface temperature field ($T_s$) for thermal hotspot mapping and validation of physics/surrogate solvers.
- **Authoritative Provider**: USGS EarthExplorer / NASA USGS Landsat Collection 2 Level-2.
- **Direct Access URL**: [https://earthexplorer.usgs.gov](https://earthexplorer.usgs.gov)
- **Licence**: Public Domain.
- **Variables**: Band 10 Surface Temperature (ST_B10), QA_PIXEL.
- **Expected Directory**: `dataset/raw/lst/`
- **File Pattern**: `LC08_L2SP_*_ST_B10.TIF`
- **Preprocessing Pipeline**: Convert Digital Numbers (DN) to Kelvin: $T = DN \times 0.00341802 + 149.0$, reproject to local UTM CRS, resample to 10m spatial grid using bilinear interpolation.

### B. Sentinel-2 Surface Reflectance (Level-2A)
- **Purpose**: Calculate Normalized Difference Vegetation Index (NDVI), Fractional Vegetation Cover ($f_{veg}$), and Surface Broadband Albedo ($\alpha$).
- **Authoritative Provider**: ESA Copernicus Data Space Ecosystem / AWS Open Data.
- **Direct Access URL**: [https://dataspace.copernicus.eu](https://dataspace.copernicus.eu)
- **Licence**: CC-BY-4.0.
- **Variables**: Band 2 (Blue), Band 3 (Green), Band 4 (Red), Band 8 (NIR), Band 11 (SWIR-1).
- **Expected Directory**: `dataset/raw/reflectance/`
- **Formulae**:
  - $NDVI = (B8 - B4) / (B8 + B4)$
  - $f_{veg} = ((NDVI - NDVI_{min}) / (NDVI_{max} - NDVI_{min}))^2$
  - $\alpha = 0.356 B2 + 0.130 B4 + 0.373 B8 + 0.085 B11 + 0.072$
- **Preprocessing Pipeline**: Resample B11 from 20m to 10m, mask cloud pixels via Scene Classification Layer (SCL), reproject to target UTM grid.

### C. ERA5-Land Hourly Meteorological Forcing
- **Purpose**: Provide ambient atmospheric boundary conditions for the physics surface energy balance equations.
- **Authoritative Provider**: Copernicus Climate Data Store (CDS).
- **Direct Access URL**: [https://cds.climate.copernicus.eu](https://cds.climate.copernicus.eu)
- **Licence**: Open Data.
- **Variables**:
  - `t2m`: 2m Air Temperature ($K$)
  - `ssrd`: Surface Solar Radiation Downwards ($W/m^2$)
  - `u10`, `v10`: 10m Wind Speed components ($m/s$)
  - `d2m`: 2m Dewpoint Temperature ($K$)
- **Expected Directory**: `dataset/raw/weather/`
- **Preprocessing Pipeline**: Interpolate grid points temporally to match satellite acquisition timestamp and spatially downscale using lapse rate corrections.

### D. OpenStreetMap Building Geometry & Land Use
- **Purpose**: Derive building density fraction ($f_{bldg}$), average building height ($H_{bldg}$), aerodynamic roughness length ($z_0$), and anthropogenic heat proxy ($Q_f$).
- **Authoritative Provider**: Geofabrik / OSM Overpass API.
- **Direct Access URL**: [https://download.geofabrik.de](https://download.geofabrik.de)
- **Licence**: Open Data Commons Open Database License (ODbL).
- **Expected Directory**: `dataset/raw/vector/`
- **Format**: GeoJSON / GeoPackage / Shapefile.
- **Preprocessing Pipeline**: Rasterize vector polygons onto the 10m grid to compute building area coverage fraction per cell and height weighted means.

### E. ESA WorldCover 10m
- **Purpose**: Spatial classification of land surface into trees, shrubland, grassland, cropland, built-up, bare/sparse vegetation, snow/ice, water, wetland, mangrove, moss/lichen.
- **Authoritative Provider**: ESA / ESA WorldCover Consortium.
- **Direct Access URL**: [https://esa-worldcover.org](https://esa-worldcover.org)
- **Licence**: CC-BY-4.0.
- **Expected Directory**: `dataset/raw/landcover/`
- **Preprocessing Pipeline**: Clip to study area boundary, reproject to local UTM.

---

## 3. Spatial Reference System & Grid Unification Standard

To prevent spatial misalignment and spatial leakage across model components:
- **Projection**: Universal Transverse Mercator (UTM Zone matching study area, e.g., WGS 84 / UTM zone 43N - EPSG:32643 for Delhi pilot area).
- **Grid Resolution**: 10 m × 10 m uniform grid cells.
- **Tiling Structure**: Array shape $(H, W)$ where each cell $(i, j)$ contains aligned spatial features:
  `[x, y, elevation, bldg_height, bldg_density, impervious_frac, vegetation_frac, ndvi, water_frac, albedo, emissivity, T_air, solar_rad, wind_speed, humidity, Q_f]`

---

## 4. Synthetic Development Mode Notice

When real satellite rasters are absent in local development environments, UrbanCoolSim automatically initializes high-fidelity **SYNTHETIC DEMO** spatial grids based on realistic empirical distributions of urban morphology and microclimate forcing (e.g. Connaught Place, New Delhi 10m microgrid).

All synthetic outputs are explicitly tagged with `[SYNTHETIC DEMO]` markers across the backend API, database records, UI visual indicators, and generated technical reports.
