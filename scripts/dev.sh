#!/usr/bin/env bash
# Local dev orchestrator for the native-on-host setup.
#
#   ./scripts/dev.sh start     # postgres + backend + worker
#   ./scripts/dev.sh stop      # stop backend + worker + llama-server (keep postgres)
#   ./scripts/dev.sh restart   # stop + start
#   ./scripts/dev.sh status    # show what's running
#   ./scripts/dev.sh logs <backend|worker>   # tail a log file
#
# Postgres lives in Docker on host:55432. Backend, worker, and llama-server run natively
# so chat uses Apple Silicon Metal acceleration.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$ROOT/backend"
DATA_DIR="$ROOT/data"
RUN_DIR="$DATA_DIR/run"
LOG_DIR="$DATA_DIR/logs"
ENV_FILE="$ROOT/.env.local"

mkdir -p "$RUN_DIR" "$LOG_DIR"

BACKEND_PID="$RUN_DIR/backend.pid"
WORKER_PID="$RUN_DIR/worker.pid"
BACKEND_LOG="$LOG_DIR/backend.log"
WORKER_LOG="$LOG_DIR/worker.log"

C_DIM='\033[2m'; C_OK='\033[32m'; C_WARN='\033[33m'; C_ERR='\033[31m'; C_OFF='\033[0m'

# ---------- helpers ----------

log()  { printf "%b\n" "$*"; }
ok()   { log "${C_OK}✓${C_OFF} $*"; }
warn() { log "${C_WARN}!${C_OFF} $*"; }
err()  { log "${C_ERR}✗${C_OFF} $*" >&2; }

require_env_file() {
  if [[ ! -f "$ENV_FILE" ]]; then
    err "missing $ENV_FILE — run ./scripts/dev.sh init or copy .env.example"
    exit 1
  fi
}

