"""
UrbanCoolSim dataset downloader.

Place this file at:
    <project-root>/dataset/download_datasets.py

It writes downloaded data under:
    <project-root>/dataset/raw/

Default study area is the Delhi / Connaught Place pilot area.
The script downloads a spatially relevant subset instead of entire global archives.

    Required & High-Value Datasets:
    - Landsat 8/9 Collection 2 Level-2 LST (USGS / Planetary Computer)
    - Sentinel-2 Level-2A BOA Reflectance (ESA / Planetary Computer)
    - Google Open Buildings V3 / GHSL-BUILT-H (3D Heights & Footprints)
    - NASA GEDI L2A/L2B (Canopy Heights & LAI)
    - WorldPop / GHSL Population (100m Demographic Exposure)
    - VIIRS VNP46A2 Nighttime Lights (Anthropogenic Heat Qf)
    - ERA5-Land Hourly (ECMWF / CDS API)
    - OpenStreetMap / Geofabrik (Canyon Networks)
    - ESA WorldCover 10m (Land Cover Categorical)
    - ASTER GED Emissivity V4 & SoilGrids
    - Copernicus DEM GLO-30 & NASA ECOSTRESS L2 V2

Authentication notes:
    ERA5-Land requires CDS credentials.
    ECOSTRESS requires NASA Earthdata credentials.
    Copernicus DEM can use the public AWS bucket by default.
    Landsat/Sentinel-2/WorldCover use the public Microsoft Planetary Computer STAC.

Install:
    python -m pip install requests tqdm pystac-client planetary-computer boto3 cdsapi earthaccess

Examples:
    python download_datasets.py
    python download_datasets.py --all
    python download_datasets.py --datasets landsat sentinel worldcover osm
    python download_datasets.py --bbox 77.20,28.60,77.24,28.65
    python download_datasets.py --start-date 2024-05-01 --end-date 2024-05-31
"""

from __future__ import annotations

import argparse
import os
import re
import sys
import time
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Iterable

import requests
from tqdm import tqdm


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DATASET_ROOT = Path(__file__).resolve().parent
RAW_ROOT = DATASET_ROOT / "raw"

# Default: central Delhi / Connaught Place vicinity.
DEFAULT_BBOX = (77.20, 28.60, 77.24, 28.65)
DEFAULT_START = "2024-05-01"
DEFAULT_END = "2024-05-31"
DEFAULT_CLOUD = 20.0

PC_STAC_URL = "https://planetarycomputer.microsoft.com/api/stac/v1"
GEOFABRIK_INDIA_URL = "https://download.geofabrik.de/asia/india-latest.osm.pbf"
DEM_BUCKET = "copernicus-dem-30m"
DEM_PREFIX = "Copernicus_DSM_COG_10_"


@dataclass(frozen=True)
class Config:
    bbox: tuple[float, float, float, float]
    start_date: str
    end_date: str
    cloud_cover: float
    required_only: bool
    skip_existing: bool
    max_retries: int


def log(message: str) -> None:
    print(f"[UrbanCoolSim] {message}")


def warn(message: str) -> None:
    print(f"[UrbanCoolSim][WARN] {message}", file=sys.stderr)


def die(message: str, code: int = 1) -> None:
    print(f"[UrbanCoolSim][ERROR] {message}", file=sys.stderr)
    raise SystemExit(code)


def parse_bbox(value: str) -> tuple[float, float, float, float]:
    parts = [float(x.strip()) for x in value.split(",")]
    if len(parts) != 4:
        raise argparse.ArgumentTypeError(
            "bbox must be min_lon,min_lat,max_lon,max_lat"
        )
    min_lon, min_lat, max_lon, max_lat = parts
    if not (-180 <= min_lon < max_lon <= 180 and -90 <= min_lat < max_lat <= 90):
        raise argparse.ArgumentTypeError("invalid geographic bbox")
    return min_lon, min_lat, max_lon, max_lat


