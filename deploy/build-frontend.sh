#!/usr/bin/env bash
# Build the frontend static site without installing Node on the host.
# Run from the repo root before `docker compose up`, and again any time frontend/vite-app changes.
set -euo pipefail
cd "$(dirname "$0")/.."
docker run --rm -v "$PWD/frontend/vite-app":/w -w /w \
  -e VITE_API_MODE=real \
  node:20 sh -c "npm ci && npm run build"
echo "Built frontend/vite-app/dist (served at /app/ by Caddy)."
