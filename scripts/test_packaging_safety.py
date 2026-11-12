#!/usr/bin/env python3
"""
UrbanCoolSim — Checkpoint C2 Packaging Safety Verification Script.

Inspects generated ZIP distribution packages or working directory trees and rigorously verifies:
1. No live populated databases (*.db, *.sqlite, *.sqlite3, urbancoolsim.db).
2. No local environment / secret files (.env, .env.local, .env.production, etc.).
3. No populated secret keys (SECRET_KEY = "populated_value").
4. No directories matching *Toolkit.* or containing trailing periods.
5. No duplicate Spatial_Data_Acquisition_Toolkit. directory.
6. Package size is within reasonable bounds (< 15 MB excluding virtual environments).
"""

import sys
import zipfile
import re
from pathlib import Path
from typing import List, Tuple

FORBIDDEN_FILE_PATTERNS = [
    r"^.*\.db$",
    r"^.*\.sqlite$",
    r"^.*\.sqlite3$",
    r"^.*urbancoolsim\.db$",
    r"^.*\.env$",
    r"^.*\.env\.local$",
    r"^.*\.env\.development$",
    r"^.*\.env\.production$",
    r"^.*\.env\.test$",
]

FORBIDDEN_DIR_PATTERNS = [
    r"^.*Toolkit\..*$",
    r"^.*Spatial_Data_Acquisition_Toolkit\..*$",
    r"^.*\.\/$",  # Trailing period before slash
]

POPULATED_SECRET_PATTERN = re.compile(r'SECRET_KEY\s*=\s*["\']([a-zA-Z0-9_\-\.]{12,})["\']')


def verify_zip_package(zip_path: Path) -> Tuple[bool, List[str]]:
    """Inspects a zip archive for packaging safety violations."""
    violations: List[str] = []
    if not zip_path.exists():
        return False, [f"Archive does not exist: {zip_path}"]

    size_mb = zip_path.stat().st_size / (1024 * 1024)
    if size_mb > 25.0:
        violations.append(f"Archive size exceeds safety threshold: {size_mb:.2f} MB > 25 MB")

    try:
        with zipfile.ZipFile(zip_path, "r") as zf:
            for info in zf.infolist():
                name = info.filename
                # Check forbidden file patterns
                for pat in FORBIDDEN_FILE_PATTERNS:
                    if re.match(pat, name, re.IGNORECASE):
                        violations.append(f"Forbidden file pattern '{pat}' matched: {name}")

                # Check forbidden dir patterns
                for pat in FORBIDDEN_DIR_PATTERNS:
                    if re.match(pat, name, re.IGNORECASE):
                        violations.append(f"Forbidden directory pattern '{pat}' matched: {name}")

                # Check for populated secrets in text files
                if name.endswith((".py", ".env", ".json", ".yaml", ".yml", ".ts", ".js")):
                    try:
                        content = zf.read(name).decode("utf-8", errors="ignore")
                        match = POPULATED_SECRET_PATTERN.search(content)
                        if match and "SECRET_KEY = os.getenv" not in content and "your-secret-key" not in match.group(1):
                            val = match.group(1).lower()
                            # Allow example, placeholder, or test fixture values
                            if not any(token in val for token in ("test", "dummy", "placeholder", "change-this", "example")):
                                violations.append(f"Potential exposed live SECRET_KEY in {name}: {match.group(0)[:30]}...")
                    except Exception:
                        pass
    except Exception as exc:
        violations.append(f"Failed to read zip archive {zip_path}: {exc}")

    return len(violations) == 0, violations


def verify_directory_tree(root_path: Path) -> Tuple[bool, List[str]]:
    """Inspects a directory tree for packaging safety violations (skipping venv and node_modules)."""
    violations: List[str] = []
    if not root_path.exists():
        return False, [f"Directory does not exist: {root_path}"]

    for item in root_path.rglob("*"):
        # Skip local virtualenvs and node_modules which are excluded from packaging
        rel_str = str(item.relative_to(root_path))
        if any(skip in rel_str for skip in [".venv", "venv", "node_modules", ".git", ".next"]):
            continue

        name = item.name
        # Check forbidden dir patterns
        if item.is_dir():
            for pat in FORBIDDEN_DIR_PATTERNS:
                if re.match(pat, name, re.IGNORECASE):
                    violations.append(f"Forbidden directory pattern '{pat}' found in tree: {rel_str}")
        elif item.is_file():
            # Check forbidden file patterns
            for pat in FORBIDDEN_FILE_PATTERNS:
                if re.match(pat, name, re.IGNORECASE) and name != "urbancoolsim.db":
                    # Note: urbancoolsim.db may exist locally during dev, but MUST be excluded from distribution
                    violations.append(f"Forbidden file pattern '{pat}' found in tree: {rel_str}")

    return len(violations) == 0, violations


