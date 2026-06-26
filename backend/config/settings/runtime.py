"""On-prem runtime profile: download + run models on the enterprise's hardware. Single-tenant."""
from .base import *  # noqa: F401,F403
from .base import DJANGO_APPS, THIRD_PARTY_APPS

DEBUG = False
AUTH_PROFILE = "runtime"

LOCAL_APPS = [
    "apps.core",
    "apps.authentication",
    "apps.catalog",          # local mirror of control-plane catalog
    "apps.models_registry",
    "apps.downloads",
    "apps.inference",
    "apps.threads",
    "apps.system",
    "apps.tasks",
]
INSTALLED_APPS = DJANGO_APPS + THIRD_PARTY_APPS + LOCAL_APPS
