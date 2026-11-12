#!/usr/bin/env bash
# ==============================================================================
# UrbanCoolSim - Autonomous Local Deployment & Zero-Configuration Host Script
# ==============================================================================
# Automatically detects the best available free ports on the machine, boots the
# FastAPI thermodynamics backend and Next.js digital twin frontend, links them
# via dynamic reverse proxy rewrites, and launches the browser.
# ==============================================================================

set -eo pipefail

# Determine absolute project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PID_FILE="$PROJECT_ROOT/.urbancoolsim.pids"
LOG_DIR="$PROJECT_ROOT/.logs"
mkdir -p "$LOG_DIR"
BACKEND_LOG="$LOG_DIR/backend.log"
FRONTEND_LOG="$LOG_DIR/frontend.log"

# Colors for terminal output
BOLD="\033[1m"
RESET="\033[0m"
CYAN="\033[1;36m"
GREEN="\033[1;32m"
YELLOW="\033[1;33m"
RED="\033[1;31m"
BLUE="\033[1;34m"
DIM="\033[2m"

# Default configuration
DEFAULT_BACKEND_PORT=8000
DEFAULT_FRONTEND_PORT=3000
CUSTOM_BACKEND_PORT=""
CUSTOM_FRONTEND_PORT=""
AUTO_OPEN=true
RUN_DAEMON=false

print_banner() {
    echo -e "${CYAN}======================================================================${RESET}"
    echo -e "${CYAN}  ${BOLD}UrbanCoolSim · AI Urban Heat Intelligence & Digital Twin${RESET}"
    echo -e "${DIM}  Autonomous Local Deployment & Auto-Port Orchestrator${RESET}"
    echo -e "${CYAN}======================================================================${RESET}"
}

print_help() {
    print_banner
    echo -e "Usage: ./start.sh [options]"
    echo ""
    echo "Options:"
    echo "  --no-open               Do not automatically launch web browser"
    echo "  --backend-port <port>   Manually specify backend port (default: auto-detect from 8000)"
    echo "  --frontend-port <port>  Manually specify frontend port (default: auto-detect from 3000)"
    echo "  --daemon, -d            Run services in background and exit"
    echo "  --stop                  Stop all running UrbanCoolSim instances"
    echo "  --status                Check status of running instances"
    echo "  --logs                  Tail real-time logs from backend and frontend"
    echo "  --help, -h              Show this help message"
    echo ""
    exit 0
}

# ------------------------------------------------------------------------------
# Process Management & Stopping
# ------------------------------------------------------------------------------
stop_instances() {
    echo -e "${YELLOW}[*] Checking for running UrbanCoolSim instances...${RESET}"
    local found=false
    if [ -f "$PID_FILE" ]; then
        while IFS= read -r pid || [ -n "$pid" ]; do
            if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
                echo -e "  ${DIM}Stopping process PID $pid...${RESET}"
                kill -TERM "$pid" 2>/dev/null || kill -9 "$pid" 2>/dev/null || true
                found=true
            fi
        done < "$PID_FILE"
        rm -f "$PID_FILE"
    fi

    # Clean up any lingering uvicorn / next-server processes
    pkill -f "uvicorn app.main:app" 2>/dev/null && found=true || true
    pkill -f "next-server|next dev" 2>/dev/null && found=true || true

    if [ "$found" = true ]; then
        sleep 1
        echo -e "${GREEN}[✓] All UrbanCoolSim instances stopped successfully.${RESET}"
    else
        echo -e "${DIM}[i] No running UrbanCoolSim instances detected.${RESET}"
    fi
}

check_status() {
    print_banner
    if [ -f "$PID_FILE" ]; then
        local active=0
        while IFS= read -r pid || [ -n "$pid" ]; do
            if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
                active=$((active + 1))
            fi
        done < "$PID_FILE"
        if [ "$active" -gt 0 ]; then
            echo -e "${GREEN}[✓] UrbanCoolSim is currently RUNNING ($active active processes).${RESET}"
            echo -e "  Backend logs : $BACKEND_LOG"
            echo -e "  Frontend logs: $FRONTEND_LOG"
            exit 0
        fi
    fi
    echo -e "${YELLOW}[i] UrbanCoolSim is currently NOT running.${RESET}"
    exit 0
}

