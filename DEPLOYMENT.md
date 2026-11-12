# UrbanCoolSim — Production Deployment Guide

This guide provides end-to-end instructions for deploying the **UrbanCoolSim** microclimate digital twin and thermal intelligence platform across various environments:

1. [Quick Start (Local & VPS Zero-Config)](#1-quick-start-local--vps-zero-config)
2. [Docker Compose (Multi-Container Architecture)](#2-docker-compose-multi-container-architecture)
3. [Cloud PaaS Deployments (Railway, Render, Heroku)](#3-cloud-paas-deployments)
4. [Split Deployment (Vercel Frontend + PaaS Backend)](#4-split-deployment-vercel--cloud-backend)
5. [Self-Hosted Linux / VPS Production (Systemd + Nginx)](#5-self-hosted-linux--vps-production)
6. [Environment Variables Reference](#6-environment-variables-reference)
7. [Health Checks & Database Migrations](#7-health-checks--database-migrations)

---

## 1. Quick Start (Local & VPS Zero-Config)

UrbanCoolSim includes an autonomous deployment orchestrator (`start.sh`) that auto-detects free ports, auto-generates `.env` with a secure random `SECRET_KEY` if missing, installs dependencies, runs database auto-migrations, and links the frontend reverse proxy.

### Single Command:
```bash
./start.sh
```

### Run as a Background Daemon:
```bash
./start.sh --daemon
```

### Manage Services:
```bash
# Check running status and active process IDs:
./start.sh --status

# Stream real-time logs from backend and frontend:
./start.sh --logs

# Gracefully stop all instances:
./start.sh --stop
```

---

## 2. Docker Compose (Multi-Container Architecture)

The production Docker Compose setup bundles:
- **`urbancoolsim_postgres`**: PostGIS 15 geospatial database.
- **`urbancoolsim_backend`**: Python 3.11 FastAPI thermodynamics & ML engine.
- **`urbancoolsim_frontend`**: Node 20 Next.js 14 production web interface.

### Steps:

1. **(Optional) Configure `.env`**:
   If not configured, safe development defaults are used automatically.
   ```bash
   cp .env.example .env
   # Customize SECRET_KEY, POSTGRES_PASSWORD, etc.
   ```

2. **Build and Launch Containers**:
   ```bash
   docker compose up --build -d
   ```

3. **Verify Service Health**:
   ```bash
   docker compose ps
   ```
   Both `backend` and `frontend` have built-in Docker healthchecks verifying `GET /health` and Next.js HTTP responses.

4. **Access the Application**:
   - **Web UI**: [http://localhost:3000](http://localhost:3000)
   - **FastAPI OpenAPI Docs**: [http://localhost:8000/docs](http://localhost:8000/docs)
   - **Health Endpoint**: [http://localhost:8000/health](http://localhost:8000/health)

5. **Stop Containers**:
   ```bash
   docker compose down
   ```

---

## 3. Cloud PaaS Deployments

### Option A: Render (1-Click Blueprint)

UrbanCoolSim includes a complete Infrastructure-as-Code blueprint (`render.yaml`).

1. Push this repository to GitHub or GitLab.
2. In Render Dashboard, click **New +** -> **Blueprint**.
3. Select your repository. Render automatically reads `render.yaml` and provisions:
   - Managed PostgreSQL database (`urbancoolsim-postgres`)
   - FastAPI Backend web service (`urbancoolsim-backend`)
   - Next.js Frontend web service (`urbancoolsim-frontend`)
   - Automatic environment variable wiring between services.
4. Click **Apply**.

### Option B: Railway

UrbanCoolSim includes `railway.json`.

1. Install Railway CLI or connect via [railway.com](https://railway.com).
2. Create a new project and add:
   - **Backend Service**:
     - Root Directory: `/` (or `/backend`)
     - Build Type: Dockerfile (`backend/Dockerfile`)
     - Healthcheck Path: `/health`
     - Env vars: `SECRET_KEY`, `ENVIRONMENT=production`, `DEBUG=false`
   - **Frontend Service**:
     - Root Directory: `/frontend`
     - Build Type: Node (`npm run build`, `npm start`)
     - Env vars: `BACKEND_INTERNAL_URL` pointing to the backend private URL.
   - **Database** (optional): Add a PostgreSQL plugin.

### Option C: Heroku / Dokku

A `Procfile` is provided in the repository root:
```text
web: cd backend && uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}
```

---

## 4. Split Deployment (Vercel + Cloud Backend)

Deploying the Next.js frontend to **Vercel** and the FastAPI backend to **Railway / Render / AWS ECS / Cloud Run**:

### Step 1: Deploy Backend to Cloud
Deploy the backend using Docker or Python runtime. Note the public URL (e.g. `https://api.urbancoolsim.yourdomain.com` or `https://urbancoolsim.up.railway.app`).

Ensure backend environment variables include:
```bash
CORS_ORIGINS=https://your-frontend.vercel.app
ENVIRONMENT=production
DEBUG=False
SECRET_KEY=your_secure_32_byte_secret_key
```

### Step 2: Deploy Frontend to Vercel
1. Import the repository in Vercel.
2. Set **Root Directory** to `frontend`.
3. Add Environment Variable:
   - `BACKEND_INTERNAL_URL`: `https://api.urbancoolsim.yourdomain.com`
   - `NEXT_PUBLIC_API_URL`: `https://api.urbancoolsim.yourdomain.com`
4. Deploy! Next.js will build and proxy `/api/*` requests to your backend.

---

## 5. Self-Hosted Linux / VPS Production

For deployment on Ubuntu 22.04 / 24.04 LTS (AWS EC2, DigitalOcean, Hetzner, Linode):

### 1. Install System Prerequisites
```bash
sudo apt update && sudo apt install -y python3.11 python3.11-venv python3-pip nodejs npm nginx curl
```

### 2. Clone and Setup Repository
```bash
sudo mkdir -p /opt/urbancoolsim
sudo chown ubuntu:ubuntu /opt/urbancoolsim
git clone <repo_url> /opt/urbancoolsim
cd /opt/urbancoolsim

# Setup Python Virtual Environment
python3.11 -m venv .venv-backend
.venv-backend/bin/pip install --upgrade pip
.venv-backend/bin/pip install -r backend/requirements.txt

# Setup Frontend
cd frontend
npm ci
npm run build
cd ..

# Generate Production .env
cp .env.example .env
# Edit .env with your production values
```

### 3. Install Systemd Services
Two systemd service unit files are included in `scripts/systemd/`:

```bash
sudo cp scripts/systemd/urbancoolsim-backend.service /etc/systemd/system/
sudo cp scripts/systemd/urbancoolsim-frontend.service /etc/systemd/system/

sudo mkdir -p /var/log/urbancoolsim
sudo chown ubuntu:ubuntu /var/log/urbancoolsim

sudo systemctl daemon-reload
sudo systemctl enable --now urbancoolsim-backend
sudo systemctl enable --now urbancoolsim-frontend
```

Verify service status:
```bash
sudo systemctl status urbancoolsim-backend
sudo systemctl status urbancoolsim-frontend
```

### 4. Configure Nginx Reverse Proxy & SSL
A pre-configured Nginx reverse proxy template is in `config/nginx.conf`:

```bash
sudo cp config/nginx.conf /etc/nginx/sites-available/urbancoolsim
sudo ln -s /etc/nginx/sites-available/urbancoolsim /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

Enable HTTPS via Let's Encrypt:
```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com
```

---

## 6. Environment Variables Reference

| Variable | Description | Default / Example | Required |
| :--- | :--- | :--- | :---: |
| `SECRET_KEY` | JWT authentication signing secret (minimum 16 chars) | `32-byte-hex-string` | **Yes** |
| `DATABASE_URL` | SQLAlchemy connection URI (PostgreSQL or SQLite) | `sqlite+aiosqlite:///./urbancoolsim.db` | No |
| `SYNC_DATABASE_URL` | Synchronous SQLAlchemy URI (auto-derived if omitted) | `sqlite:///./urbancoolsim.db` | No |
| `ENVIRONMENT` | Runtime environment flag (`production` / `development`) | `production` | No |
| `DEBUG` | Enable verbose debug logs and stacktraces | `False` | No |
| `CORS_ORIGINS` | Comma-separated list of allowed web origins | `http://localhost:3000` | No |
| `PORT` | Web server listening port (respected by backend & frontend) | `8000` (backend) / `3000` (frontend) | No |
| `BACKEND_INTERNAL_URL` | URL used by Next.js server rewrites to reach backend | `http://127.0.0.1:8000` | No |
| `NEXT_PUBLIC_API_URL` | Public API URL accessible from user browsers | `http://localhost:8000` | No |
| `OSM_PROCESSED_DIR` | Custom path to clipped OpenStreetMap spatial vectors | Auto-detected | No |

---

## 7. Health Checks & Database Migrations

### Automated Health Check
Backend provides a non-trivial health check endpoint at `GET /health` which verifies:
- Active database connectivity (`SELECT 1`)
- Physics Energy Balance solver readiness
- Machine Learning surrogate model status

```bash
curl http://localhost:8000/health
```

Sample output:
```json
{
  "status": "HEALTHY",
  "components": {
    "database": {"status": "ONLINE", "detail": "Connected"},
    "physics_engine": {"status": "READY", "detail": "Surface Energy Balance (SEB) solver active"},
    "surrogate_model": {"status": "ONLINE", "version": "production_v1"}
  }
}
```

### Zero-Downtime Auto-Migrations
On every application boot, the FastAPI backend inspects database metadata and idempotently executes `ALTER TABLE` statements for any newly declared model columns without requiring downtime or external migration tools. Default study areas and simulation scenarios are seeded automatically.

