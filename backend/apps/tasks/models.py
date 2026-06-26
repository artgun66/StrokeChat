"""Postgres-backed task queue.

Workers poll this table with SELECT ... FOR UPDATE SKIP LOCKED. The same enqueue()
signature maps to Cloud Tasks later (HTTP-driven workers, same task kinds).

See docs/01-architecture-and-decisions.md §9.
"""
from __future__ import annotations

from django.db import models

from apps.core.models import BaseModel


class TaskStatus(models.TextChoices):
    PENDING = "pending"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"


class Task(BaseModel):
    """A unit of async work. One row per attempt-set; retries reuse the same row."""

    kind = models.CharField(max_length=64, db_index=True)
    payload = models.JSONField(default=dict, blank=True)

    status = models.CharField(
        max_length=16,
        choices=TaskStatus.choices,
        default=TaskStatus.PENDING,
        db_index=True,
    )
    attempts = models.PositiveIntegerField(default=0)
    max_attempts = models.PositiveIntegerField(default=3)
    error = models.TextField(blank=True, default="")

    scheduled_at = models.DateTimeField(auto_now_add=True, db_index=True)
    started_at = models.DateTimeField(null=True, blank=True)
    finished_at = models.DateTimeField(null=True, blank=True)

    locked_by = models.CharField(max_length=128, blank=True, default="")
    locked_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "tasks_task"
        indexes = [
            models.Index(fields=["status", "scheduled_at"]),
        ]

    def __str__(self) -> str:
        return f"{self.kind}#{self.id} ({self.status})"
