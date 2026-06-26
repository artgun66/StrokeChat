"""InferenceBackend protocol. Concrete backends land in Phase 2 (local) / 7 (bare-metal) / 8 (remote)."""
from __future__ import annotations

from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Protocol
from uuid import UUID


@dataclass(frozen=True)
class ChatRequest:
    model: str
    messages: list[dict]
    stream: bool = True
    extra: dict | None = None


@dataclass(frozen=True)
class Chunk:
    delta: str
    finish_reason: str | None = None


@dataclass(frozen=True)
class ModelHandle:
    id: str
    display_name: str
    context_length: int


@dataclass(frozen=True)
class HealthStatus:
    ok: bool
    detail: str = ""


class InferenceBackend(Protocol):
    target_id: UUID

    async def chat_completions(self, req: ChatRequest) -> AsyncIterator[Chunk]:
        ...

    async def list_models(self) -> list[ModelHandle]:
        ...

    async def health(self) -> HealthStatus:
        ...
