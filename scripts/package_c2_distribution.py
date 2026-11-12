#!/usr/bin/env python3
"""
UrbanCoolSim — Automated Distribution Packaging Script for Checkpoint C2 Closure.

Creates clean, safe, reproducible distribution bundles adhering to PACKAGING_AND_DATA_SAFETY.md:
1. UrbanCoolSim_C2_Verified_Project.zip (Full clean repository)
2. UrbanCoolSim_C2_Verification_Handoff.zip (Verification evidence package)
"""

import os
import re
import sys
import zipfile
import hashlib
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
OUTPUT_DIR = ROOT_DIR / "artifacts" / "c2-final-closure"

EXCLUDE_DIRS = {
    "venv", "node_modules", ".next", ".git",
    "__pycache__", ".pytest_cache", ".turbo", "cache", "graphify-out", ".tempmediaStorage"
}

EXCLUDE_FILE_PATTERNS = [
    r"^.*\.db$",
    r"^.*\.sqlite$",
    r"^.*\.sqlite3$",
    r"^.*urbancoolsim\.db$",
    r"^.*\.env$",
    r"^.*\.env\.local$",
    r"^.*\.env\.production$",
    r"^.*\.env\.development$",
    r"^.*\.DS_Store$",
    r"^.*\.tsbuildinfo$",
    r"^.*\.pyc$",
    r"^.*\.zip$",
]

EXCLUDE_DIR_PATTERNS = [
    r"^.*Toolkit\..*$",
    r"^.*Spatial_Data_Acquisition_Toolkit\..*$",
    r"^.*\.\/$",
]


def should_exclude(rel_path: Path) -> bool:
    """Returns True if file or directory matches exclusion rules."""
    parts = rel_path.parts
    # Check directory names
    for p in parts:
        if p.startswith(".venv") or p in EXCLUDE_DIRS:
            return True
        for pat in EXCLUDE_DIR_PATTERNS:
            if re.match(pat, p, re.IGNORECASE):
                return True

    filename = rel_path.name
    for pat in EXCLUDE_FILE_PATTERNS:
        if re.match(pat, filename, re.IGNORECASE):
            return True

    return False


def build_verified_project_zip(dest_zip: Path):
    """Builds the clean, reproducible verified project zip."""
    print(f"\n[Packaging] Building {dest_zip.name}...")
    dest_zip.parent.mkdir(parents=True, exist_ok=True)
    file_count = 0

    with zipfile.ZipFile(dest_zip, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
        for root, dirs, files in os.walk(ROOT_DIR):
            root_path = Path(root)
            rel_dir = root_path.relative_to(ROOT_DIR)

            # Skip excluded directories
            if should_exclude(rel_dir) or rel_dir.parts and rel_dir.parts[0] in ("artifacts",):
                dirs[:] = []
                continue

            # Filter subdirs in place
            dirs[:] = [d for d in dirs if not should_exclude(rel_dir / d)]

            for f in sorted(files):
                file_path = root_path / f
                rel_file = file_path.relative_to(ROOT_DIR)
                if should_exclude(rel_file):
                    continue

                arcname = str(Path("UrbanCoolSim") / rel_file)
                zf.write(file_path, arcname)
                file_count += 1

    size_mb = dest_zip.stat().st_size / (1024 * 1024)
    print(f"  Done: Packaged {file_count} files into {dest_zip.name} ({size_mb:.2f} MB)")


def build_verification_handoff_zip(dest_zip: Path):
    """Builds the standalone evidence handoff zip. Fails closed if any evidence file is missing."""
    print(f"\n[Packaging] Building {dest_zip.name}...")
    dest_zip.parent.mkdir(parents=True, exist_ok=True)

    files_to_bundle = [
        OUTPUT_DIR / "C2_FINAL_CLOSURE_REPORT.md",
        OUTPUT_DIR / "FINAL_VERIFICATION_SUMMARY.md",
        OUTPUT_DIR / "FINAL_TEST_MATRIX.json",
        OUTPUT_DIR / "junit_report.xml",
        OUTPUT_DIR / "SPATIAL_DATA_PROVENANCE.md",
        OUTPUT_DIR / "diff" / "C2_FINAL_CLOSURE.patch",
        OUTPUT_DIR / "SHA256_MANIFEST.txt",
        ROOT_DIR / "docs" / "verification" / "SPATIAL_RESOLUTION_DECISION.md",
        ROOT_DIR / "docs" / "verification" / "PACKAGING_AND_DATA_SAFETY.md",
        ROOT_DIR / "docs" / "verification" / "C2_BASELINE.md",
    ]

    missing = [f for f in files_to_bundle if not f.exists()]
    if missing:
        missing_names = [f.name for f in missing]
        raise FileNotFoundError(
            f"Cannot build verification handoff zip: missing required evidence files: {missing_names}. "
            f"Run test suite with JUnit output and ensure closure reports are generated first."
        )

    file_count = 0
    with zipfile.ZipFile(dest_zip, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
        for f in files_to_bundle:
            arcname = str(Path("UrbanCoolSim_C2_Verification_Handoff") / f.name)
            zf.write(f, arcname)
            file_count += 1

    size_kb = dest_zip.stat().st_size / 1024
    print(f"  Done: Packaged {file_count} evidence files into {dest_zip.name} ({size_kb:.1f} KB)")


def build_shareable_zip(dest_zip: Path):
    """
    Builds the complete, easily shareable distribution zip at root.
    Includes clean repository code and artifacts/c2-final-closure with all
    verification deliverables and sub-archives for turnkey evaluation.
    """
    print(f"\n[Packaging] Building shareable zip {dest_zip.name}...")
    file_count = 0
    with zipfile.ZipFile(dest_zip, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
        for root, dirs, files in os.walk(ROOT_DIR):
            root_path = Path(root)
            rel_dir = root_path.relative_to(ROOT_DIR)

            # Handle artifacts folder: only permit artifacts/c2-final-closure
            if rel_dir.parts and rel_dir.parts[0] == "artifacts":
                if len(rel_dir.parts) >= 2 and rel_dir.parts[1] == "c2-final-closure":
                    pass
                elif len(rel_dir.parts) == 1:
                    dirs[:] = [d for d in dirs if d == "c2-final-closure"]
                    continue
                else:
                    dirs[:] = []
                    continue
            elif should_exclude(rel_dir):
                dirs[:] = []
                continue

            # Filter subdirs in place
            dirs[:] = [d for d in dirs if not should_exclude(rel_dir / d)]

            for f in sorted(files):
                file_path = root_path / f
                rel_file = file_path.relative_to(ROOT_DIR)

                # In artifacts/c2-final-closure, preserve handoff files and sub-zips
                if rel_dir.parts and rel_dir.parts[0] == "artifacts" and len(rel_dir.parts) >= 2 and rel_dir.parts[1] == "c2-final-closure":
                    pass
                elif should_exclude(rel_file):
                    continue

                arcname = str(Path("UrbanCoolSim") / rel_file)
                zf.write(file_path, arcname)
                file_count += 1

    size_mb = dest_zip.stat().st_size / (1024 * 1024)
    print(f"  Done: Packaged {file_count} files into {dest_zip.name} ({size_mb:.2f} MB)")


if __name__ == "__main__":
    build_verified_project_zip(OUTPUT_DIR / "UrbanCoolSim_C2_Verified_Project.zip")
    build_verification_handoff_zip(OUTPUT_DIR / "UrbanCoolSim_C2_Verification_Handoff.zip")
    build_shareable_zip(ROOT_DIR / "UrbanCoolSim_Shareable.zip")
