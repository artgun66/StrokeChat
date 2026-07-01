#!/usr/bin/env bash
# Phase 3 — assemble desktop/staged/ with everything the packaged app loads at runtime.
# electron-builder copies staged/ verbatim into the app's Resources dir. The layout here
# must match desktop/src/paths.js (packaged branch).
#
# Run once per target platform on a machine of that platform (Python freezes and the
# llama-server binary are per-OS). Heavy: pulls a standalone CPython, torch, and a ~4 GB
# model. Intended for CI; runnable locally on macOS for a self-test.
#
#   ./scripts/stage-resources.sh            # full stage
#   SKIP_MODELS=1 ./scripts/stage-resources.sh   # skip the multi-GB model download
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DESKTOP="$(cd "$HERE/.." && pwd)"
ROOT="$(cd "$DESKTOP/.." && pwd)"
STAGED="$DESKTOP/staged"

case "$(uname -s)-$(uname -m)" in
  Darwin-arm64) OSDIR=darwin-arm64 ;;
  Darwin-x86_64) OSDIR=darwin-x64 ;;
  Linux-x86_64) OSDIR=linux-x64 ;;
  *) echo "unsupported platform $(uname -s)-$(uname -m); set OSDIR manually" >&2; OSDIR=${OSDIR:-} ;;
esac

echo "==> staging into $STAGED (os=$OSDIR)"
rm -rf "$STAGED"
mkdir -p "$STAGED"/{backend,biomedparse_service,frontend,bin/$OSDIR,models}

# 1. Backend source (no venv / caches / local data).
echo "==> backend source"
rsync -a --delete \
  --exclude '.venv' --exclude '__pycache__' --exclude 'data' --exclude '*.sqlite3' \
  "$ROOT/backend/" "$STAGED/backend/"

# 2. BiomedParse service + model code + fine-tuned checkpoint.
echo "==> biomedparse service + artun_model"
rsync -a --exclude '.venv' --exclude '__pycache__' \
  "$ROOT/biomedparse_service/" "$STAGED/biomedparse_service/"
mkdir -p "$STAGED/artun_model"
# Ship the model code + the fine-tuned checkpoint the service loads (see app.py paths).
rsync -a "$ROOT/artun_model/" "$STAGED/artun_model/" || \
  echo "!! artun_model not found — BiomedParse will be unavailable in the build"

# 3. Frontend — Next.js standalone server (the supervisor runs `node server.js`).
#    NEXT_PUBLIC_API_URL is baked to the fixed backend port; the browser calls it via CORS.
echo "==> frontend (Next.js standalone)"
( cd "$ROOT/frontend" && NEXT_PUBLIC_API_URL="http://127.0.0.1:8000" pnpm --filter product build )
SA="$ROOT/frontend/apps/product/.next/standalone"
# Standalone assembly: colocate static assets next to server.js.
cp -R "$ROOT/frontend/apps/product/.next/static" "$SA/apps/product/.next/static"
[ -d "$ROOT/frontend/apps/product/public" ] && cp -R "$ROOT/frontend/apps/product/public" "$SA/apps/product/public" || true
rsync -a --delete "$SA/" "$STAGED/frontend/"

# 4. Binaries for this OS: llama-server + a Node runtime for the standalone server.
echo "==> binaries (llama-server + node)"
if command -v llama-server >/dev/null 2>&1; then
  cp "$(command -v llama-server)" "$STAGED/bin/$OSDIR/"
else
  echo "!! llama-server not on PATH — download the matching llama.cpp release into $STAGED/bin/$OSDIR/" >&2
fi
if command -v node >/dev/null 2>&1; then
  cp "$(command -v node)" "$STAGED/bin/$OSDIR/node"
else
  echo "!! node not found — stage a Node 20+ binary into $STAGED/bin/$OSDIR/node" >&2
fi

# 5. Relocatable CPython runtimes + deps (the freeze).
#    Uses python-build-standalone via `uv`; standalone interpreters are relocatable, so we
#    install each service's deps into the interpreter's own site-packages and ship the dir.
echo "==> python runtimes (backend 3.12, biomedparse 3.11)"
"$HERE/build-python-runtime.sh" backend  "$ROOT/backend"            3.12 "$STAGED/python-backend"
"$HERE/build-python-runtime.sh" biomed   "$ROOT/biomedparse_service" 3.11 "$STAGED/python-biomedparse"

# 6. Bundled model(s): copy the catalog default (gemma light + vision projector).
echo "==> bundled models"
cp "$DESKTOP/resources/models/bundled.yaml" "$STAGED/models/bundled.yaml"
if [[ "${SKIP_MODELS:-0}" != "1" ]]; then
  "$HERE/fetch-bundled-models.sh" "$STAGED/models"
else
  echo "   SKIP_MODELS=1 — leaving model files out (app will offer them as downloads)"
fi

echo "==> done. Build the installer with: pnpm --prefix \"$DESKTOP\" dist"
