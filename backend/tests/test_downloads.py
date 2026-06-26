"""Download lifecycle: create endpoint enqueues a task; runner verifies sha256."""
from __future__ import annotations

import hashlib
from unittest.mock import patch

import pytest
from django.test import Client, override_settings

from apps.catalog.models import CatalogModel
from apps.catalog.services import manifest
from apps.downloads.models import DownloadJob, DownloadStatus
from apps.downloads.services.runner import download_model
from apps.models_registry.models import ModelFile, ModelStatus
from apps.tasks.models import Task


@pytest.fixture
def signing_keys():
    private_b64, public_b64 = manifest.generate_keypair()
    with override_settings(
        CATALOG_SIGNING_PRIVATE_KEY=private_b64,
        CATALOG_SIGNING_PUBLIC_KEY=public_b64,
    ):
        yield


def _signed_catalog(blob: bytes) -> CatalogModel:
    sha = hashlib.sha256(blob).hexdigest()
    row = {
        "slug": "test-model",
        "display_name": "Test Model",
        "family": "test",
        "source_url": "https://example.invalid/model.gguf",
        "source_repo": "x/y",
        "source_revision": "abc",
        "format": "gguf",
        "compatible_engines": ["llamacpp"],
        "sha256": sha,
        "size_bytes": len(blob),
        "license_spdx": "apache-2.0",
        "license_url": "",
        "license_text_sha256": "",
        "allowed_use": "commercial",
    }
    return CatalogModel.objects.create(**row, manifest_signature=manifest.sign(row))


@pytest.mark.django_db
def test_create_download_enqueues_task(signing_keys):
    _signed_catalog(b"hello")
    response = Client().post(
        "/api/downloads/",
        data={"catalog_slug": "test-model"},
        content_type="application/json",
    )
    assert response.status_code == 201, response.json()
    assert DownloadJob.objects.count() == 1
    assert Task.objects.filter(kind="download_model").count() == 1


@pytest.mark.django_db
def test_create_download_unknown_slug_404(signing_keys):
    response = Client().post(
        "/api/downloads/",
        data={"catalog_slug": "nope"},
        content_type="application/json",
    )
    assert response.status_code == 404


class _FakeStream:
    def __init__(self, blob: bytes):
        self.blob = blob
        self.status_code = 200
        self.headers = {"content-length": str(len(blob))}

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def iter_bytes(self, chunk_size: int = 1024):
        yield self.blob


@pytest.mark.django_db
def test_runner_verifies_sha256_and_writes_files(signing_keys, tmp_path, settings):
    settings.DATA_DIR = tmp_path
    blob = b"some-fake-gguf-bytes"
    catalog = _signed_catalog(blob)
    job = DownloadJob.objects.create(catalog_slug=catalog.slug)

    with patch("apps.downloads.services.runner.httpx.stream", return_value=_FakeStream(blob)):
        download_model({"download_job_id": str(job.id)})

    job.refresh_from_db()
    assert job.status == DownloadStatus.SUCCEEDED
    mf = ModelFile.objects.get(catalog_slug="test-model")
    assert mf.status == ModelStatus.READY
    assert (tmp_path / "models" / "test-model" / "model.gguf").read_bytes() == blob
    assert (tmp_path / "models" / "test-model" / "model.yml").exists()


@pytest.mark.django_db
def test_runner_fails_closed_on_sha256_mismatch(signing_keys, tmp_path, settings):
    settings.DATA_DIR = tmp_path
    catalog = _signed_catalog(b"expected")
    catalog.sha256 = "0" * 64  # set after signing so the manifest still verifies for orig blob
    catalog.manifest_signature = manifest.sign({
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
    })
    catalog.save()

    job = DownloadJob.objects.create(catalog_slug=catalog.slug)

    with patch("apps.downloads.services.runner.httpx.stream", return_value=_FakeStream(b"WRONG")):
        with pytest.raises(Exception):
            download_model({"download_job_id": str(job.id)})

    job.refresh_from_db()
    assert job.status == DownloadStatus.FAILED
    assert "sha256" in job.error
    # File should be cleaned up.
    assert not (tmp_path / "models" / catalog.slug / "model.gguf").exists()
