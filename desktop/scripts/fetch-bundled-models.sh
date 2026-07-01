#!/usr/bin/env bash
# Download the catalog's bundled default (gemma light + vision projector) into the staging
# models dir. URLs/filenames are the same pins used in backend/apps/catalog/data/curated.yaml
# for slug `gemma-4-e2b-it-q4`. ~4 GB total.
set -euo pipefail
OUT="${1:?usage: fetch-bundled-models.sh <out_dir>}"
mkdir -p "$OUT"

MODEL_URL="https://huggingface.co/unsloth/gemma-4-E2B-it-GGUF/resolve/main/gemma-4-E2B-it-Q4_K_M.gguf"
MMPROJ_URL="https://huggingface.co/unsloth/gemma-4-E2B-it-GGUF/resolve/main/mmproj-F16.gguf"

dl() { # url dest
  local url="$1" dest="$2"
  [[ -f "$dest" ]] && { echo "   have $(basename "$dest")"; return; }
  echo "   downloading $(basename "$dest")…"
  curl -fL --retry 3 -o "$dest.part" "$url"
  mv "$dest.part" "$dest"
}

dl "$MODEL_URL"  "$OUT/gemma-4-E2B-it-Q4_K_M.gguf"
dl "$MMPROJ_URL" "$OUT/mmproj-F16.gguf"
echo "   bundled models ready in $OUT"
