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
# Locate the interpreter without assuming a layout. uv's standalone CPython puts
# the binary at bin/python3 on Unix, but on Windows it lands at python.exe — and
# not always directly under $PYHOME (older layouts nest it under install/). Search
# for it so the path is correct regardless of the platform's directory shape.
PYBIN="$(find "$PYHOME" -maxdepth 3 \( -name python.exe -o -name python3 -o -name python3.exe \) -type f 2>/dev/null | head -1)"
[[ -n "$PYBIN" ]] || { echo "  [$LABEL] could not locate the python interpreter under $PYHOME"; find "$PYHOME" -maxdepth 3 -name 'python*' >&2; exit 1; }
echo "  [$LABEL] interpreter: $PYBIN"

echo "  [$LABEL] installing deps into the runtime"
# Use `uv pip install --python` to install into uv's own standalone interpreter.
# Avoids the PEP 668 "externally-managed-environment" error that occurs when calling
# `python -m pip` on a uv-managed standalone (it treats itself as managed by uv).
if [[ -f "$PROJECT_DIR/requirements.txt" ]]; then
  uv pip install --python "$PYBIN" --system --break-system-packages -r "$PROJECT_DIR/requirements.txt"
  if [[ "$LABEL" == "biomed" ]]; then
    SHIM_SRC="${DETECTRON2_SHIM_SRC:-$PROJECT_DIR/detectron2_shim}"
    SITE="$("$PYBIN" -c 'import site,sys; print(site.getsitepackages()[0])')"
    if [[ -d "$SHIM_SRC" ]]; then
      cp -R "$SHIM_SRC" "$SITE/detectron2"
      echo "  [biomed] installed detectron2 pure-Python shim from $SHIM_SRC"
    else
      echo "  [biomed] WARNING: no detectron2 shim at $SHIM_SRC — segmentation will fail until it is added"
    fi
  fi
else
  ( cd "$PROJECT_DIR" && uv pip compile pyproject.toml -o /tmp/$LABEL-reqs.txt )
  uv pip install --python "$PYBIN" --system --break-system-packages -r /tmp/$LABEL-reqs.txt
fi

echo "  [$LABEL] copying runtime -> $OUT"
rm -rf "$OUT"
cp -R "$PYHOME" "$OUT"
# Sanity: the bundled interpreter must run standalone. Locate it the same
# layout-agnostic way as above (bin/python3 on Unix, python.exe on Windows).
OUT_BIN="$(find "$OUT" -maxdepth 3 \( -name python.exe -o -name python3 -o -name python3.exe \) -type f 2>/dev/null | head -1)"
[[ -n "$OUT_BIN" ]] || { echo "  [$LABEL] bundled interpreter missing under $OUT"; exit 1; }
"$OUT_BIN" --version
