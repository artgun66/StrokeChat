"""Long-running worker loop. Used by the `worker` docker-compose service."""
from __future__ import annotations

from django.core.management.base import BaseCommand

from apps.tasks.services import runner


class Command(BaseCommand):
    help = "Poll the Postgres task queue and run handlers."

    def add_arguments(self, parser):
        parser.add_argument("--poll-interval", type=float, default=1.0)
        parser.add_argument("--once", action="store_true", help="Drain the queue then exit.")

    def handle(self, *args, **opts):
        runner.loop(poll_interval=opts["poll_interval"], once=opts["once"])
