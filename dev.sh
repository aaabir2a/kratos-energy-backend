#!/usr/bin/env bash
# Kratos Sustainability CRM — dev launcher (Git Bash / Linux / macOS)
# Usage:  ./dev.sh          starts backend (:4000) + frontend (:5173), Ctrl+C stops both
#         ./dev.sh stop     just frees the ports
set -u
ROOT="$(cd "$(dirname "$0")" && pwd)"

free_port() {
  local port=$1
  if command -v powershell.exe >/dev/null 2>&1; then
    # Windows: kill whatever owns the port (detached node children survive plain pkill).
    powershell.exe -NoProfile -Command "Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id \$_.OwningProcess -Force -ErrorAction SilentlyContinue }" >/dev/null 2>&1
  else
    local pid
    pid=$(lsof -ti tcp:"$port" 2>/dev/null || true)
    [ -n "$pid" ] && kill -9 $pid 2>/dev/null
  fi
}

echo "Kratos CRM dev launcher"
free_port 4000
free_port 5173

if [ "${1:-}" = "stop" ]; then
  echo "Ports cleared. Servers stopped."
  exit 0
fi

# First-run install if node_modules missing.
for dir in backend frontend; do
  if [ ! -d "$ROOT/$dir/node_modules" ]; then
    echo "Installing $dir dependencies..."
    (cd "$ROOT/$dir" && npm install)
  fi
done

cleanup() {
  echo ""
  echo "Shutting down..."
  free_port 4000
  free_port 5173
  exit 0
}
trap cleanup INT TERM

echo "Starting backend  -> http://localhost:4000/api/v1  (docs at /docs)"
(cd "$ROOT/backend" && npm run dev 2>&1 | sed -u 's/^/[api] /') &

echo "Starting frontend -> http://localhost:5173"
(cd "$ROOT/frontend" && npm run dev 2>&1 | sed -u 's/^/[web] /') &

echo ""
echo "Both servers running. Login: admin@kratosenergy.com.au / Admin@12345"
echo "Press Ctrl+C to stop both."
wait
