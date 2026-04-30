#!/usr/bin/env bash
# Thin wrapper around `python -m fsloader.orchestrate` for CI / Linux.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

exec python -m fsloader.orchestrate "$@"