tail_logs() {
    echo -e "${CYAN}[*] Following UrbanCoolSim logs (Ctrl+C to stop viewing)...${RESET}"
    tail -f "$BACKEND_LOG" "$FRONTEND_LOG" 2>/dev/null || echo "No logs found yet."
    exit 0
}

# ------------------------------------------------------------------------------
# Free Port Finder Function
# ------------------------------------------------------------------------------
# Robust socket probe across macOS and Linux using Python socket bind with SO_REUSEADDR
find_free_port() {
    local start_port="$1"
    local avoid_port="${2:-0}"
    local end_port=$((start_port + 150))
    local candidate=""

    # Primary method: Two-stage Python connect probe + bind probe (100% reliable across macOS and Linux)
    if [ -n "$PYTHON_BIN" ] && "$PYTHON_BIN" -c "import socket" >/dev/null 2>&1; then
        candidate=$("$PYTHON_BIN" -c "
import socket, sys
start = int(sys.argv[1])
end = int(sys.argv[2])
avoid = int(sys.argv[3])
for p in range(start, end):
    if p == avoid:
        continue
    # Step 1: Connect probe (detects active listening services)
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
            probe.settimeout(0.15)
            if probe.connect_ex(('127.0.0.1', p)) == 0:
                continue
    except Exception:
        pass
    # Step 2: Bind probe (confirms interface availability)
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.bind(('0.0.0.0', p))
            print(p)
            sys.exit(0)
    except OSError:
        continue
sys.exit(1)
" "$start_port" "$end_port" "$avoid_port" 2>/dev/null || true)
    fi

    # Fallback method: lsof / nc
    if [ -z "$candidate" ]; then
        local p="$start_port"
        while [ "$p" -le "$end_port" ]; do
            if [ "$p" -ne "$avoid_port" ]; then
                local port_busy=false
                if command -v lsof >/dev/null 2>&1; then
                    lsof -i "tcp:$p" >/dev/null 2>&1 && port_busy=true || true
                elif command -v nc >/dev/null 2>&1; then
                    nc -z 127.0.0.1 "$p" >/dev/null 2>&1 && port_busy=true || true
                fi
                if [ "$port_busy" = false ]; then
                    candidate="$p"
                    break
                fi
            fi
            p=$((p + 1))
        done
    fi

    if [ -n "$candidate" ]; then
        echo "$candidate"
    else
        echo "$start_port"
    fi
}

# ------------------------------------------------------------------------------
# Parse Command-Line Arguments
# ------------------------------------------------------------------------------
while [[ $# -gt 0 ]]; do
    case "$1" in
        --no-open)
            AUTO_OPEN=false
            shift
            ;;
        --backend-port)
            CUSTOM_BACKEND_PORT="$2"
            shift 2
            ;;
        --frontend-port)
            CUSTOM_FRONTEND_PORT="$2"
            shift 2
            ;;
        --daemon|-d)
            RUN_DAEMON=true
            shift
            ;;
        --stop)
            stop_instances
            exit 0
            ;;
        --status)
            check_status
            ;;
        --logs)
            tail_logs
            ;;
        --help|-h)
            print_help
            ;;
        *)
            echo -e "${RED}[!] Unknown option: $1${RESET}"
            echo "Run ./start.sh --help for available options."
            exit 1
            ;;
    esac
done

print_banner

# ------------------------------------------------------------------------------
# 1. Environment & Dependency Discovery
# ------------------------------------------------------------------------------
echo -e "\n${BLUE}[1/5] Discovering Python & Node.js runtime environments...${RESET}"