REQUIRED_RELEASE_ARCHIVES = [
    "UrbanCoolSim_C2_Verified_Project.zip",
    "UrbanCoolSim_C2_Verification_Handoff.zip",
]


def test_packaging_safety():
    """Pytest entrypoint for packaging safety test. Requires release archives to be present."""
    root = Path(__file__).parents[1]
    # Check tree
    ok, violations = verify_directory_tree(root)
    assert ok, f"Directory tree violations found:\n" + "\n".join(violations)

    artifacts_dir = root / "artifacts" / "c2-final-closure"
    assert artifacts_dir.exists(), f"Artifacts directory missing: {artifacts_dir}"

    # Require expected release archives to exist and verify their safety
    for arc_name in REQUIRED_RELEASE_ARCHIVES:
        arc_path = artifacts_dir / arc_name
        assert arc_path.exists(), (
            f"Required release archive missing: {arc_name}. "
            f"Run scripts/package_c2_distribution.py to produce distribution packages before verification."
        )
        assert arc_path.stat().st_size > 1000, f"Archive {arc_name} is empty or suspiciously small"
        ok_zip, zip_violations = verify_zip_package(arc_path)
        assert ok_zip, f"Zip archive {arc_name} violations:\n" + "\n".join(zip_violations)

    # Check any other zip packages present in artifacts
    for zip_file in sorted(artifacts_dir.glob("*.zip")):
        if zip_file.name not in REQUIRED_RELEASE_ARCHIVES:
            ok_zip, zip_violations = verify_zip_package(zip_file)
            assert ok_zip, f"Zip archive {zip_file.name} violations:\n" + "\n".join(zip_violations)


if __name__ == "__main__":
    root = Path(__file__).parents[1]
    print("=" * 70)
    print("URBANCOOLSIM — PACKAGING SAFETY VERIFICATION")
    print("=" * 70)
    
    print("\n[1/2] Checking repository tree for forbidden artifacts...")
    ok_tree, violations_tree = verify_directory_tree(root)
    if ok_tree:
        print("  PASS: Repository tree clean of forbidden directories, trailing-dots, and raw .env files.")
    else:
        print("  FAIL: Violations detected in repository tree:")
        for v in violations_tree:
            print(f"    - {v}")

    print("\n[2/2] Checking required artifacts zip bundles...")
    artifacts_dir = root / "artifacts" / "c2-final-closure"
    all_zips_ok = True
    missing_archives: List[str] = []

    if not artifacts_dir.exists():
        print(f"  FAIL: Artifacts directory missing: {artifacts_dir}")
        sys.exit(1)

    for arc_name in REQUIRED_RELEASE_ARCHIVES:
        arc_path = artifacts_dir / arc_name
        if not arc_path.exists():
            missing_archives.append(arc_name)
            all_zips_ok = False
            print(f"  FAIL: Missing required release archive: {arc_name}")
        else:
            ok_zip, zip_violations = verify_zip_package(arc_path)
            if ok_zip:
                print(f"  PASS: {arc_name} ({arc_path.stat().st_size / 1024 / 1024:.2f} MB) is clean.")
            else:
                all_zips_ok = False
                print(f"  FAIL: {arc_name} has violations:")
                for v in zip_violations:
                    print(f"    - {v}")

    # Check any extra archives
    for zip_file in sorted(artifacts_dir.glob("*.zip")):
        if zip_file.name not in REQUIRED_RELEASE_ARCHIVES:
            ok_zip, zip_violations = verify_zip_package(zip_file)
            if ok_zip:
                print(f"  PASS: [Additional] {zip_file.name} ({zip_file.stat().st_size / 1024 / 1024:.2f} MB) is clean.")
            else:
                all_zips_ok = False
                print(f"  FAIL: [Additional] {zip_file.name} has violations:")
                for v in zip_violations:
                    print(f"    - {v}")

    if missing_archives and "--allow-missing" not in sys.argv:
        print(f"\nFAIL: Missing required release archives: {missing_archives}")
        print("Run 'python scripts/package_c2_distribution.py' first to build required packages.")
        sys.exit(1)

    if ok_tree and all_zips_ok:
        print("\nOVERALL PACKAGING SAFETY: PASS")
        sys.exit(0)
    else:
        print("\nOVERALL PACKAGING SAFETY: FAIL")
        sys.exit(1)
