# UrbanCoolSim Dataset Directory

Place raw and preprocessed spatial/climate datasets here.

Expected directory layout:

```text
dataset/
├── raw/
│   ├── lst/          # Landsat 8/9 LST or ECOSTRESS rasters (.tif, .nc)
│   ├── reflectance/  # Sentinel-2 surface reflectance (.tif)
│   ├── weather/      # ERA5-Land hourly meteorological forcing (.nc, .csv)
│   ├── vector/       # OpenStreetMap building footprints, roads (.geojson, .gpkg, .shp)
│   └── landcover/    # ESA WorldCover 10m LULC (.tif)
└── processed/
    └── grid_10m/     # Resampled and unified 10m x 10m spatial grid arrays (.parquet, .tif)
```

For complete instructions on sourcing, access requirements, formats, and preprocessing guidelines, consult [dataset_needs.md](../dataset_needs.md) in the project root.

## Real-world vector data for the five study areas

Before using the curated `backend/app/spatial/data/*_geo.json` examples for spatial area, cost, or GeoJSON calculations, read [`spatial_sources/README.md`](spatial_sources/README.md). Those curated files are not a provenance-verified GIS acquisition. The new `download_study_area_vectors.py` utility retrieves mapped OpenStreetMap geometries for each canonical analysis window, writes raw source snapshots plus a separately clipped analysis-window copy, and records source IDs, timestamps, licensing and feature counts. Run it only in a network-enabled environment.

```bash
python -m pip install -r dataset/requirements-spatial.txt
python dataset/download_study_area_vectors.py --areas all
python dataset/validate_spatial_data.py
```

The project analysis windows are bounding boxes, not verified official district boundaries. The dataset utilities do not fabricate replacement data when an OSM query fails.
