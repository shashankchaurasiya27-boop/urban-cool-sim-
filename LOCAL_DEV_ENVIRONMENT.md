# UrbanCoolSim local development environment

This setup runs UrbanCoolSim on your Mac using Docker Desktop. Your editor (Antigravity, VS Code, or another editor) edits the local source files while containers install and run backend/frontend dependencies. Source changes should hot-reload in the development services.

## Requirements

- Docker Desktop for Mac (Apple silicon build for an M-series Mac), running before the commands below.
- Git and Python 3 available in Terminal.
- Internet access for the first image/dependency downloads.
- Enough free disk space for Python geospatial/ML libraries, Node dependencies, and container images.

## 1. Prepare the local environment

From the repository root:

```bash
python3 scripts/bootstrap_dev_env.py
```

This creates `.env` from `.env.example` with a newly generated local `SECRET_KEY` and database password. It deliberately refuses to overwrite an existing `.env`. Do not commit or share `.env`.

If `.env` already exists, inspect it privately and keep it if it is your intended local configuration. Never paste the secret values into chat or commit them to Git.

## 2. Build and start the application

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```

On the first run, Docker downloads the PostGIS base image and builds the backend image with the Python requirements (including scientific/geospatial packages). When the frontend container starts, it installs packages with `npm ci` and records a hash of `package-lock.json`; it only reinstalls if the lockfile changes. This step needs network access and can take time because geospatial and machine-learning dependencies are substantial.

Open:

- Frontend: http://localhost:3000
- Backend API docs: http://localhost:8000/docs
- Backend health: http://localhost:8000/health

The development overlay runs the backend with Uvicorn reload and the frontend with Next.js development mode. Edit the files in your local checkout with Antigravity; changes should be reflected by the development server. If a dependency file changes, rebuild the relevant service:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build backend frontend
```

## 3. Run checks

```bash
# Backend tests
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec backend pytest -q

# Frontend lint
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec frontend npm run lint

# Frontend TypeScript check
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec frontend npx tsc --noEmit
```

For production-build verification, stop the dev frontend first to avoid concurrent access to `.next`, then run the production build in a separate one-off container or run CI. Do not treat a passing syntax check as a passing full build.

## 4. Stop the services

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml down
```

This preserves the named Postgres volume. To destroy the local database and start fresh, use `down -v` only when you are certain its data can be deleted.

## Important limitations and cautions

- This is a development environment, not a production deployment configuration.
- Runtime behavior and external map tiles still depend on configured services and internet access.
- The app's existing data and scientific claims still require the separate remediation tests; successful startup alone does not validate model accuracy.
- Never include `.env`, database files, private user records, or real credentials in a shared archive.
