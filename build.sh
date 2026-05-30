#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

echo "==> Building frontend..."
cd frontend
npm ci
npm run build
cd ..

echo "==> Frontend built to addon/src/static/dist/"
echo "==> Run 'docker build addon/' to build the add-on image."