# Locate Python binary (Prioritize .venv-backend)
PYTHON_BIN=""
if [ -f "$PROJECT_ROOT/.venv-backend/bin/python" ]; then
    PYTHON_BIN="$PROJECT_ROOT/.venv-backend/bin/python"
    echo -e "  ${GREEN}✓${RESET} Found project virtualenv: ${DIM}.venv-backend/bin/python${RESET}"
elif [ -f "$PROJECT_ROOT/.venv/bin/python" ]; then
    PYTHON_BIN="$PROJECT_ROOT/.venv/bin/python"
    echo -e "  ${GREEN}✓${RESET} Found project virtualenv: ${DIM}.venv/bin/python${RESET}"
elif [ -f "$PROJECT_ROOT/venv/bin/python" ]; then
    PYTHON_BIN="$PROJECT_ROOT/venv/bin/python"
    echo -e "  ${GREEN}✓${RESET} Found project virtualenv: ${DIM}venv/bin/python${RESET}"
elif command -v python3 >/dev/null 2>&1; then
    PYTHON_BIN="$(command -v python3)"
    echo -e "  ${YELLOW}!${RESET} Using system Python: ${DIM}$PYTHON_BIN${RESET}"
else
    echo -e "  ${RED}✗ Error: Python 3 is not installed or not in PATH.${RESET}"
    exit 1
fi

# Verify Python can import uvicorn and fastapi
if ! "$PYTHON_BIN" -c "import fastapi, uvicorn" >/dev/null 2>&1; then
    echo -e "  ${YELLOW}! Required backend packages missing in $PYTHON_BIN. Installing backend dependencies...${RESET}"
    "$PYTHON_BIN" -m pip install -q -r "$PROJECT_ROOT/backend/requirements.txt" || {
        echo -e "  ${RED}✗ Failed to install backend dependencies. Please check network/pip.${RESET}"
        exit 1
    }
fi

# Locate Node & npm
if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
    echo -e "  ${RED}✗ Error: Node.js and npm are required to run the frontend.${RESET}"
    echo "  Please install Node.js 18+ (e.g. brew install node or https://nodejs.org)."
    exit 1
fi
echo -e "  ${GREEN}✓${RESET} Found Node.js: ${DIM}$(node -v)${RESET} | npm: ${DIM}$(npm -v)${RESET}"

# Verify frontend dependencies
if [ ! -d "$PROJECT_ROOT/frontend/node_modules" ]; then
    echo -e "  ${YELLOW}! frontend/node_modules not found. Running npm install...${RESET}"
    (cd "$PROJECT_ROOT/frontend" && npm install) || {
        echo -e "  ${RED}✗ Failed to install frontend dependencies.${RESET}"
        exit 1
    }
fi
echo -e "  ${GREEN}✓${RESET} Frontend dependencies verified."

# ------------------------------------------------------------------------------
# 2. Dynamic Port Resolution
# ------------------------------------------------------------------------------
echo -e "\n${BLUE}[2/5] Resolving best available free network ports...${RESET}"

if [ -n "$CUSTOM_BACKEND_PORT" ]; then
    BACKEND_PORT="$CUSTOM_BACKEND_PORT"
    echo -e "  ${GREEN}✓${RESET} Backend port manually specified: ${BOLD}$BACKEND_PORT${RESET}"
else
    BACKEND_PORT=$(find_free_port "$DEFAULT_BACKEND_PORT")
    if [ "$BACKEND_PORT" -ne "$DEFAULT_BACKEND_PORT" ]; then
        echo -e "  ${YELLOW}!${RESET} Port $DEFAULT_BACKEND_PORT was busy. Auto-selected free port: ${BOLD}$BACKEND_PORT${RESET}"
    else
        echo -e "  ${GREEN}✓${RESET} Backend port available: ${BOLD}$BACKEND_PORT${RESET}"
    fi
fi

if [ -n "$CUSTOM_FRONTEND_PORT" ]; then
    FRONTEND_PORT="$CUSTOM_FRONTEND_PORT"
    echo -e "  ${GREEN}✓${RESET} Frontend port manually specified: ${BOLD}$FRONTEND_PORT${RESET}"
