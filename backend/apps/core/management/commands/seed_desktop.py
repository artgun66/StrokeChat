"""First-run bootstrap for the desktop bundle.

Idempotent. Safe to run on every launch:
  1. Apply migrations (creates the SQLite DB on first run).
  2. Seed the curated catalog (signs each row with this install's local keypair).
  3. Register any models bundled in the app's resources as already-downloaded, so chat
     works fully offline on first launch without hitting Hugging Face.

Bundled models are described by ``${BUNDLED_MODELS_DIR}/bundled.yaml``::

    models:
      - slug: gemma-4-e2b-it-q4          # must match a curated.yaml row
        file: gemma-4-E2B-it-Q4_K_M.gguf
        mmproj: mmproj-F16.gguf          # optional, for vision models

Each file is copied into ``${DATA_DIR}/models/<slug>/`` (model.gguf / mmproj.gguf) and a
``ModelFile`` row is upserted with status READY. Copies are skipped when the destination
already exists with the right size, so re-runs are cheap.
"""
from __future__ import annotations

import hashlib
import os
import shutil
from pathlib import Path

import yaml
from django.conf import settings
from django.core.management import call_command
from django.core.management.base import BaseCommand

from apps.catalog.models import CatalogModel
from apps.models_registry.models import ModelFile, ModelStatus

CHUNK = 1024 * 1024


def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(CHUNK), b""):
            h.update(chunk)
    return h.hexdigest()


class Command(BaseCommand):
    help = "Migrate, seed the catalog, and register bundled models for the desktop app."

    def add_arguments(self, parser):
        parser.add_argument(
            "--skip-migrate",
            action="store_true",
            help="Assume migrations already applied (tests).",
        )

    def handle(self, *args, **opts):
        if not opts["skip_migrate"]:
            self.stdout.write("applying migrations…")
            call_command("migrate", "--noinput", verbosity=0)

        self.stdout.write("seeding catalog…")
        # Integrity fields in curated.yaml are real; license_text_sha256 placeholders are
        # informational and don't block. Allow placeholders so a partial catalog still seeds.
        call_command("seed_catalog", "--allow-placeholders", verbosity=0)

        self._register_bundled_models()
        self.stdout.write(self.style.SUCCESS("desktop bootstrap complete."))

    # -- bundled models ---------------------------------------------------

    def _register_bundled_models(self) -> None:
        bundled_dir = os.environ.get("BUNDLED_MODELS_DIR", "")
        if not bundled_dir:
            self.stdout.write("BUNDLED_MODELS_DIR unset — no bundled models to register.")
            return
        manifest_path = Path(bundled_dir) / "bundled.yaml"
        if not manifest_path.exists():
            self.stdout.write(f"no {manifest_path} — no bundled models to register.")
            return

        entries = (yaml.safe_load(manifest_path.read_text()) or {}).get("models", [])
        models_root = Path(settings.DATA_DIR) / "models"
        for entry in entries:
            self._register_one(Path(bundled_dir), models_root, entry)

    def _register_one(self, bundled_dir: Path, models_root: Path, entry: dict) -> None:
        slug = entry["slug"]
        if not CatalogModel.objects.filter(slug=slug).exists():
            self.stdout.write(self.style.WARNING(f"- {slug}: no catalog row; skipping bundle"))
            return

        dest_dir = models_root / slug
        dest_dir.mkdir(parents=True, exist_ok=True)
        model_dest = dest_dir / "model.gguf"
        self._copy_if_needed(bundled_dir / entry["file"], model_dest)

        mmproj_path = ""
        if entry.get("mmproj"):
            mmproj_dest = dest_dir / "mmproj.gguf"
            self._copy_if_needed(bundled_dir / entry["mmproj"], mmproj_dest)
            mmproj_path = str(mmproj_dest)

        ModelFile.objects.update_or_create(
            catalog_slug=slug,
            defaults={
                "local_path": str(model_dest),
                "sha256": _sha256(model_dest),
                "size_bytes": model_dest.stat().st_size,
                "status": ModelStatus.READY,
                "error": "",
                "mmproj_path": mmproj_path,
            },
        )
        self.stdout.write(self.style.SUCCESS(f"+ {slug}: registered bundled model"))

    def _copy_if_needed(self, src: Path, dest: Path) -> None:
        if not src.exists():
            raise FileNotFoundError(f"bundled file missing: {src}")
        if dest.exists() and dest.stat().st_size == src.stat().st_size:
            return  # already in place
        shutil.copy2(src, dest)
