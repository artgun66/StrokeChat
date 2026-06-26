"""Dispatcher: tenant → InferenceBackend.

Phase 2: always returns LocalRuntimeBackend. Phase 7 will look up the tenant's active
target (local-runtime / bare-metal / remote-provider) and instantiate the right one.
"""
from __future__ import annotations

from apps.inference.backends.base import InferenceBackend


def get_backend(*, tenant_id: str | None = None) -> InferenceBackend:  # noqa: ARG001 — Phase 7
    from apps.inference.backends.local_runtime import LocalRuntimeBackend

    return LocalRuntimeBackend()