else
    FRONTEND_PORT=$(find_free_port "$DEFAULT_FRONTEND_PORT" "$BACKEND_PORT")
    if [ "$FRONTEND_PORT" -ne "$DEFAULT_FRONTEND_PORT" ]; then
        echo -e "  ${YELLOW}!${RESET} Port $DEFAULT_FRONTEND_PORT was busy. Auto-selected free port: ${BOLD}$FRONTEND_PORT${RESET}"
    else
        echo -e "  ${GREEN}✓${RESET} Frontend port available: ${BOLD}$FRONTEND_PORT${RESET}"
    fi
fi

# ------------------------------------------------------------------------------
# 3. Launch FastAPI Backend
# ------------------------------------------------------------------------------
echo -e "\n${BLUE}[3/5] Starting FastAPI Thermodynamics & Digital Twin Engine...${RESET}"
export PYTHONPATH="$PROJECT_ROOT/backend"
export CORS_ORIGINS="http://localhost:$FRONTEND_PORT,http://127.0.0.1:$FRONTEND_PORT,http://0.0.0.0:$FRONTEND_PORT"

cd "$PROJECT_ROOT"
nohup "$PYTHON_BIN" -m uvicorn app.main:app \
    --host 0.0.0.0 \
    --port "$BACKEND_PORT" \
    --log-level warning < /dev/null > "$BACKEND_LOG" 2>&1 &
BACKEND_PID=$!
echo "$BACKEND_PID" > "$PID_FILE"

# Wait for backend health check
echo -ne "  ${DIM}Waiting for backend initialization...${RESET}"
BACKEND_READY=false
for i in {1..30}; do
    if curl -s "http://127.0.0.1:$BACKEND_PORT/health" >/dev/null 2>&1 || curl -s "http://localhost:$BACKEND_PORT/health" >/dev/null 2>&1; then
        BACKEND_READY=true
        break
    fi
    sleep 0.5
    echo -ne "."
done
echo ""

if [ "$BACKEND_READY" = false ]; then
    echo -e "  ${RED}✗ Backend failed to respond at port $BACKEND_PORT within 15s.${RESET}"
    echo -e "  ${DIM}Recent logs from $BACKEND_LOG:${RESET}"
    tail -n 25 "$BACKEND_LOG" || true
    kill "$BACKEND_PID" 2>/dev/null || true
    rm -f "$PID_FILE"
    exit 1
fi
echo -e "  ${GREEN}✓${RESET} Backend is UP & healthy at ${CYAN}http://localhost:$BACKEND_PORT${RESET}"

# ------------------------------------------------------------------------------
# 4. Launch Next.js Frontend
# ------------------------------------------------------------------------------
echo -e "\n${BLUE}[4/5] Starting Next.js High-Performance Frontend Interface...${RESET}"
export BACKEND_INTERNAL_URL="http://127.0.0.1:$BACKEND_PORT"
export NEXT_PUBLIC_API_URL="http://127.0.0.1:$BACKEND_PORT"
export PORT="$FRONTEND_PORT"

cd "$PROJECT_ROOT/frontend"
NEXT_BIN="$PROJECT_ROOT/frontend/node_modules/.bin/next"
if [ -f "$NEXT_BIN" ]; then
    nohup "$NEXT_BIN" dev -H 0.0.0.0 -p "$FRONTEND_PORT" < /dev/null > "$FRONTEND_LOG" 2>&1 &
else
    nohup npx next dev -H 0.0.0.0 -p "$FRONTEND_PORT" < /dev/null > "$FRONTEND_LOG" 2>&1 &
fi
FRONTEND_PID=$!
echo "$FRONTEND_PID" >> "$PID_FILE"
cd "$PROJECT_ROOT"

# Wait for frontend readiness
echo -ne "  ${DIM}Compiling and waiting for frontend server...${RESET}"
FRONTEND_READY=false
for i in {1..40}; do
    if curl -s -o /dev/null -w "%{http_code}" "http://localhost:$FRONTEND_PORT" 2>/dev/null | grep -E "200|304|307|308" >/dev/null || \
       curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:$FRONTEND_PORT" 2>/dev/null | grep -E "200|304|307|308" >/dev/null; then
        FRONTEND_READY=true
        break
    fi
    sleep 0.5
    echo -ne "."
