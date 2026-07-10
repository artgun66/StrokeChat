"""Dispatcher: tenant → InferenceBackend.

Returns ModalBackend when MODAL_TOKEN_ID is set (production/Render),
otherwise LocalRuntimeBackend (local dev with llama-server).
"""
from __future__ import annotations

import os

from apps.inference.backends.base import InferenceBackend


def get_backend(*, tenant_id: str | None = None) -> InferenceBackend:  # noqa: ARG001
    if os.environ.get("MODAL_TOKEN_ID") or os.environ.get("RENDER"):
        from apps.inference.backends.modal_backend import ModalBackend
        return ModalBackend()

    from apps.inference.backends.local_runtime import LocalRuntimeBackend
    return LocalRuntimeBackend()