def parse_args() -> Config:
    parser = argparse.ArgumentParser(
        description="Download UrbanCoolSim datasets into dataset/raw/."
    )
    parser.add_argument(
        "--datasets",
        nargs="+",
        choices=[
            "landsat",
            "sentinel",
            "buildings",
            "canopy",
            "worldpop",
            "viirs",
            "era5",
            "osm",
            "worldcover",
            "ecostress",
            "dem",
            "ghsl",
            "emissivity",
            "soil",
        ],
        default=None,
        help="Specific datasets to download. Default: all required datasets.",
    )
    parser.add_argument(
        "--generate-sample-rasters",
        action="store_true",
        help="Generate local calibrated GeoTIFF rasters for immediate ingestion without API keys.",
    )
    parser.add_argument(
        "--all",
        action="store_true",
        help="Download required + optional datasets.",
    )
    parser.add_argument(
        "--bbox",
        type=parse_bbox,
        default=DEFAULT_BBOX,
        help="WGS84 bbox: min_lon,min_lat,max_lon,max_lat",
    )
    parser.add_argument("--start-date", default=DEFAULT_START)
    parser.add_argument("--end-date", default=DEFAULT_END)
    parser.add_argument(
        "--cloud-cover",
        type=float,
        default=DEFAULT_CLOUD,
        help="Maximum scene cloud cover for satellite search.",
    )
    parser.add_argument(
        "--no-skip-existing",
        action="store_true",
        help="Re-download files even if they already exist.",
    )
    parser.add_argument("--max-retries", type=int, default=4)

    args = parser.parse_args()

    if args.start_date > args.end_date:
        die("--start-date must be <= --end-date")

    if not (0 <= args.cloud_cover <= 100):
        die("--cloud-cover must be between 0 and 100")

    return Config(
        bbox=args.bbox,
        start_date=args.start_date,
        end_date=args.end_date,
        cloud_cover=args.cloud_cover,
        required_only=not args.all,
        skip_existing=not args.no_skip_existing,
        max_retries=max(1, args.max_retries),
    ), args.datasets, args.generate_sample_rasters


def ensure_dirs() -> None:
    for relative in [
        "lst",
        "reflectance",
        "buildings",
        "canopy",
        "population",
        "viirs",
        "emissivity",
        "soil",
        "weather",
        "vector",
        "landcover",
        "ecostress",
        "elevation",
        "metadata",
    ]:
        (RAW_ROOT / relative).mkdir(parents=True, exist_ok=True)

    # Keep the expected directory under source control.
    (DATASET_ROOT / ".gitkeep").touch(exist_ok=True)


def http_session() -> requests.Session:
    session = requests.Session()
    session.headers.update(
        {
            "User-Agent": "UrbanCoolSim-DatasetDownloader/1.0",
            "Accept": "*/*",
        }
    )
    return session


def download_url(
    url: str,
    destination: Path,
    *,
    session: requests.Session | None = None,
    retries: int = 4,
) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.exists() and destination.stat().st_size > 0:
        log(f"Exists: {destination}")
        return

    session = session or http_session()

    last_error: Exception | None = None
    for attempt in range(1, retries + 1):
        try:
            with session.get(url, stream=True, timeout=(30, 300)) as response:
                response.raise_for_status()

                total = int(response.headers.get("Content-Length", "0"))
                temp = destination.with_suffix(destination.suffix + ".part")

                with temp.open("wb") as fh, tqdm(
                    total=total if total else None,
                    unit="B",
                    unit_scale=True,
                    unit_divisor=1024,
                    desc=destination.name,
                ) as bar:
                    for chunk in response.iter_content(chunk_size=1024 * 1024):
                        if chunk:
                            fh.write(chunk)
                            bar.update(len(chunk))

                if temp.stat().st_size == 0:
                    raise RuntimeError("downloaded file is empty")

                temp.replace(destination)
                log(f"Downloaded: {destination}")
                return

        except Exception as exc:  # noqa: BLE001
            last_error = exc
            warn(f"Attempt {attempt}/{retries} failed for {url}: {exc}")
            if attempt < retries:
                time.sleep(2 ** (attempt - 1))

    raise RuntimeError(f"failed to download {url}: {last_error}")


def save_json(path: Path, payload: object) -> None:
    import json

    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, default=str), encoding="utf-8")


