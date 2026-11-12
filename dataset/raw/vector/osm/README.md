# OSM vector snapshot location

**No real OSM GeoJSON snapshot was downloaded in the preparation session.** This folder contains only this status note until `dataset/download_study_area_vectors.py` is run from a network-enabled environment.

Run from project root:

```bash
python -m pip install -r dataset/requirements-spatial.txt
python dataset/download_study_area_vectors.py --areas all
python dataset/validate_spatial_data.py
```

The generated `*_features.geojson` files are OSM source snapshots; `dataset/processed/spatial_vectors/*_features_clipped.geojson` files are clipped to the configured model analysis-window boxes. Neither file type establishes an official municipal boundary. OSM is licensed under ODbL; retain `© OpenStreetMap contributors` attribution and the generated manifest.
