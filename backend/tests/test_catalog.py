"""Catalog: manifest sign/verify roundtrip + list API."""
from __future__ import annotations

import pytest
from django.test import Client, override_settings

from apps.catalog.models import CatalogModel
from apps.catalog.services import manifest


@pytest.fixture
def signing_keys():
    private_b64, public_b64 = manifest.generate_keypair()
    with override_settings(
        CATALOG_SIGNING_PRIVATE_KEY=private_b64,
        CATALOG_SIGNING_PUBLIC_KEY=public_b64,
    ):
        yield private_b64, public_b64


def _row():
    return {
        "slug": "qwen2.5-0.5b-instruct-q4",
        "display_name": "Qwen 2.5 0.5B",
        "family": "qwen2.5",
        "source_url": "https://huggingface.co/x/y.gguf",
        "source_repo": "x/y",
        "source_revision": "abc123",
        "format": "gguf",
        "compatible_engines": ["llamacpp"],
        "sha256": "0" * 64,
        "size_bytes": 1234,
        "license_spdx": "apache-2.0",
        "license_url": "",
        "license_text_sha256": "",
        "allowed_use": "commercial",
    }


def test_manifest_sign_verify_roundtrip(signing_keys):
    row = _row()
    sig = manifest.sign(row)
    assert manifest.verify(row, sig) is True


def test_manifest_verify_rejects_tampered_row(signing_keys):
    row = _row()
    sig = manifest.sign(row)
    tampered = {**row, "sha256": "1" * 64}
    assert manifest.verify(tampered, sig) is False


@pytest.mark.django_db
def test_catalog_list_endpoint(signing_keys):
    row = _row()
    CatalogModel.objects.create(**row, manifest_signature=manifest.sign(row))
    response = Client().get("/api/catalog/")
    assert response.status_code == 200
    body = response.json()
    items = body.get("results", body) if isinstance(body, dict) else body
    assert len(items) == 1
    assert items[0]["slug"] == "qwen2.5-0.5b-instruct-q4"
