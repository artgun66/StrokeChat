"""SQLite connection tuning.

The desktop profile runs on SQLite with two writers in one process (the request/ASGI
threads and the in-process task worker thread). Plain rollback-journal SQLite serializes
all access and deadlocks readers against the writer; WAL lets readers proceed while a
write is in flight, and a busy timeout turns the rare write-write collision into a short
wait instead of an immediate ``database is locked`` error.

Registered from :class:`apps.core.apps.CoreConfig.ready`. The receiver is a no-op on any
non-SQLite backend, so it is harmless under the Postgres dev/control-plane profiles.
"""
from __future__ import annotations

from django.db.backends.signals import connection_created
from django.dispatch import receiver


@receiver(connection_created)
def configure_sqlite(sender, connection, **kwargs) -> None:
    if connection.vendor != "sqlite":
        return
    with connection.cursor() as cursor:
        cursor.execute("PRAGMA journal_mode=WAL;")
        cursor.execute("PRAGMA synchronous=NORMAL;")
        cursor.execute("PRAGMA busy_timeout=30000;")  # 30s — wait out a concurrent writer
        cursor.execute("PRAGMA foreign_keys=ON;")
