"""Desktop profile: single-user, fully local, SQLite-backed. Bundled in the Electron app.

Everything binds to 127.0.0.1 and there is no auth — the control-plane↔runtime trust
boundary that drives JWT cookies, CSRF, RLS multi-tenancy and TLS-required cookies does
not exist when both halves ship inside one app bundle. Secrets (Django key, Fernet key,
catalog signing keypair) are generated per-install under ${DATA_DIR}/secrets.json rather
than shipped, so nothing extractable lives in the distributable.

Selected with DJANGO_SETTINGS_MODULE=config.settings.desktop (set by the Electron launcher).
"""
from .base import *  # noqa: F401,F403
from .base import DATA_DIR, DJANGO_APPS, REST_FRAMEWORK, THIRD_PARTY_APPS
from apps.core.local_secrets import ensure_local_secrets

DEBUG = False
AUTH_PROFILE = "runtime"

# Same app set as the on-prem runtime profile, plus the bundled BiomedParse proxy
# (apps.biomedparse) which runtime.py omits. gpu_pool (Phase 7, control-plane only)
# stays out.
LOCAL_APPS = [
    "apps.core",
    "apps.authentication",
    "apps.catalog",
    "apps.models_registry",
    "apps.downloads",
    "apps.inference",
    "apps.threads",
    "apps.system",
    "apps.tasks",
    "apps.biomedparse",
    "apps.vessel_segmentation",
]
INSTALLED_APPS = DJANGO_APPS + THIRD_PARTY_APPS + LOCAL_APPS

# --- Loopback-only, single user: no auth. ---
ALLOWED_HOSTS = ["127.0.0.1", "localhost"]
REST_FRAMEWORK = {
    **REST_FRAMEWORK,
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.AllowAny"],
}
# The renderer is served by Electron from a non-http origin and calls 127.0.0.1:8000.
CORS_ALLOW_ALL_ORIGINS = True

# --- SQLite (WAL pragmas applied in apps.core.db). ---
# Default to a file under DATA_DIR; the launcher may override via DATABASE_URL.
DATABASES = {
    "default": env.db_url(  # noqa: F405 — env comes from base via *
        "DATABASE_URL",
        default=f"sqlite:///{DATA_DIR / 'local.sqlite3'}",
    ),
}

# --- Per-install secrets (generated once, never shipped). ---
_secrets = ensure_local_secrets(DATA_DIR)
SECRET_KEY = _secrets["django_secret"]
FERNET_KEY = _secrets["fernet_key"]
# Catalog manifests are signed at seed time and verified before download with this
# install's own keypair — a local integrity check, not a remote trust anchor.
CATALOG_SIGNING_PRIVATE_KEY = _secrets["catalog_private"]
CATALOG_SIGNING_PUBLIC_KEY = _secrets["catalog_public"]

# --- Worker ---
# The Tauri supervisor runs `manage.py run_worker` as its own child (mirrors dev.sh), so
# the ASGI process does NOT start an in-process worker. SQLite WAL + the optimistic claim
# (apps.core.db, apps.tasks.services.runner) make a separate writer process safe.
# Set DESKTOP_INPROCESS_WORKER=1 to fold it back into the ASGI process instead.
RUN_INPROCESS_WORKER = env.bool("DESKTOP_INPROCESS_WORKER", default=False)  # noqa: F405
