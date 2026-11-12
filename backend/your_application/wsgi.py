import os
import sys

# Render defaults to running 'gunicorn your_application.wsgi'.
# This adapter catches that call and replaces the process with uvicorn.
port = os.environ.get("PORT", "10000")
print(f"[UrbanCoolSim] Replacing gunicorn with uvicorn on port {port}...")
os.execv(
    sys.executable,
    [sys.executable, "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", str(port)]
)

from app.main import app  # type: ignore # noqa: E402
application = app
