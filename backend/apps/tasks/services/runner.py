"""Worker loop. Used by the `run_worker` management command and the desktop in-process worker.

Two claim strategies, selected by backend capability:
  * Postgres: SELECT ... FOR UPDATE SKIP LOCKED — multiple workers run safely.
  * SQLite (desktop): a single in-process worker; SQLite supports neither row locks nor
    SKIP LOCKED, so we claim optimistically with a guarded UPDATE. WAL + a busy timeout
    (see apps.core.db) make the rare collision a short wait rather than an error.

Each task is dispatched to a handler registered via `handlers.register`.
"""
from __future__ import annotations

import logging
import socket
import time
from typing import Any

from django.db import connection, transaction
from django.utils import timezone

from apps.tasks.models import Task, TaskStatus
from apps.tasks.services import handlers

logger = logging.getLogger(__name__)


def _claim_one_locked(worker_id: str) -> Task | None:
    """Postgres path: row-lock the pending task and skip rows other workers hold."""
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


def _claim_one_optimistic(worker_id: str) -> Task | None:
    """SQLite path: pick the oldest pending task, then claim it with a guarded UPDATE.

    The ``.filter(status=PENDING).update(...)`` only flips a row that is still pending, so
    even if something else grabbed it between the SELECT and the UPDATE we either win the
    row (rowcount 1) or treat it as unavailable (rowcount 0). `.update()` bypasses
    ``auto_now``, so ``updated_at`` is set explicitly.
    """
    now = timezone.now()
    with transaction.atomic():
        task = (
            Task.objects.filter(status=TaskStatus.PENDING, scheduled_at__lte=now)
            .order_by("scheduled_at")
            .first()
        )
        if task is None:
            return None
        claimed = Task.objects.filter(pk=task.pk, status=TaskStatus.PENDING).update(
            status=TaskStatus.RUNNING,
            locked_by=worker_id,
            locked_at=now,
            started_at=now,
            updated_at=now,
        )
    if not claimed:
        return None
    task.refresh_from_db()
    return task


def _claim_one(worker_id: str) -> Task | None:
    if connection.features.has_select_for_update_skip_locked:
        return _claim_one_locked(worker_id)
    return _claim_one_optimistic(worker_id)


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
