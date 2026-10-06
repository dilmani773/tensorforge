#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../frontend/vite-app"
npm ci
npm run build
echo "Frontend built to $(pwd)/dist"