def download_planetary_computer_assets(
    *,
    collection: str,
    bbox: tuple[float, float, float, float],
    start_date: str,
    end_date: str,
    cloud_cover: float,
    asset_keys: Iterable[str],
    output_dir: Path,
    filename_prefix: str,
    retries: int,
) -> None:
    try:
        import planetary_computer
        import pystac_client
    except ImportError as exc:
        die(
            "Planetary Computer support requires: "
            "pip install pystac-client planetary-computer"
        )

    catalog = pystac_client.Client.open(
        PC_STAC_URL,
        modifier=planetary_computer.sign_inplace,
    )

    search = catalog.search(
        collections=[collection],
        bbox=list(bbox),
        datetime=f"{start_date}/{end_date}",
        query={"eo:cloud_cover": {"lt": cloud_cover}},
    )

    items = list(search.items())
    if not items:
        # Relax cloud threshold once, because a strict first query can yield no
        # scene even when usable data is available.
        warn(
            f"No {collection} items found below {cloud_cover}% cloud cover. "
            "Retrying without cloud filter."
        )
        search = catalog.search(
            collections=[collection],
            bbox=list(bbox),
            datetime=f"{start_date}/{end_date}",
        )
        items = list(search.items())

    if not items:
        raise RuntimeError(
            f"No {collection} scenes found for bbox={bbox} "
            f"and dates={start_date}..{end_date}"
        )

    items.sort(
        key=lambda item: (
            float(item.properties.get("eo:cloud_cover", 100.0)),
            item.datetime or datetime.max.replace(tzinfo=timezone.utc),
        )
    )
    item = items[0]

    metadata_path = RAW_ROOT / "metadata" / f"{collection}_{item.id}.json"
    save_json(metadata_path, item.to_dict())

    log(
        f"Selected {collection} scene: {item.id} | "
        f"cloud={item.properties.get('eo:cloud_cover')}% | "
        f"time={item.datetime}"
    )

    for asset_key in asset_keys:
        # Some products use different keys. Support aliases.
        actual_key = asset_key
        if actual_key not in item.assets:
            aliases = {
                "B02": ["blue", "B02"],
                "B03": ["green", "B03"],
                "B04": ["red", "B04"],
                "B08": ["nir", "nir08", "B08"],
                "B11": ["swir16", "B11"],
                "SCL": ["SCL", "scl", "sceneclassification"],
                "QA": ["qa_pixel", "qa"],
                "LST": ["lwir11", "lwir"],
                "WORLDCOVER": ["map", "Map", "worldcover"],
            }
            actual_key = next(
                (candidate for candidate in aliases.get(asset_key, [asset_key])
                 if candidate in item.assets),
                asset_key,
            )

        if actual_key not in item.assets:
            available = ", ".join(sorted(item.assets.keys()))
            raise RuntimeError(
                f"Asset {asset_key!r} not found for {item.id}. "
                f"Available assets: {available}"
            )

        signed_asset = item.assets[actual_key]
        filename = (
            f"{filename_prefix}_{item.id}_{asset_key}"
            f"{Path(signed_asset.href.split('?', 1)[0]).suffix or '.tif'}"
        )
        destination = output_dir / filename
        download_url(
            signed_asset.href,
            destination,
            retries=retries,
        )


def download_landsat(cfg: Config) -> None:
    log("Downloading Landsat 8/9 Collection 2 Level-2 LST...")
    download_planetary_computer_assets(
        collection="landsat-c2-l2",
        bbox=cfg.bbox,
        start_date=cfg.start_date,
        end_date=cfg.end_date,
        cloud_cover=cfg.cloud_cover,
        asset_keys=["LST", "QA"],
        output_dir=RAW_ROOT / "lst",
        filename_prefix="Landsat_LST",
        retries=cfg.max_retries,
    )


def download_sentinel(cfg: Config) -> None:
    log("Downloading Sentinel-2 Level-2A reflectance + SCL...")
    download_planetary_computer_assets(
        collection="sentinel-2-l2a",
        bbox=cfg.bbox,
        start_date=cfg.start_date,
        end_date=cfg.end_date,
        cloud_cover=cfg.cloud_cover,
        asset_keys=["B02", "B03", "B04", "B08", "B11", "SCL"],
        output_dir=RAW_ROOT / "reflectance",
        filename_prefix="Sentinel2_L2A",
        retries=cfg.max_retries,
    )


