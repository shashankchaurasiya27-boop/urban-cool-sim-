# UrbanCoolSim: Complete Dependency & Environment Inventory

**Document ID**: `UCS-DOC-DEPENDENCY-INVENTORY-20261030`  
**Target Milestone**: Preparation for Checkpoint C3  
**Auditor / Release Engineer**: Senior Software Engineer & Supply-Chain Auditor  
**Date**: 2026-10-30  

---

## 1. System-Level Prerequisites

To build, execute, and verify UrbanCoolSim from this source distribution, the host system requires:

| Prerequisite | Minimum Version | Recommended Version | Verification Command | Notes |
| :--- | :--- | :--- | :--- | :--- |
| **Python** | `3.10` | `3.11.x` | `python3 --version` | Python 3.11 recommended for full binary wheel compatibility on macOS Apple Silicon and Linux x86_64. |
| **Node.js** | `18.17.0` | `20.x` (LTS) | `node --version` | Required by Next.js 14. |
| **npm** | `9.0.0` | `10.x` | `npm --version` | npm v7+ required for lockfileVersion 3 support. |
| **Docker & Compose** | `20.10+` / `v2.20+` | Latest Engine | `docker compose version` | Optional for local bare-metal; required for containerized deployment. |
| **C/C++ Compiler / Build Tools** | Standard | Xcode CLI / `build-essential` | `cc --version` | Required if wheels must compile C extensions (e.g., `pyproj`, `shapely`, `lightgbm`). |

---

## 2. Environment 1: Backend Python Platform

### A. Manifest Details
- **Manifest Path**: `backend/requirements.txt`
- **Total Packages Declared**: 29 packages
- **Installation Command**:
  ```bash
  python3 -m venv .venv-backend
  source .venv-backend/bin/activate
  pip install --upgrade pip
  pip install -r backend/requirements.txt
  ```
- **Purpose**: Powers the core FastAPI backend, Surface Energy Balance (SEB) physics simulation solver, NSGA-II multi-objective genetic optimization engine, LightGBM surrogate inference, ReportLab PDF generation, and spatial UTM rasterization.

### B. Core Declared Dependencies & Version Constraints
| Package | Constraint in Manifest | Installed / Tested Version | Purpose & Architecture Role |
| :--- | :--- | :--- | :--- |
| **`fastapi`** | `>=0.110.0` | `0.110.0` | High-performance asynchronous web API framework. |
| **`uvicorn[standard]`** | `>=0.28.0` | `0.28.0` | ASGI server with uvloop and httptools. |
| **`pydantic`** | `>=2.6.4` | `2.6.4` | Data validation and schema enforcement. |
| **`pydantic-settings`**| `>=2.2.1` | `2.2.1` | Type-safe environment variable parsing. |
| **`sqlalchemy`** | `>=2.0.28` | `2.0.28` | Database ORM and relational query builder. |
| **`aiosqlite`** | `>=0.20.0` | `0.20.0` | Asynchronous SQLite driver for zero-config local runs. |
| **`psycopg2-binary`** | `>=2.9.9` | `2.9.9` | PostgreSQL driver for production deployments. |
| **`asyncpg`** | `>=0.29.0` | `0.29.0` | Asynchronous PostgreSQL client library. |
| **`bcrypt`** | `==4.1.2` | `4.1.2` | Cryptographic password hashing (pinned to prevent passlib compatibility regressions). |
| **`passlib[bcrypt]`** | `>=1.7.4` | `1.7.4` | Password hashing context and verification. |
| **`pyjwt`** | `>=2.8.0` | `2.8.0` | JSON Web Token encoding and verification. |
| **`numpy`** | `>=1.26.4` | `1.26.4` | Vectorized numerical array computations. |
| **`scipy`** | `>=1.12.0` | `1.12.0` | Scientific computing, optimization & spatial distance. |
| **`pandas`** | `>=2.2.1` | `2.2.1` | Tabular data manipulation and metrics formatting. |
| **`scikit-learn`** | `>=1.4.1.post1` | `1.4.1.post1` | Preprocessing, metrics, and regression tools. |
| **`lightgbm`** | `>=4.3.0` | `4.3.0` | Fast gradient boosted tree surrogate model engine. |
| **`shap`** | `>=0.45.0` | `0.45.0` | Model explainability & feature importance charts. |
| **`pymoo`** | `>=0.6.1.1` | `0.6.1.1` | Multi-objective optimization (NSGA-II implementation). |
| **`pyproj`** | `>=3.6.0` | `3.6.1` | Cartographic projections and UTM coordinate transforms. |
| **`shapely`** | `>=2.0.0` | `2.0.3` | Planar geometry analysis and feature clipping. |
| **`rasterio`** | `>=1.3.9` | `1.3.9` | Geospatial raster data I/O. |
| **`tifffile`** | `>=2024.2.12` | `2024.2.12` | Multi-band TIFF raster storage and extraction. |
| **`reportlab`** | `>=4.1.0` | `4.1.0` | Automated PDF report generation. |
| **`matplotlib`** | `>=3.8.0` | `3.8.3` | Statistical plotting and report figure generation. |
| **`httpx`** | `>=0.27.0` | `0.27.0` | Async HTTP client for test suite API requests. |
| **`pytest`** | `>=8.1.1` | `9.1.1` | Backend testing framework. |
| **`pytest-asyncio`** | `>=0.23.6` | `0.23.6` | Asynchronous test execution runner. |

