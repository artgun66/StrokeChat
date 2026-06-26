"""Download lifecycle. One DownloadJob per click of a Hub download button."""
from __future__ import annotations

from django.db import models

from apps.core.models import BaseModel


class DownloadStatus(models.TextChoices):
    PENDING = "pending"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"


class DownloadJob(BaseModel):
    catalog_slug = models.SlugField(max_length=128, db_index=True)

    status = models.CharField(
        max_length=16,
        choices=DownloadStatus.choices,
        default=DownloadStatus.PENDING,
    )
    bytes_downloaded = models.BigIntegerField(default=0)
    bytes_total = models.BigIntegerField(default=0)
    error = models.TextField(blank=True, default="")

    started_at = models.DateTimeField(null=True, blank=True)
    finished_at = models.DateTimeField(null=True, blank=True)

    task_id = models.CharField(max_length=64, blank=True, default="")

    class Meta:
        db_table = "downloads_downloadjob"
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"download:{self.catalog_slug} ({self.status})"

    @property
    def progress_pct(self) -> float:
        if self.bytes_total <= 0:
            return 0.0
        return min(100.0, (self.bytes_downloaded / self.bytes_total) * 100.0)
