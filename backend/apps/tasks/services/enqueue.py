"""enqueue() — the only way app code creates async work.

Backed by the Postgres `tasks_task` table now; the same signature maps to Cloud Tasks later.
See docs/01-architecture-and-decisions.md §9.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class TaskHandle:
    id: str
    kind: str


def enqueue(kind: str, payload: dict[str, Any], *, max_attempts: int = 3) -> TaskHandle:
    from apps.tasks.models import Task

    task = Task.objects.create(kind=kind, payload=payload, max_attempts=max_attempts)
    return TaskHandle(id=str(task.id), kind=kind)
