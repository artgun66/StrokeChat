"""Control plane (Cloud-Run-shaped). Runs locally for v1; deploy target later."""
from .base import *  # noqa: F401,F403
from .base import LOCAL_APPS as _LOCAL_APPS  # noqa: F401
from .base import DJANGO_APPS, THIRD_PARTY_APPS

DEBUG = False

# Control plane = catalog, gpu_pool, auth, tasks, core. NOT runtime-only apps.
LOCAL_APPS = [
    "apps.core",
    "apps.authentication",
    "apps.catalog",
    "apps.gpu_pool",
    "apps.tasks",
]
INSTALLED_APPS = DJANGO_APPS + THIRD_PARTY_APPS + LOCAL_APPS

SECURE_SSL_REDIRECT = True
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
