"""Worker loop. Used by the `run_worker` management command.

Polls the Postgres task table with SELECT ... FOR UPDATE SKIP LOCKED so multiple workers
can run safely. Each task is dispatched to a handler registered via `handlers.register`.
"""
from __future__ import annotations

import logging
import socket
import time
from typing import Any

from django.db import transaction
from django.utils import timezone

from apps.tasks.models import Task, TaskStatus
from apps.tasks.services import handlers

logger = logging.getLogger(__name__)


def _claim_one(worker_id: str) -> Task | None:
    with transaction.atomic():
        task = (
            Task.objects.select_for_update(skip_locked=True)
            .filter(status=TaskStatus.PENDING, scheduled_at__lte=timezone.now())
            .order_by("scheduled_at")
            .first()
        )
        if task is None:
            return None
        task.status = TaskStatus.RUNNING
        task.locked_by = worker_id
        task.locked_at = timezone.now()
        task.started_at = timezone.now()
        task.save(update_fields=["status", "locked_by", "locked_at", "started_at", "updated_at"])
        return task


def _run_one(task: Task) -> None:
    try:
        handler = handlers.get(task.kind)
    except LookupError as exc:
        task.status = TaskStatus.FAILED
        task.error = str(exc)
        task.finished_at = timezone.now()
        task.save(update_fields=["status", "error", "finished_at", "updated_at"])
        return

    try:
        handler(task.payload or {})
    except Exception as exc:  # noqa: BLE001 — outer boundary
        task.attempts += 1
        task.error = f"{type(exc).__name__}: {exc}"
        if task.attempts >= task.max_attempts:
            task.status = TaskStatus.FAILED
            task.finished_at = timezone.now()
        else:
            task.status = TaskStatus.PENDING  # will retry
            task.locked_by = ""
            task.locked_at = None
        task.save(update_fields=[
            "status", "attempts", "error", "finished_at", "locked_by", "locked_at", "updated_at",
        ])
        logger.exception("task %s failed (attempt %s)", task.id, task.attempts)
        return

    task.status = TaskStatus.SUCCEEDED
    task.finished_at = timezone.now()
    task.error = ""
    task.save(update_fields=["status", "finished_at", "error", "updated_at"])


def loop(*, poll_interval: float = 1.0, once: bool = False) -> None:
    worker_id = f"{socket.gethostname()}#{int(time.time())}"
    logger.info("worker %s starting; known kinds=%s", worker_id, handlers.known_kinds())

    while True:
        task = _claim_one(worker_id)
        if task is None:
            if once:
                return
            time.sleep(poll_interval)
            continue
        logger.info("running task %s kind=%s", task.id, task.kind)
        _run_one(task)


def fetch(task_id: str) -> dict[str, Any]:
    """Convenience for tests."""
    task = Task.objects.get(id=task_id)
    return {
        "id": str(task.id),
        "kind": task.kind,
        "status": task.status,
        "attempts": task.attempts,
        "error": task.error,
    }