done
echo ""

if [ "$FRONTEND_READY" = false ]; then
    echo -e "  ${RED}✗ Frontend failed to respond at port $FRONTEND_PORT within 20s.${RESET}"
    echo -e "  ${DIM}Recent logs from $FRONTEND_LOG:${RESET}"
    tail -n 25 "$FRONTEND_LOG" || true
    kill "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null || true
    rm -f "$PID_FILE"
    exit 1
fi
echo -e "  ${GREEN}✓${RESET} Frontend is UP & serving at ${CYAN}http://localhost:$FRONTEND_PORT${RESET}"

# ------------------------------------------------------------------------------
# 5. Success Dashboard & Launch
# ------------------------------------------------------------------------------
echo -e "\n${GREEN}======================================================================${RESET}"
echo -e "  ${GREEN}${BOLD}UrbanCoolSim is Successfully Hosted and Running Locally!${RESET}"
echo -e "${GREEN}======================================================================${RESET}"
echo -e "  ${BOLD}Platform Views:${RESET}"
echo -e "  • Main Dashboard            : ${CYAN}http://localhost:$FRONTEND_PORT${RESET}"
echo -e "  • Scenario Comparison Lab   : ${CYAN}http://localhost:$FRONTEND_PORT/scenario-lab${RESET}"
echo -e "  • Intervention Design Studio: ${CYAN}http://localhost:$FRONTEND_PORT/intervention-studio${RESET}"
echo -e "  • 3D/2D Urban Digital Twin  : ${CYAN}http://localhost:$FRONTEND_PORT/digital-twin${RESET}"
echo -e "  • Executive Decision Reports: ${CYAN}http://localhost:$FRONTEND_PORT/reports${RESET}"
echo ""
echo -e "  ${BOLD}Engine Services:${RESET}"
echo -e "  • FastAPI Interactive Docs  : ${CYAN}http://localhost:$BACKEND_PORT/docs${RESET}"
echo -e "  • Physics Health Endpoint   : ${CYAN}http://localhost:$BACKEND_PORT/health${RESET}"
echo -e "${GREEN}======================================================================${RESET}"

# Open browser if requested
if [ "$AUTO_OPEN" = true ]; then
    echo -e "${DIM}[*] Opening UrbanCoolSim in default browser...${RESET}"
    if command -v open >/dev/null 2>&1; then
        open "http://localhost:$FRONTEND_PORT" >/dev/null 2>&1 || true
    elif command -v xdg-open >/dev/null 2>&1; then
        xdg-open "http://localhost:$FRONTEND_PORT" >/dev/null 2>&1 || true
    fi
fi

if [ "$RUN_DAEMON" = true ]; then
    # Detach jobs completely from current terminal session
    disown "$BACKEND_PID" 2>/dev/null || true
    disown "$FRONTEND_PID" 2>/dev/null || true
    echo -e "\n${GREEN}[✓] UrbanCoolSim is running as a background daemon.${RESET}"
    echo -e "  To stop: ${BOLD}./start.sh --stop${RESET}"
    echo -e "  Logs   : ${BOLD}./start.sh --logs${RESET}\n"
    exit 0
fi

# Foreground mode: register graceful trap and wait
cleanup() {
    echo -e "\n${YELLOW}[*] Shutting down UrbanCoolSim services...${RESET}"
    kill "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null || true
    rm -f "$PID_FILE"
    echo -e "${GREEN}[✓] UrbanCoolSim stopped cleanly.${RESET}"
    exit 0
}

trap cleanup SIGINT SIGTERM EXIT
echo -e "\n${DIM}Logs are streaming in background. Press ${BOLD}Ctrl+C${RESET}${DIM} anytime to stop servers.${RESET}\n"
wait "$BACKEND_PID" "$FRONTEND_PID"
