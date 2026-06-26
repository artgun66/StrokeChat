"""Local dev settings."""
from .base import *  # noqa: F401,F403
from .base import REST_FRAMEWORK as _REST_FRAMEWORK

DEBUG = True
ALLOWED_HOSTS = ["*"]

# Looser permissions during scaffolding; tightens to IsAuthenticated when auth lands (Phase 4).
REST_FRAMEWORK = {
    **_REST_FRAMEWORK,
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.AllowAny"],
}
