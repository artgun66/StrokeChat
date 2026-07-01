#!/usr/bin/env bash
# Build a relocatable CPython runtime with one service's deps installed into it, for
# bundling. Uses `uv` (the project's Python tool) to fetch a python-build-standalone
# interpreter — those are relocatable, unlike a normal venv whose scripts hard-code paths.
#
#   build-python-runtime.sh <label> <project_dir> <py_version> <out_dir>
#
# <project_dir> must contain either pyproject.toml (backend) or requirements.txt (biomed).
set -euo pipefail

LABEL="$1"; PROJECT_DIR="$2"; PYVER="$3"; OUT="$4"

command -v uv >/dev/null 2>&1 || { echo "uv is required (https://docs.astral.sh/uv/)"; exit 1; }

echo "  [$LABEL] installing standalone CPython $PYVER"
# Materialize a standalone interpreter we can copy. --install-dir keeps it relocatable.
INSTALL_DIR="$(mktemp -d)/py"
uv python install "$PYVER" --install-dir "$INSTALL_DIR"
PYHOME="$(find "$INSTALL_DIR" -maxdepth 1 -type d -name "cpython-${PYVER}*" | head -1)"
[[ -n "$PYHOME" ]] || { echo "  [$LABEL] could not locate installed cpython"; exit 1; }
PYBIN="$PYHOME/bin/python3"

echo "  [$LABEL] installing deps into the runtime"
if [[ -f "$PROJECT_DIR/requirements.txt" ]]; then
  "$PYBIN" -m pip install --upgrade pip
  "$PYBIN" -m pip install -r "$PROJECT_DIR/requirements.txt"
  # BiomedParse needs the pure-Python detectron2 shim (see docs/RUNNING-LOCAL.md) — it is
  # platform-independent and avoids building detectron2's C++ ops. Stage it from the repo's
  # reference copy if present; otherwise warn so the build doesn't silently ship broken.
  if [[ "$LABEL" == "biomed" ]]; then
    SHIM_SRC="${DETECTRON2_SHIM_SRC:-$PROJECT_DIR/detectron2_shim}"
    SITE="$("$PYBIN" -c 'import site,sys; print(site.getsitepackages()[0])')"
    if [[ -d "$SHIM_SRC" ]]; then
      cp -R "$SHIM_SRC" "$SITE/detectron2"
      echo "  [biomed] installed detectron2 pure-Python shim from $SHIM_SRC"
    else
      echo "  [biomed] WARNING: no detectron2 shim at $SHIM_SRC — segmentation will fail until it is added (docs/RUNNING-LOCAL.md)"
    fi
  fi
else
  # Backend: compile pyproject deps to a lockfile then install (mirrors backend/Dockerfile).
  ( cd "$PROJECT_DIR" && uv pip compile pyproject.toml -o /tmp/$LABEL-reqs.txt )
  "$PYBIN" -m pip install --upgrade pip
  "$PYBIN" -m pip install -r /tmp/$LABEL-reqs.txt
fi

echo "  [$LABEL] copying runtime -> $OUT"
rm -rf "$OUT"
cp -R "$PYHOME" "$OUT"
# Sanity: the bundled interpreter must run standalone.
"$OUT/bin/python3" --version
