"""Catalog of curated open-weight models.

Provenance, license, and signature fields are present from day 0 — non-negotiable per
docs/01-architecture-and-decisions.md §6. Adding them later means migrations on prod data.
"""
from __future__ import annotations

from django.db import models

from apps.core.models import BaseModel


class ModelFormat(models.TextChoices):
    GGUF = "gguf"
    SAFETENSORS = "safetensors"
    AWQ = "awq"
    GPTQ = "gptq"


class AllowedUse(models.TextChoices):
    COMMERCIAL = "commercial"
    RESEARCH_ONLY = "research-only"
    RESTRICTED = "restricted"


class ModelTier(models.TextChoices):
    """Hardware-class hint shown in the Hub. Drives sectioning + sane defaults."""

    TINY = "tiny", "Tiny — laptop CPU / edge (≤2B)"
    SMALL = "small", "Small — consumer GPU / Apple Silicon (3B–9B)"
    MEDIUM = "medium", "Medium — workstation GPU (12B–32B)"
    LARGE = "large", "Large — server / multi-GPU (70B+)"
    CODING = "coding", "Coding specialist"


class CatalogModel(BaseModel):
    slug = models.SlugField(max_length=128, unique=True)
    display_name = models.CharField(max_length=200)
    family = models.CharField(max_length=64, db_index=True)
    tier = models.CharField(
        max_length=16,
        choices=ModelTier.choices,
        default=ModelTier.SMALL,
        db_index=True,
    )

    # Provenance — exact pin, never `main`.
    source_url = models.URLField(max_length=500)
    source_repo = models.CharField(max_length=200)
    source_revision = models.CharField(max_length=64)

    # Format + engine compatibility.
    format = models.CharField(max_length=16, choices=ModelFormat.choices)
    compatible_engines = models.JSONField(default=list)

    # Integrity.
    sha256 = models.CharField(max_length=64)
    size_bytes = models.BigIntegerField()

    # License.
    license_spdx = models.CharField(max_length=64)
    license_url = models.URLField(max_length=500, blank=True, default="")
    license_text_sha256 = models.CharField(max_length=64, blank=True, default="")
    allowed_use = models.CharField(max_length=32, choices=AllowedUse.choices)

    # Vision: optional companion file ("multimodal projector") that lets the same
    # model accept image inputs. Empty url + sha256 + 0 size = text-only model.
    # The mmproj file's integrity is part of the signed manifest because tampering
    # with it could change model behavior. `vision_enabled` is just a derived flag
    # for cheap filtering and is *not* signed.
    mmproj_url = models.URLField(max_length=500, blank=True, default="")
    mmproj_sha256 = models.CharField(max_length=64, blank=True, default="")
    mmproj_size_bytes = models.BigIntegerField(default=0)

    # Signature — Ed25519 over the canonical JSON of the integrity-critical fields above.
    # `tier`, `deprecated`, `successor_slug`, `vision_enabled`, `model_metadata` are
    # catalog metadata, not integrity-critical, and stay outside the signed payload.
    manifest_signature = models.CharField(max_length=200)

    # Quick "does this model accept images?" flag. True iff mmproj_url is set;
    # the property below keeps the two in sync for read sites that don't write rows.
    vision_enabled = models.BooleanField(default=False, db_index=True)

    # Lifecycle. When a newer version of the same family launches, the old row gets
    # deprecated=True and successor_slug pointing at the replacement. Existing downloads
    # keep working (they reference local files, not catalog rows); the Hub stops promoting.
    deprecated = models.BooleanField(default=False, db_index=True)
    successor_slug = models.CharField(max_length=128, blank=True, default="")

    # Cached metadata read from the file header (n_ctx, n_layer, etc.).
    model_metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = "catalog_model"
        ordering = ["tier", "family", "display_name"]

    def __str__(self) -> str:
        return self.slug
