"""Storage abstraction.

Per docs/01-architecture-and-decisions.md §9: no `google.cloud.*` imports in app code.
Today this returns FileSystemStorage; the GCP migration swaps `DEFAULT_FILE_STORAGE` to
`storages.backends.gcloud.GoogleCloudStorage` via env var with no app-code change.
"""
from __future__ import annotations

from django.core.files.storage import default_storage


def get_storage():
    """Return the active storage backend (driven by DEFAULT_FILE_STORAGE)."""
    return default_storage
