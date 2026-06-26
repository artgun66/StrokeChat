"""Bare-metal GPU box auth shim (Phase 7). Slim profile that only verifies per-request JWTs."""
from .base import *  # noqa: F401,F403
from .base import DJANGO_APPS, THIRD_PARTY_APPS

DEBUG = False
AUTH_PROFILE = "baremetal"

LOCAL_APPS = [
    "apps.core",
    "apps.inference",
    "apps.system",
]
INSTALLED_APPS = DJANGO_APPS + THIRD_PARTY_APPS + LOCAL_APPS
