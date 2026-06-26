"""Register the `download_model` task handler. Imported by apps.tasks.apps.ready()."""
from __future__ import annotations

from apps.downloads.services.runner import download_model
from apps.tasks.services import handlers


@handlers.register("download_model")
def _handle_download_model(payload: dict) -> None:
    download_model(payload)
