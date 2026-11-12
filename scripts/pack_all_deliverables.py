import os
import hashlib
import zipfile
from pathlib import Path

workspace = Path(__file__).resolve().parents[1]
artifacts_dir = workspace / "artifacts" / "antigravity_verification_20261026_002500"
handoff_dir = workspace / "artifacts" / "handoff"
handoff_dir.mkdir(parents=True, exist_ok=True)

manifest_path = artifacts_dir / "ANTIGRAVITY_SHA256_MANIFEST.txt"

# 1. First rebuild UrbanCoolSim_Shareable_Full_Project.zip in root
shareable_zip = workspace / "UrbanCoolSim_Shareable_Full_Project.zip"
if shareable_zip.exists():
    shareable_zip.unlink()

exclude_dirs = {
    "node_modules", ".next", ".venv-backend", ".venv-spatial", "venv",
    ".pytest_cache", "__pycache__", ".git"
}
exclude_extensions = {".pyc", ".pyo", ".pyd", ".DS_Store"}

print("Building UrbanCoolSim_Shareable_Full_Project.zip...")
with zipfile.ZipFile(shareable_zip, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
    for root, dirs, files in os.walk(workspace):
        # Filter directories in place
        dirs[:] = [d for d in dirs if d not in exclude_dirs and not d.startswith(".venv")]
        for file in files:
            if file.endswith(".zip") or file in exclude_extensions:
                continue
            abs_path = Path(root) / file
            rel_path = abs_path.relative_to(workspace)
            arcname = str(Path("UrbanCoolSim-main") / rel_path)
            zf.write(abs_path, arcname)

print(f"Built {shareable_zip.name}: {shareable_zip.stat().st_size:,} bytes")

# 2. Rebuild UrbanCoolSim_C2_Verified_Project.zip
c2_verified_zip = handoff_dir / "UrbanCoolSim_C2_Verified_Project.zip"
if c2_verified_zip.exists():
    c2_verified_zip.unlink()

print("Building UrbanCoolSim_C2_Verified_Project.zip...")
with zipfile.ZipFile(c2_verified_zip, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
    for root, dirs, files in os.walk(workspace):
        dirs[:] = [d for d in dirs if d not in exclude_dirs and not d.startswith(".venv")]
        for file in files:
            if file.endswith(".zip") or file in exclude_extensions:
                continue
            abs_path = Path(root) / file
            rel_path = abs_path.relative_to(workspace)
            # Exclude large raw geojson files if needed, or include them (dataset is clean)
            zf.write(abs_path, str(rel_path))

print(f"Built {c2_verified_zip.name}: {c2_verified_zip.stat().st_size:,} bytes")

# 3. Compute hashes for all individual artifacts and modified source files
files_to_hash = [
    # Modified source files
    "backend/app/spatial/geo_digital_twin.py",
    "backend/app/schemas/schemas.py",
    "backend/app/api/optimization_router.py",
    "backend/app/optimization/pareto_optimizer.py",
    "backend/app/interventions/engine.py",
    "backend/tests/test_c2_grid_contract.py",
    "backend/tests/test_backend.py",
    "frontend/src/lib/api.ts",
    "frontend/src/app/reports/page.tsx",
    "frontend/src/app/optimization/page.tsx",
    "frontend/src/app/methodology/page.tsx",
    "frontend/package.json",
    "scripts/test_geojson_export.py",
    # Spatial data snapshots
    "dataset/raw/vector/osm/manifest.json",
    "dataset/raw/vector/osm/delhi_cp_features.geojson",
    "dataset/raw/vector/osm/mumbai_bkc_features.geojson",
    "dataset/raw/vector/osm/singapore_marina_features.geojson",
    "dataset/raw/vector/osm/phoenix_downtown_features.geojson",
    "dataset/raw/vector/osm/tokyo_shinjuku_features.geojson",
    "dataset/processed/spatial_vectors/delhi_cp_features_clipped.geojson",
    "dataset/processed/spatial_vectors/mumbai_bkc_features_clipped.geojson",
    "dataset/processed/spatial_vectors/singapore_marina_features_clipped.geojson",
    "dataset/processed/spatial_vectors/phoenix_downtown_features_clipped.geojson",
    "dataset/processed/spatial_vectors/tokyo_shinjuku_features_clipped.geojson",
    # Evidence artifacts
    "artifacts/antigravity_verification_20261026_002500/ANTIGRAVITY_VERIFICATION_REPORT.md",
    "artifacts/antigravity_verification_20261026_002500/ANTIGRAVITY_TEST_MATRIX.csv",
    "artifacts/antigravity_verification_20261026_002500/ANTIGRAVITY_CHANGELOG.md",
    "artifacts/antigravity_verification_20261026_002500/ANTIGRAVITY_COMMANDS_AND_VERSIONS.txt",
    "artifacts/antigravity_verification_20261026_002500/spatial_data_summary.json",
    "artifacts/antigravity_verification_20261026_002500/REVIEW_THIS_FIRST.md",
    "artifacts/antigravity_verification_20261026_002500/VISUAL_REFERENCE_AND_UI_GUARDRAIL.md",
    "artifacts/antigravity_verification_20261026_002500/diff/c2_remediation.patch",
    "artifacts/antigravity_verification_20261026_002500/diff/c2_remediation_stat.txt",
    "artifacts/antigravity_verification_20261026_002500/screenshots/reports_reference_mockup.jpg",
    "artifacts/antigravity_verification_20261026_002500/screenshots/reports_page_baseline.png",
    "artifacts/antigravity_verification_20261026_002500/screenshots/reports_page_post_change.png",
]

def sha256_file(path: Path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while chunk := f.read(65536):
            h.update(chunk)
    return h.hexdigest(), path.stat().st_size

manifest_lines = []
for rel in files_to_hash:
    fpath = workspace / rel
    if fpath.exists():
        c_hash, c_size = sha256_file(fpath)
        manifest_lines.append(f"{c_hash}  {c_size:10d}  {rel}\n")

# Add the two project packages
p_sha, p_size = sha256_file(c2_verified_zip)
manifest_lines.append(f"{p_sha}  {p_size:10d}  artifacts/handoff/UrbanCoolSim_C2_Verified_Project.zip\n")

s_sha, s_size = sha256_file(shareable_zip)
manifest_lines.append(f"{s_sha}  {s_size:10d}  UrbanCoolSim_Shareable_Full_Project.zip\n")

manifest_path.write_text("".join(manifest_lines), encoding="utf-8")
print(f"Wrote updated manifest to {manifest_path}")

# 4. Rebuild UrbanCoolSim_Antigravity_Verification_Handoff.zip
handoff_zip = handoff_dir / "UrbanCoolSim_Antigravity_Verification_Handoff.zip"
if handoff_zip.exists():
    handoff_zip.unlink()

print("Building UrbanCoolSim_Antigravity_Verification_Handoff.zip...")
with zipfile.ZipFile(handoff_zip, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
    for root, dirs, files in os.walk(artifacts_dir):
        for file in files:
            if file == ".DS_Store":
                continue
            abs_p = Path(root) / file
            rel_p = abs_p.relative_to(artifacts_dir)
            zf.write(abs_p, str(rel_p))

h_sha, h_size = sha256_file(handoff_zip)
print(f"Built {handoff_zip.name}: {h_size:,} bytes | SHA256: {h_sha}")

# Append handoff_zip to manifest
with open(manifest_path, "a", encoding="utf-8") as f:
    f.write(f"{h_sha}  {h_size:10d}  artifacts/handoff/UrbanCoolSim_Antigravity_Verification_Handoff.zip\n")

print("All deliverables packaged and manifests synchronized.")