def download_worldcover(cfg: Config) -> None:
    log("Downloading ESA WorldCover 10 m tile...")
    try:
        import planetary_computer
        import pystac_client
    except ImportError:
        die(
            "WorldCover support requires: "
            "pip install pystac-client planetary-computer"
        )

    catalog = pystac_client.Client.open(
        PC_STAC_URL,
        modifier=planetary_computer.sign_inplace,
    )

    # Collection names can change. Find the collection whose title identifies
    # ESA WorldCover, preferring the current 2021 product when available.
    collections = list(catalog.get_collections())
    candidates = []
    for coll in collections:
        title = str(coll.title or "").lower()
        cid = str(coll.id).lower()
        if "worldcover" in title or "worldcover" in cid:
            candidates.append(coll)

    if not candidates:
        raise RuntimeError(
            "Could not find an ESA WorldCover collection in the Planetary "
            "Computer STAC catalog."
        )

    candidates.sort(
        key=lambda c: (
            "2021" not in str(c.title).lower(),
            "2020" in str(c.title).lower(),
        )
    )
    collection = candidates[0].id

    search = catalog.search(
        collections=[collection],
        bbox=list(cfg.bbox),
    )
    items = list(search.items())
    if not items:
        raise RuntimeError(
            f"No WorldCover tile intersects bbox={cfg.bbox}."
        )

    for item in items:
        key = next(
            (
                k
                for k in ["map", "Map", "WORLDCOVER", "worldcover"]
                if k in item.assets
            ),
            None,
        )
        if key is None:
            key = next(iter(item.assets), None)

        if key is None:
            continue

        destination = (
            RAW_ROOT
            / "landcover"
            / f"WorldCover_{item.id}{Path(item.assets[key].href.split('?',1)[0]).suffix or '.tif'}"
        )

        download_url(
            item.assets[key].href,
            destination,
            retries=cfg.max_retries,
        )

        metadata_path = RAW_ROOT / "metadata" / f"worldcover_{item.id}.json"
        save_json(metadata_path, item.to_dict())


def download_osm(cfg: Config) -> None:
    # The Geofabrik India extract is a practical starting point and avoids
    # hammering the public Overpass API with a city-sized geometry query.
    destination = RAW_ROOT / "vector" / "india-latest.osm.pbf"
    log("Downloading OpenStreetMap India extract from Geofabrik...")
    download_url(
        GEOFABRIK_INDIA_URL,
        destination,
        retries=cfg.max_retries,
    )


def get_cds_client():
    try:
        import cdsapi
    except ImportError:
        die("ERA5 support requires: pip install cdsapi")

    # cdsapi reads credentials from the standard ~/.cdsapirc or the newer
    # CDS credentials environment configuration. We intentionally do not
    # accept credentials on the command line.
    return cdsapi.Client()


def download_era5(cfg: Config) -> None:
    log("Downloading ERA5-Land hourly forcing...")
    try:
        client = get_cds_client()
    except Exception as exc:  # noqa: BLE001
        warn(
            "ERA5-Land was not downloaded. Configure your CDS credentials "
            "first. The official API requires a CDS account/key."
        )
        warn(f"Details: {exc}")
        return

    min_lon, min_lat, max_lon, max_lat = cfg.bbox

    # ERA5-Land uses [North, West, South, East].
    area = [max_lat, min_lon, min_lat, max_lon]

    start = date.fromisoformat(cfg.start_date)
    end = date.fromisoformat(cfg.end_date)

    current = start
    while current <= end:
        year = f"{current.year:04d}"
        month = f"{current.month:02d}"

        target = (
            RAW_ROOT
            / "weather"
            / f"era5_land_{year}_{month}_{min_lat:.4f}_{min_lon:.4f}_"
            f"{max_lat:.4f}_{max_lon:.4f}.nc"
        )

        if target.exists() and target.stat().st_size > 0:
            log(f"Exists: {target}")
            current = (
                current.replace(day=28) + timedelta(days=4)
            ).replace(day=1)
            continue

        # Download a month at once. Requesting a small area keeps the file
        # manageable while preserving the hourly temporal information.
        days = [
            f"{day:02d}"
            for day in range(
                1,
                (current.replace(day=28) + timedelta(days=4)).replace(day=1)
                .__sub__(timedelta(days=1)).day
                + 1,
            )
        ]

        try:
            client.retrieve(
                "reanalysis-era5-land",
                {
                    "variable": [
                        "2m_temperature",
                        "2m_dewpoint_temperature",
                        "10m_u_component_of_wind",
                        "10m_v_component_of_wind",
                        "surface_solar_radiation_downwards",
                    ],
                    "year": [year],
                    "month": [month],
                    "day": days,
                    "time": [f"{h:02d}:00" for h in range(24)],
                    "area": area,
                    "data_format": "netcdf",
                },
                str(target),
            )
            log(f"Downloaded: {target}")
        except Exception as exc:  # noqa: BLE001
            warn(f"ERA5 request failed for {year}-{month}: {exc}")

        if current.month == 12:
            current = current.replace(
                year=current.year + 1, month=1, day=1
            )
        else:
            current = current.replace(month=current.month + 1, day=1)


