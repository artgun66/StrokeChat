"""In-process task worker for the desktop profile.

The dev/cloud stack runs the worker as a separate `manage.py run_worker` process. The
desktop bundle has no process supervisor, so instead the ASGI app starts the same
``runner.loop`` on a daemon thread. One worker, single writer — exactly what the SQLite
claim strategy (see runner._claim_one_optimistic) expects.

Started from config.asgi when ``settings.RUN_INPROCESS_WORKER`` is true. Idempotent: the
guard ensures only one thread is ever launched per process even if imported twice.
"""
from __future__ import annotations

import logging
import threading

from apps.tasks.services import runner

logger = logging.getLogger(__name__)

_lock = threading.Lock()
_started = False


def start_background_worker(poll_interval: float = 1.0) -> None:
    global _started
    with _lock:
        if _started:
            return
        _started = True

    thread = threading.Thread(
        target=runner.loop,
        kwargs={"poll_interval": poll_interval},
        name="inproc-task-worker",
        daemon=True,
    )
    thread.start()
    logger.info("in-process task worker started (poll_interval=%ss)", poll_interval)