### C. Inspection Findings & Compatibility Notes
- **`bcrypt` Pinning**: `bcrypt==4.1.2` is intentionally pinned. Later bcrypt versions (v4.2.0+) deprecated internal symbols expected by `passlib 1.7.4`. The pinned version completely eliminates bcrypt runtime import warnings and errors.
- **Geospatial Stack**: `pyproj` and `shapely` require underlying C libraries (`proj` and `geos`). Pre-compiled wheels are standard on pip for macOS (arm64/x86_64) and Linux.

---

## 3. Environment 2: Spatial Data Acquisition & Processing

### A. Manifest Details
- **Manifest Paths**:
  - `dataset/requirements.txt` (General data acquisition)
  - `dataset/requirements-spatial.txt` (GIS and vector processing)
- **Installation Command**:
  ```bash
  python3 -m venv .venv-spatial
  source .venv-spatial/bin/activate
  pip install --upgrade pip
  pip install -r dataset/requirements.txt
  pip install -r dataset/requirements-spatial.txt
  ```
- **Purpose**: Used for fetching raw OpenStreetMap vector data via Overpass API, generating metric bounding analysis windows, clipping vectors to study areas, and running cryptographic spatial validation.

### B. Core Declared Dependencies
| Package | Constraint | Purpose |
| :--- | :--- | :--- |
| **`osmnx`** | `>=2.0,<3.0` | Retrieval and modeling of street networks and urban spatial data. |
| **`geopandas`** | `>=1.0,<2.0` | Spatial operations on GeoDataFrames. |
| **`shapely`** | `>=2.0,<3.0` | Geometric manipulation and topological predicate checking. |
| **`pyproj`** | `>=3.6,<4.0` | Coordinate Reference System (CRS) transformations. |
| **`requests`** | Unconstrained | HTTP requests to remote geospatial catalogs. |
| **`tqdm`** | Unconstrained | Terminal progress indicators for bulk downloads. |
| **`pystac-client`** | Unconstrained | SpatioTemporal Asset Catalog (STAC) client. |
| **`planetary-computer`**| Unconstrained | Authentication & access to Microsoft Planetary Computer assets. |
| **`boto3`** | Unconstrained | AWS S3 client for satellite data access. |
| **`cdsapi`** | Unconstrained | Copernicus Climate Data Store API client for ERA5 data. |
| **`earthaccess`** | Unconstrained | NASA Earthdata search and download client. |

---

## 4. Environment 3: Frontend Web Application

### A. Manifest Details
- **Manifest Path**: `frontend/package.json`
- **Lockfile Path**: `frontend/package-lock.json` (Lockfile Version 3, 787 packages)
- **Installation Command**:
  ```bash
  cd frontend
  npm ci
  # Or: npm install
  ```
- **Build & Execution Commands**:
  ```bash
  npm run build     # Compiles Next.js production bundle
  npm run start     # Starts Next.js production server on port 3000
  npm run dev       # Starts Next.js development server with hot-reload
  npm run lint      # Runs ESLint checks
  ```
- **Purpose**: Next.js 14 React client interface providing interactive 2D/3D thermal maps, real-time cooling intervention modeling, Pareto optimization controls, and PDF report downloads.

### B. Core Declared Dependencies
| Dependency | Version Constraint in `package.json` | Purpose |
| :--- | :--- | :--- |
| **`next`** | `^14.2.35` | React application framework with App Router & SSR. |
| **`react`** / **`react-dom`** | `^18.2.0` | React core libraries. |
| **`deck.gl`** | `^9.3.10` | WebGL-powered 3D geospatial data visualization framework. |
| **`@deck.gl/mapbox`** | `^9.3.10` | Mapbox/MapLibre integration layer for Deck.gl. |
| **`maplibre-gl`** | `^4.1.0` | Open-source vector tile map client. |
| **`three`** | `^0.185.1` | 3D graphics rendering engine for landing page hero canvas. |
| **`@types/three`** | `^0.185.4` | TypeScript type declarations for Three.js. |
| **`framer-motion`** | `^11.0.8` | Declarative UI animations and transitions. |
| **`recharts`** | `^2.12.2` | Data charting library for energy flux & scatter plots. |
| **`lucide-react`** | `^0.354.0` | Iconography suite. |
| **`tailwindcss`** | `^3.4.1` | Utility-first CSS styling framework. |
| **`typescript`** | `^5.4.2` | Static type checker. |

---

## 5. Dependency Audit & Discrepancy Findings

1. **Undeclared Imports**: None. Every third-party Python module imported in `backend/app/` and `backend/tests/` is accounted for in `backend/requirements.txt`.
2. **Lockfile Synchronization**: `frontend/package-lock.json` is fully in sync with `frontend/package.json`.
3. **No Bundled Dependencies**: No virtual environments, `.next` bundles, or `node_modules` folders are packaged in the distribution release. All environments can be cleanly reconstituted using the commands documented above.