is_running() {
  local pid_file="$1"
  [[ -f "$pid_file" ]] || return 1
  local pid; pid="$(cat "$pid_file" 2>/dev/null || echo "")"
  [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null
}

stop_pid_file() {
  local label="$1" pid_file="$2"
  if is_running "$pid_file"; then
    local pid; pid="$(cat "$pid_file")"
    log "${C_DIM}stopping $label (pid $pid)…${C_OFF}"
    kill "$pid" 2>/dev/null || true
    # Give it 5s to exit gracefully, then SIGKILL.
    for _ in 1 2 3 4 5; do
      kill -0 "$pid" 2>/dev/null || break
      sleep 1
    done
    if kill -0 "$pid" 2>/dev/null; then
      warn "$label didn't exit; SIGKILL"
      kill -9 "$pid" 2>/dev/null || true
    fi
    rm -f "$pid_file"
    ok "$label stopped"
  else
    log "${C_DIM}$label already stopped${C_OFF}"
    rm -f "$pid_file"
  fi
}

ensure_postgres() {
  if ! command -v docker >/dev/null 2>&1; then
    err "docker is required for postgres but not installed"
    exit 1
  fi
  if ! docker info >/dev/null 2>&1; then
    err "docker daemon is not running — start Docker Desktop first"
    exit 1
  fi
  local state
  state="$(docker compose -f "$ROOT/docker-compose.local.yml" ps --format '{{.Service}}={{.State}}' 2>/dev/null \
           | awk -F= '$1=="postgres"{print $2}')"
  if [[ "$state" != "running" ]]; then
    log "${C_DIM}starting postgres…${C_OFF}"
    docker compose -f "$ROOT/docker-compose.local.yml" up -d postgres >/dev/null
  fi
  log "${C_DIM}waiting for postgres…${C_OFF}"
  for _ in $(seq 1 30); do
    if docker compose -f "$ROOT/docker-compose.local.yml" exec -T postgres pg_isready -U local_llm >/dev/null 2>&1; then
      ok "postgres ready (host:55432)"
      return 0
    fi
    sleep 1
  done
  err "postgres did not become ready in 30s"
  exit 1
}

ensure_venv() {
  if [[ ! -x "$BACKEND_DIR/.venv/bin/python" ]]; then
    err "backend venv missing at $BACKEND_DIR/.venv — run: cd backend && python3.12 -m venv .venv && .venv/bin/pip install <deps>"
    exit 1
  fi
}

start_backend() {
  if is_running "$BACKEND_PID"; then
    warn "backend already running (pid $(cat "$BACKEND_PID"))"
    return 0
  fi
  log "${C_DIM}starting backend on :8000 (uvicorn ASGI) → $BACKEND_LOG${C_OFF}"
  (
    cd "$BACKEND_DIR"
    set -a; source "$ENV_FILE"; set +a
    # Uvicorn instead of `manage.py runserver` so the event loop persists across
    # requests — async background tasks (e.g. title refinement) need that to run
    # after the response stream closes.
    nohup .venv/bin/python -m uvicorn config.asgi:application \
      --host 0.0.0.0 --port 8000 \
      >"$BACKEND_LOG" 2>&1 &
    echo $! > "$BACKEND_PID"
  )
  for _ in $(seq 1 30); do
    if curl -sf http://localhost:8000/healthz >/dev/null 2>&1; then
      ok "backend ready (http://localhost:8000, pid $(cat "$BACKEND_PID"))"
      return 0
    fi
    sleep 1
  done
  err "backend did not become healthy in 30s — see $BACKEND_LOG"
  return 1
}

start_worker() {
  if is_running "$WORKER_PID"; then
    warn "worker already running (pid $(cat "$WORKER_PID"))"
    return 0
  fi
  log "${C_DIM}starting worker → $WORKER_LOG${C_OFF}"
  (
    cd "$BACKEND_DIR"
    set -a; source "$ENV_FILE"; set +a
    nohup .venv/bin/python manage.py run_worker \
      >"$WORKER_LOG" 2>&1 &
    echo $! > "$WORKER_PID"
  )
  sleep 1
  if is_running "$WORKER_PID"; then
    ok "worker running (pid $(cat "$WORKER_PID"))"
  else
    err "worker exited immediately — see $WORKER_LOG"
    return 1
  fi
}

stop_llama_server() {
  # The backend spawns llama-server children. They usually die when the parent does,
  # but defensively kill any pointing at our binary.
  if pkill -f "$DATA_DIR/bin/llama-server" 2>/dev/null; then
    ok "llama-server child(ren) stopped"
  fi
}

# ---------- subcommands ----------

cmd_start() {
  require_env_file
  ensure_venv
  ensure_postgres
  start_backend
  start_worker
  echo
  cmd_status
  echo
  log "Frontend (still in Docker):  http://localhost:3000/"
  log "Backend:                     http://localhost:8000/"
  log "Logs:  ./scripts/dev.sh logs backend   ./scripts/dev.sh logs worker"
}

cmd_stop() {
  stop_pid_file "backend" "$BACKEND_PID"
  stop_pid_file "worker"  "$WORKER_PID"
  stop_llama_server
}

cmd_restart() {
  cmd_stop
  cmd_start
}

cmd_status() {
  if is_running "$BACKEND_PID"; then ok "backend running (pid $(cat "$BACKEND_PID"))"; else warn "backend not running"; fi
  if is_running "$WORKER_PID";  then ok "worker  running (pid $(cat "$WORKER_PID"))";  else warn "worker not running";  fi
  if pgrep -f "$DATA_DIR/bin/llama-server" >/dev/null 2>&1; then
    ok "llama-server running (pid $(pgrep -f "$DATA_DIR/bin/llama-server" | head -1))"
  fi
  if docker info >/dev/null 2>&1 \
     && [[ "$(docker compose -f "$ROOT/docker-compose.local.yml" ps --format '{{.Service}}={{.State}}' 2>/dev/null | awk -F= '$1=="postgres"{print $2}')" == "running" ]]
  then
    ok "postgres running (host:55432)"
  else
    warn "postgres not running"
  fi
}

cmd_logs() {
  local which="${1:-}"
  case "$which" in
    backend) tail -f "$BACKEND_LOG" ;;
    worker)  tail -f "$WORKER_LOG"  ;;
    *) err "usage: ./scripts/dev.sh logs <backend|worker>"; exit 2 ;;
  esac
}

# ---------- entry ----------

case "${1:-}" in
  start)   cmd_start ;;
  stop)    cmd_stop ;;
  restart) cmd_restart ;;
  status)  cmd_status ;;
  logs)    shift; cmd_logs "$@" ;;
  *)
    cat <<USAGE
usage: ./scripts/dev.sh <command>

  start     start postgres (docker) + backend + worker (native)
  stop      stop backend + worker + llama-server (keep postgres)
  restart   stop + start
  status    show what's running
  logs <backend|worker>   tail a log file
USAGE
    exit 2
    ;;
esac
