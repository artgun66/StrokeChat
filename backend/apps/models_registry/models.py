"""Local on-disk model state. One row per downloaded model file."""
from __future__ import annotations

from django.db import models

from apps.core.models import BaseModel


class ModelStatus(models.TextChoices):
    DOWNLOADING = "downloading"
    READY = "ready"
    FAILED = "failed"


class ModelFile(BaseModel):
    catalog_slug = models.SlugField(max_length=128, unique=True)
    local_path = models.CharField(max_length=1024)
    sha256 = models.CharField(max_length=64)
    size_bytes = models.BigIntegerField()
    status = models.CharField(
        max_length=16,
        choices=ModelStatus.choices,
        default=ModelStatus.DOWNLOADING,
    )
    error = models.TextField(blank=True, default="")
    # Optional multimodal projector that lives next to model.gguf for vision
    # models. Empty for text-only models. The runner appends `--mmproj <path>`
    # when this is set.
    mmproj_path = models.CharField(max_length=1024, blank=True, default="")

    class Meta:
        db_table = "models_registry_modelfile"
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.catalog_slug} ({self.status})"
