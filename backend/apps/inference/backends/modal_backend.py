"""ModalBackend — routes inference to Modal serverless GPU functions.

Used in production (Render) when MODAL_TOKEN_ID is set. Calls Gemma 3 27B-IT
on Modal A10G for chat; BiomedParse and vessel are called directly from their
respective views.
"""
from __future__ import annotations

import json
import logging
from collections.abc import AsyncIterator
from uuid import UUID, uuid4

from apps.inference.backends.base import (
    ChatRequest,
    Chunk,
    HealthStatus,
    ModelHandle,
)

logger = logging.getLogger(__name__)

MODAL_MODEL_SLUG = "medgemma-4b-it"


class ModalBackend:
    target_id: UUID = uuid4()

    async def chat_completions(self, req: ChatRequest) -> AsyncIterator[Chunk]:
        import modal

        fn = modal.Function.from_name("medgemma", "chat_stream")

        async for token_json in fn.remote_gen.aio(req.messages, req.extra or {}):
            yield Chunk(delta=token_json)

    async def list_models(self) -> list[ModelHandle]:
        return [
            ModelHandle(
                id=MODAL_MODEL_SLUG,
                display_name="MedGemma 4B Instruct — vision+text (Modal GPU)",
                context_length=8192,
            )
        ]

    async def health(self) -> HealthStatus:
        return HealthStatus(ok=True, detail="Modal serverless backend")
