"""Shared base model. Every domain model in this codebase inherits BaseModel."""
from __future__ import annotations

from uuid import uuid4

from django.db import models


class BaseModel(models.Model):
    """UUID PK + created/updated timestamps."""

    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True
