#!/usr/bin/env python3
"""Create a local .env with unique development secrets without overwriting an existing file."""
from __future__ import annotations

import re
import secrets
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EXAMPLE = ROOT / ".env.example"
TARGET = ROOT / ".env"


def replace_value(text: str, key: str, value: str) -> str:
    pattern = rf"(?m)^{re.escape(key)}=.*$"
    replacement = f"{key}={value}"
    if re.search(pattern, text):
        return re.sub(pattern, lambda _: replacement, text, count=1)
    return text.rstrip() + f"\n{replacement}\n"


def main() -> int:
    if TARGET.exists():
        print(f"Refusing to overwrite existing {TARGET.name}; keeping your current configuration.")
        print("Review it manually, or back it up and remove it before running this script again.")
        return 2
    if not EXAMPLE.exists():
        print(f"Missing {EXAMPLE.relative_to(ROOT)}", file=sys.stderr)
        return 1

    text = EXAMPLE.read_text(encoding="utf-8")
    user = "urbancoolsim"
    database = "urbancoolsim"
    password = secrets.token_urlsafe(24)
    secret = secrets.token_urlsafe(48)

    text = replace_value(text, "SECRET_KEY", secret)
    text = replace_value(text, "POSTGRES_USER", user)
    text = replace_value(text, "POSTGRES_PASSWORD", password)
    text = replace_value(text, "POSTGRES_DB", database)
    text = replace_value(text, "DATABASE_URL", f"postgresql+asyncpg://{user}:{password}@localhost:5432/{database}")
    text = replace_value(text, "SYNC_DATABASE_URL", f"postgresql://{user}:{password}@localhost:5432/{database}")
    text = replace_value(text, "ENVIRONMENT", "development")
    text = replace_value(text, "DEBUG", "True")
    text = replace_value(text, "NEXT_PUBLIC_API_URL", "http://localhost:8000")

    TARGET.write_text(text, encoding="utf-8")
    TARGET.chmod(0o600)
    print(f"Created {TARGET.name} with unique local development secrets (file mode 0600).")
    print("Keep .env private; do not commit it or upload it in project ZIPs.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
