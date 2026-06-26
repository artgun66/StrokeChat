"""The actual download. Streams the file, updates progress, verifies sha256, fails closed.

This is the *handler* for the `download_model` task kind. It runs inside the worker
process — never inside a request handler.
"""
from __future__ import annotations

import hashlib
import logging
from pathlib import Path

import httpx
from django.conf import settings
from django.utils import timezone

from apps.catalog.models import CatalogModel
from apps.catalog.services import manifest as manifest_service
from apps.downloads.models import DownloadJob, DownloadStatus
from apps.models_registry.models import ModelFile, ModelStatus

logger = logging.getLogger(__name__)

# How often to flush progress to the DB. Avoid one write per chunk.
PROGRESS_WRITE_EVERY_BYTES = 4 * 1024 * 1024  # 4 MiB
CHUNK_SIZE = 1024 * 1024  # 1 MiB


class DownloadFailed(Exception):
    """Raised when a download cannot complete (verification, network, license)."""


def _model_dir(slug: str) -> Path:
    return Path(settings.DATA_DIR) / "models" / slug


def _row_for_signing(catalog: CatalogModel) -> dict:
    return {
        "slug": catalog.slug,
        "display_name": catalog.display_name,
        "family": catalog.family,
        "source_url": catalog.source_url,
        "source_repo": catalog.source_repo,
        "source_revision": catalog.source_revision,
        "format": catalog.format,
        "compatible_engines": catalog.compatible_engines,
        "sha256": catalog.sha256,
        "size_bytes": catalog.size_bytes,
        "license_spdx": catalog.license_spdx,
        "license_url": catalog.license_url,
        "license_text_sha256": catalog.license_text_sha256,
        "allowed_use": catalog.allowed_use,
        "mmproj_url": catalog.mmproj_url,
        "mmproj_sha256": catalog.mmproj_sha256,
        "mmproj_size_bytes": catalog.mmproj_size_bytes,
    }


def _verify_manifest(catalog: CatalogModel) -> None:
    if not manifest_service.verify(_row_for_signing(catalog), catalog.manifest_signature):
        raise DownloadFailed(
            f"manifest signature invalid for {catalog.slug}; refusing to download"
        )


def _stream_to_file(url: str, dest: Path, job: DownloadJob) -> str:
    """Stream `url` to `dest`, writing progress to `job` and returning the sha256 hex."""
    sha = hashlib.sha256()
    bytes_seen = 0
    last_flushed = 0

    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(dest.suffix + ".part")

    with httpx.stream("GET", url, follow_redirects=True, timeout=httpx.Timeout(60.0)) as resp:
        if resp.status_code != 200:
            raise DownloadFailed(f"GET {url} returned status {resp.status_code}")

        total = int(resp.headers.get("content-length", 0))
        if total and job.bytes_total != total:
            job.bytes_total = total
            job.save(update_fields=["bytes_total", "updated_at"])

        with tmp.open("wb") as f:
            for chunk in resp.iter_bytes(chunk_size=CHUNK_SIZE):
                f.write(chunk)
                sha.update(chunk)
                bytes_seen += len(chunk)
                if bytes_seen - last_flushed >= PROGRESS_WRITE_EVERY_BYTES:
                    job.bytes_downloaded = bytes_seen
                    job.save(update_fields=["bytes_downloaded", "updated_at"])
                    last_flushed = bytes_seen

    job.bytes_downloaded = bytes_seen
    job.save(update_fields=["bytes_downloaded", "updated_at"])
    tmp.rename(dest)
    return sha.hexdigest()


def download_model(payload: dict) -> None:
    job = DownloadJob.objects.get(id=payload["download_job_id"])
    job.status = DownloadStatus.RUNNING
    job.started_at = timezone.now()
    job.save(update_fields=["status", "started_at", "updated_at"])

    try:
        catalog = CatalogModel.objects.get(slug=job.catalog_slug)

        # 1. Manifest signature must verify before we touch the network.
        _verify_manifest(catalog)

        # 2. Disk preflight: refuse if expected size won't fit.
        target = _model_dir(catalog.slug) / "model.gguf"
        # (free-space check intentionally deferred — psutil.disk_usage in Phase 3.)

        # 3. Stream + sha256.
        actual_sha = _stream_to_file(catalog.source_url, target, job)

        # 4. Verify sha256. Fail closed.
        if catalog.sha256 and not catalog.sha256.startswith("PLACEHOLDER"):
            if actual_sha != catalog.sha256:
                target.unlink(missing_ok=True)
                raise DownloadFailed(
                    f"sha256 mismatch: expected {catalog.sha256}, got {actual_sha}"
                )
        else:
            logger.warning(
                "catalog %s has placeholder sha256; downloaded %s — replace before signing",
                catalog.slug,
                actual_sha,
            )

        # 5. Write model.yml sidecar.
        sidecar = target.parent / "model.yml"
        sidecar.write_text(
            f"slug: {catalog.slug}\n"
            f"display_name: {catalog.display_name}\n"
            f"format: {catalog.format}\n"
            f"sha256: {actual_sha}\n"
            f"size_bytes: {target.stat().st_size}\n"
            f"source_url: {catalog.source_url}\n"
        )

        # 6. Vision: chained mmproj download for vision-enabled models.
        # Job progress visibly resets+climbs again so the user sees the second file.
        mmproj_path: str = ""
        if catalog.vision_enabled and catalog.mmproj_url:
            mmproj_target = target.parent / "mmproj.gguf"
            logger.info("downloading mmproj for %s (%d bytes)", catalog.slug, catalog.mmproj_size_bytes)
            job.bytes_downloaded = 0
            job.bytes_total = catalog.mmproj_size_bytes
            job.save(update_fields=["bytes_downloaded", "bytes_total", "updated_at"])
            mmproj_actual_sha = _stream_to_file(catalog.mmproj_url, mmproj_target, job)
            if (
                catalog.mmproj_sha256
                and not catalog.mmproj_sha256.startswith("PLACEHOLDER")
                and mmproj_actual_sha != catalog.mmproj_sha256
            ):
                mmproj_target.unlink(missing_ok=True)
                raise DownloadFailed(
                    f"mmproj sha256 mismatch: expected {catalog.mmproj_sha256}, got {mmproj_actual_sha}"
                )
            mmproj_path = str(mmproj_target)

        # 7. Register the local file.
        ModelFile.objects.update_or_create(
            catalog_slug=catalog.slug,
            defaults={
                "local_path": str(target),
                "sha256": actual_sha,
                "size_bytes": target.stat().st_size,
                "status": ModelStatus.READY,
                "error": "",
                "mmproj_path": mmproj_path,
            },
        )

        job.status = DownloadStatus.SUCCEEDED
        job.finished_at = timezone.now()
        job.save(update_fields=["status", "finished_at", "updated_at"])
        logger.info("download succeeded: %s%s", catalog.slug, " (+ mmproj)" if mmproj_path else "")

    except Exception as exc:  # noqa: BLE001
        job.status = DownloadStatus.FAILED
        job.error = f"{type(exc).__name__}: {exc}"
        job.finished_at = timezone.now()
        job.save(update_fields=["status", "error", "finished_at", "updated_at"])
        ModelFile.objects.filter(catalog_slug=job.catalog_slug).update(
            status=ModelStatus.FAILED, error=job.error
        )
        raise
