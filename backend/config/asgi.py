"""ASGI entry point. Channels added in Phase 2 for streaming chat."""
import os

from django.core.asgi import get_asgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.development")

application = get_asgi_application()

# Desktop profile has no separate worker process — run the task queue on a daemon thread
# inside the ASGI process. This block only runs under uvicorn (manage.py commands never
# import config.asgi), so migrations/seeding don't spawn a worker.
from django.conf import settings  # noqa: E402

if getattr(settings, "RUN_INPROCESS_WORKER", False):
    from apps.tasks.services.worker_thread import start_background_worker

    start_background_worker()
