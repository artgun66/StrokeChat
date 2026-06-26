"""LocalRuntimeBackend — the v1 inference path.

Per docs §5: implements `InferenceBackend`. Wraps `LlamaCppRunner` and forwards OpenAI
chat-completions requests to llama-server's natively-OpenAI-compatible endpoint.
"""
from __future__ import annotations

from collections.abc import AsyncIterator
from uuid import UUID, uuid4

import httpx

from apps.inference.backends.base import (
    ChatRequest,
    Chunk,
    HealthStatus,
    ModelHandle,
)
from apps.inference.services.llamacpp import LlamaCppError, get_runner
from apps.models_registry.models import ModelFile, ModelStatus


class LocalRuntimeBackend:
    target_id: UUID = uuid4()  # fixed-per-process; replaced with a real ID once persisted

    async def chat_completions(self, req: ChatRequest) -> AsyncIterator[Chunk]:
        from asgiref.sync import sync_to_async

        @sync_to_async
        def _resolve() -> tuple[str, str]:
            mf = ModelFile.objects.get(catalog_slug=req.model, status=ModelStatus.READY)
            return mf.local_path, mf.mmproj_path or ""

        model_path, mmproj_path = await _resolve()

        @sync_to_async
        def _start() -> str:
            runner = get_runner()
            runner.start(req.model, model_path, mmproj_path)
            return runner.base_url_for(req.model)

        base_url = await _start()
        url = f"{base_url}/v1/chat/completions"

        body = {
            "model": req.model,
            "messages": req.messages,
            "stream": True,
            **(req.extra or {}),
        }

        async with httpx.AsyncClient(timeout=httpx.Timeout(None, read=None)) as client:
            async with client.stream("POST", url, json=body) as resp:
                if resp.status_code != 200:
                    text = await resp.aread()
                    raise LlamaCppError(f"llama-server returned {resp.status_code}: {text[:500]!r}")
                async for line in resp.aiter_lines():
                    if not line:
                        continue
                    if not line.startswith("data: "):
                        continue
                    data = line[len("data: "):]
                    if data.strip() == "[DONE]":
                        return
                    yield Chunk(delta=data)  # raw OpenAI chunk JSON; view re-emits as SSE

    async def list_models(self) -> list[ModelHandle]:
        from asgiref.sync import sync_to_async

        @sync_to_async
        def _list() -> list[ModelHandle]:
            return [
                ModelHandle(
                    id=mf.catalog_slug,
                    display_name=mf.catalog_slug,
                    context_length=4096,
                )
                for mf in ModelFile.objects.filter(status=ModelStatus.READY)
            ]

        return await _list()

    async def health(self) -> HealthStatus:
        from asgiref.sync import sync_to_async

        @sync_to_async
        def _h() -> dict:
            return get_runner().health()

        info = await _h()
        return HealthStatus(ok=True, detail=str(info))
