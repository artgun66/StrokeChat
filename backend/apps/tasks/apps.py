from django.apps import AppConfig


class TasksConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.tasks"

    def ready(self) -> None:
        # Importing handlers wires up the @register decorators.
        from apps.downloads import handlers  # noqa: F401