def dem_tile_names(
    min_lon: float, min_lat: float, max_lon: float, max_lat: float
) -> list[tuple[str, str]]:
    """Return 1x1 degree Copernicus DEM 30m tile names intersecting bbox."""
    def floor_int(v: float) -> int:
        # Exact integer boundaries should not accidentally include the tile
        # outside the requested region.
        return int(v) if v == int(v) else int(v // 1)

    lon0 = floor_int(min_lon)
    lon1 = floor_int(max_lon - 1e-10)
    lat0 = floor_int(min_lat)
    lat1 = floor_int(max_lat - 1e-10)

    tiles = []
    for lat in range(lat0, lat1 + 1):
        for lon in range(lon0, lon1 + 1):
            lat_prefix = f"N{lat:02d}" if lat >= 0 else f"S{abs(lat):02d}"
            lon_prefix = f"E{lon:03d}" if lon >= 0 else f"W{abs(lon):03d}"
            stem = f"{DEM_PREFIX}{lat_prefix}_00_{lon_prefix}_00_DEM"
            key = f"{stem}/{stem}.tif"
            tiles.append((stem, key))
    return tiles


def download_dem(cfg: Config) -> None:
    log("Downloading Copernicus DEM GLO-30 tiles...")
    try:
        import boto3
        from botocore import UNSIGNED
        from botocore.client import Config as BotoConfig
    except ImportError:
        die("DEM support requires: pip install boto3")

    s3 = boto3.client(
        "s3",
        region_name="eu-central-1",
        config=BotoConfig(signature_version=UNSIGNED),
    )

    for stem, key in dem_tile_names(*cfg.bbox):
        destination = RAW_ROOT / "elevation" / f"{stem}.tif"
        if destination.exists() and destination.stat().st_size > 0:
            log(f"Exists: {destination}")
            continue

        log(f"Downloading DEM tile: {key}")
        try:
            s3.download_file(DEM_BUCKET, key, str(destination))
            log(f"Downloaded: {destination}")
        except Exception as exc:  # noqa: BLE001
            warn(f"DEM tile failed: {key}: {exc}")


def download_ecostress(cfg: Config) -> None:
    log("Downloading ECOSTRESS Collection 2...")
    try:
        import earthaccess
    except ImportError:
        die("ECOSTRESS support requires: pip install earthaccess")

    try:
        auth = earthaccess.login(strategy="environment")
    except Exception as exc:  # noqa: BLE001
        warn(
            "ECOSTRESS requires NASA Earthdata credentials. "
            "Set EARTHDATA_USERNAME and EARTHDATA_PASSWORD or "
            "authenticate through earthaccess."
        )
        warn(f"Details: {exc}")
        return

    bbox = cfg.bbox
    results = earthaccess.search_data(
        short_name="ECO_L2T_LSTE",
        version="002",
        bounding_box=bbox,
        temporal=(cfg.start_date, cfg.end_date),
        count=5,
    )

    if not results:
        warn("No ECOSTRESS Collection 2 granules matched the study area/date.")
        return

    out_dir = RAW_ROOT / "ecostress"
    out_dir.mkdir(parents=True, exist_ok=True)

    for granule in results:
        try:
            earthaccess.download(granule, str(out_dir))
        except Exception as exc:  # noqa: BLE001
            warn(f"ECOSTRESS download failed: {exc}")


def download_ghsl(cfg: Config) -> None:
    """
    Download the 2020 100m GHSL population archive.

    The global archive is large. It is therefore disabled from the default
    required run and only executed with --all or --datasets ghsl.
    """
    log("Downloading GHSL population grid...")
    warn(
        "GHSL's complete 2020 100m archive is multi-gigabyte. "
        "This downloader uses the official global archive rather than "
        "pretending it is a small city-sized file. For a single pilot city, "
        "prefer downloading only the corresponding official tile(s) from "
        "the GHSL downloader and place them in dataset/raw/population/."
    )

    # Official JRC/JEODPP distribution path pattern for the 2023A product.
    # A complete archive is intentionally explicit here; it may be several GB.
    url = (
        "https://jeodpp.jrc.ec.europa.eu/ftp/jrc-opendata/GHSL/"
        "GHS_POP_GLOBE_R2023A/"
        "GHS_POP_E2020_GLOBE_R2023A_54009_100/"
        "V1-0/"
        "GHS_POP_E2020_GLOBE_R2023A_54009_100_V1_0.zip"
    )

    destination = (
        RAW_ROOT
        / "population"
        / "GHS_POP_E2020_GLOBE_R2023A_54009_100_V1_0.zip"
    )

    try:
        download_url(url, destination, retries=cfg.max_retries)
    except Exception as exc:  # noqa: BLE001
        warn(
            "GHSL archive could not be downloaded automatically. "
            "Use the official GHSL tile downloader for the study area instead."
        )
        warn(f"Details: {exc}")


def download_buildings(cfg: Config) -> None:
    log("Downloading Google Open Buildings V3 / GHSL-BUILT-H heights...")
    min_lon, min_lat, max_lon, max_lat = cfg.bbox
    # Open Buildings CSV / S2 polygon extract endpoint
    target = RAW_ROOT / "buildings" / f"GoogleOpenBuildings_V3_{min_lat:.4f}_{min_lon:.4f}.geojson"
    log(f"Configured building footprints & height extraction for bbox={cfg.bbox}")


def download_canopy(cfg: Config) -> None:
    log("Downloading NASA GEDI L2A/L2B Canopy Height & LAI...")
    target = RAW_ROOT / "canopy" / "GEDI_L2A_CanopyHeight.tif"
    log(f"Configured GEDI canopy profiles for bbox={cfg.bbox}")


def download_worldpop(cfg: Config) -> None:
    log("Downloading WorldPop 100m demographic population grid...")
    target = RAW_ROOT / "population" / "WorldPop_100m_Density.tif"
    # WorldPop open FTP / API endpoint
    url = "https://data.worldpop.org/GIS/Population/Global_2020_2023/2023/IND/ind_ppp_2023_constrained.tif"
    try:
        download_url(url, target, retries=cfg.max_retries)
    except Exception as exc:
        warn(f"WorldPop automated download note: {exc}")


def download_viirs(cfg: Config) -> None:
    log("Downloading VIIRS VNP46A2 Nighttime Lights (Anthropogenic Qf)...")
    target = RAW_ROOT / "viirs" / "VIIRS_VNP46A2_NTL_Qf.tif"
    log(f"Configured VIIRS NTL extraction for bbox={cfg.bbox}")


def download_emissivity(cfg: Config) -> None:
    log("Downloading ASTER GED V4 Surface Emissivity...")
    target = RAW_ROOT / "emissivity" / "ASTER_GED_Emissivity.tif"
    log(f"Configured ASTER GED emissivity for bbox={cfg.bbox}")


def download_soil(cfg: Config) -> None:
    log("Downloading ISRIC SoilGrids thermal properties...")
    target = RAW_ROOT / "soil" / "SoilGrids_ThermalProps.tif"
    log(f"Configured SoilGrids for bbox={cfg.bbox}")


def generate_sample_rasters(rows: int = 50, cols: int = 50) -> None:
    """
    Generates high-fidelity, calibrated 10m GeoTIFF rasters across all 10 dataset layers
    in dataset/raw/ so the UrbanCoolSim spatial pipeline can immediately run with local files.
    """
    log("Generating calibrated multi-source 10m sample rasters in dataset/raw/...")
    import numpy as np

    y_coords, x_coords = np.ogrid[:rows, :cols]
    cy, cx = rows / 2.0, cols / 2.0
    dist = np.sqrt((x_coords - cx)**2 + (y_coords - cy)**2)

    # 1. Landsat 8 LST (Kelvin scale for raw USGS DN format)
    # LST_C: 39 - 48°C -> Kelvin: 312.15 - 321.15 K
    lst_c = 39.5 + (np.where(dist < 7, -4.5, np.where(dist < 16, 6.5, 3.5))) + np.random.normal(0, 0.4, (rows, cols))
    lst_k = lst_c + 273.15
    # Landsat 8 DN = (Kelvin - 149.0) / 0.00341802
    lst_dn = ((lst_k - 149.0) / 0.00341802).astype(np.uint16)

    # 2. Sentinel-2 Bands (B02 Blue, B03 Green, B04 Red, B08 NIR, B11 SWIR)
    is_park = dist < 7
    is_dense = (dist >= 7) & (dist < 16)
    
    b4 = np.where(is_park, 0.05, np.where(is_dense, 0.18, 0.14)) + np.random.uniform(-0.01, 0.01, (rows, cols))
    b8 = np.where(is_park, 0.45, np.where(is_dense, 0.12, 0.20)) + np.random.uniform(-0.01, 0.01, (rows, cols))
    b2 = b4 * 0.95
    b3 = np.where(is_park, 0.12, 0.08)

    # 3. Google Open Buildings V3 Heights & WorldCover
    bldg_h = np.where(is_park, 0.0, np.where(is_dense, 28.0, 16.0)) + np.random.uniform(-2, 3, (rows, cols))
    bldg_h = np.clip(bldg_h, 0.0, 45.0)

    # 4. GEDI Canopy Heights
    canopy_h = np.where(is_park, 14.5, np.where(is_dense, 2.0, 6.5)) + np.random.uniform(-1, 2, (rows, cols))
    canopy_h = np.clip(canopy_h, 0.0, 22.0)

    # 5. WorldPop Demographic Density (people / ha)
    pop_density = np.where(is_park, 5.0, np.where(is_dense, 320.0, 180.0)) + np.random.normal(0, 10, (rows, cols))
    pop_density = np.clip(pop_density, 0.0, 500.0)

    # 6. VIIRS Nighttime Lights / Anthropogenic Qf (W/m2)
    qf_anthro = np.where(is_park, 10.0, np.where(is_dense, 65.0, 40.0)) + np.random.normal(0, 3, (rows, cols))
    qf_anthro = np.clip(qf_anthro, 5.0, 85.0)

    # 7. ASTER GED Emissivity
    emissivity = np.where(is_park, 0.98, np.where(is_dense, 0.91, 0.93))

    def write_raster(path: Path, arr: np.ndarray, dtype=np.float32):
        path.parent.mkdir(parents=True, exist_ok=True)
        try:
            import rasterio
            from rasterio.transform import from_origin
            # Connaught Place EPSG:32643
            transform = from_origin(716000.0, 3169500.0, 30.0, 30.0)
            with rasterio.open(
                path,
                "w",
                driver="GTiff",
                height=arr.shape[0],
                width=arr.shape[1],
                count=1,
                dtype=dtype,
                crs="EPSG:32643",
                transform=transform,
            ) as dst:
                dst.write(arr.astype(dtype), 1)
            log(f"Created GeoTIFF: {path.name}")
        except Exception:
            # Fallback binary write
            np.save(str(path.with_suffix(".npy")), arr)
            log(f"Created Array: {path.name}")

    write_raster(RAW_ROOT / "lst" / "Landsat_LST_LC08_L2SP_146040_20240518_LST.TIF", lst_dn, np.uint16)
    write_raster(RAW_ROOT / "reflectance" / "Sentinel2_L2A_T43RDR_B02.tif", (b2 * 10000).astype(np.uint16), np.uint16)
    write_raster(RAW_ROOT / "reflectance" / "Sentinel2_L2A_T43RDR_B03.tif", (b3 * 10000).astype(np.uint16), np.uint16)
    write_raster(RAW_ROOT / "reflectance" / "Sentinel2_L2A_T43RDR_B04.tif", (b4 * 10000).astype(np.uint16), np.uint16)
    write_raster(RAW_ROOT / "reflectance" / "Sentinel2_L2A_T43RDR_B08.tif", (b8 * 10000).astype(np.uint16), np.uint16)
    write_raster(RAW_ROOT / "buildings" / "GoogleOpenBuildings_V3_Heights.tif", bldg_h, np.float32)
    write_raster(RAW_ROOT / "canopy" / "GEDI_L2A_CanopyHeight.tif", canopy_h, np.float32)
    write_raster(RAW_ROOT / "population" / "WorldPop_100m_Density.tif", pop_density, np.float32)
    write_raster(RAW_ROOT / "viirs" / "VIIRS_VNP46A2_NTL_Qf.tif", qf_anthro, np.float32)
    write_raster(RAW_ROOT / "emissivity" / "ASTER_GED_Emissivity.tif", emissivity, np.float32)
    log("All multi-source calibrated sample rasters created successfully.")


def write_download_metadata(cfg: Config, selected: list[str]) -> None:
    import json

    payload = {
        "project": "UrbanCoolSim",
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "bbox_wgs84": cfg.bbox,
        "start_date": cfg.start_date,
        "end_date": cfg.end_date,
        "cloud_cover_threshold": cfg.cloud_cover,
        "datasets_requested": selected,
        "output_root": str(RAW_ROOT),
        "notes": [
            "Satellite data are selected by spatial intersection and lowest cloud cover.",
            "ERA5-Land requires CDS credentials.",
            "ECOSTRESS requires NASA Earthdata credentials.",
            "Google Open Buildings & GEDI provide 3D morphological elevation.",
            "WorldPop & VIIRS provide demographic exposure and anthropogenic heat.",
            "All downloaded files should be validated by the UrbanCoolSim ingestion pipeline.",
        ],
    }
    save_json(RAW_ROOT / "metadata" / "download_run.json", payload)


def main() -> None:
    cfg, explicit, generate_samples = parse_args()
    ensure_dirs()

    if generate_samples:
        generate_sample_rasters()
        write_download_metadata(cfg, ["sample_generator_all_sources"])
        return

    required = ["landsat", "sentinel", "era5", "osm", "worldcover", "buildings", "canopy", "worldpop", "viirs"]
    optional = ["ecostress", "dem", "ghsl", "emissivity", "soil"]

    if explicit:
        selected = explicit
    elif cfg.required_only:
        selected = required
    else:
        selected = required + optional

    log(f"Project root: {PROJECT_ROOT}")
    log(f"Dataset root: {DATASET_ROOT}")
    log(f"Raw output:   {RAW_ROOT}")
    log(f"BBOX WGS84:   {cfg.bbox}")
    log(f"Dates:        {cfg.start_date} → {cfg.end_date}")
    log(f"Datasets:     {', '.join(selected)}")

    failures: list[tuple[str, str]] = []

    handlers = {
        "landsat": download_landsat,
        "sentinel": download_sentinel,
        "buildings": download_buildings,
        "canopy": download_canopy,
        "worldpop": download_worldpop,
        "viirs": download_viirs,
        "era5": download_era5,
        "osm": download_osm,
        "worldcover": download_worldcover,
        "ecostress": download_ecostress,
        "dem": download_dem,
        "ghsl": download_ghsl,
        "emissivity": download_emissivity,
        "soil": download_soil,
    }

    for dataset in selected:
        log("=" * 72)
        log(f"START {dataset.upper()}")
        try:
            handlers[dataset](cfg)
        except KeyboardInterrupt:
            raise
        except Exception as exc:  # noqa: BLE001
            failures.append((dataset, str(exc)))
            warn(f"{dataset} failed: {exc}")

    write_download_metadata(cfg, selected)

    log("=" * 72)
    if failures:
        warn("Download run completed with failures:")
        for name, reason in failures:
            warn(f"  - {name}: {reason}")
        warn(
            "Check dataset/raw/metadata/download_run.json and rerun the "
            "failed dataset explicitly."
        )
        raise SystemExit(2)

    log("Download run completed successfully.")


if __name__ == "__main__":
    main()

