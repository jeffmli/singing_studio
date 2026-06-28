#!/bin/bash
# One-time setup to enable the "Analyze pitch" feature.
# Builds an isolated .venv (Python 3.11) with torch/demucs/librosa and runs the
# app under it. Without this, the app still works — only pitch analysis is off.
set -e

HERE="$(cd "$(dirname "$0")" && pwd)"
PY="$(command -v python3.11 || command -v python3)"

echo "Creating virtualenv at $HERE/.venv (using $PY)..."
"$PY" -m venv "$HERE/.venv"
"$HERE/.venv/bin/python" -m pip install --quiet --upgrade pip
echo "Installing analysis dependencies (this is ~1–2 GB, one time)..."
"$HERE/.venv/bin/python" -m pip install -r "$HERE/requirements-analysis.txt"

echo
echo "Done ✓  Pitch analysis is enabled."
echo "Run the app under the venv:  $HERE/.venv/bin/python $HERE/server.py"
echo "(The Mac app uses the venv automatically when it's present.)"
