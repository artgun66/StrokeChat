"""Shared settings. Profile-specific files override INSTALLED_APPS, DEBUG, and the like."""
from __future__ import annotations

from pathlib import Path

import environ

BASE_DIR = Path(__file__).resolve().parent.parent.parent
PROJECT_ROOT = BASE_DIR.parent

env = environ.Env()
env.read_env(str(PROJECT_ROOT / ".env.local"))

SECRET_KEY = env.str("DJANGO_SECRET_KEY", default="dev-only-do-not-use-in-prod")
DEBUG = env.bool("DJANGO_DEBUG", default=False)
ALLOWED_HOSTS = env.list("DJANGO_ALLOWED_HOSTS", default=["localhost", "127.0.0.1"])

AUTH_PROFILE = env.str("AUTH_PROFILE", default="control_plane")

# --- Apps ---
# Profile-specific settings narrow this list. Day-0 every app shell exists so imports work.
DJANGO_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
]

THIRD_PARTY_APPS = [
    "rest_framework",
    "storages",
    "corsheaders",
]

LOCAL_APPS = [
    "apps.core",
    "apps.authentication",
    "apps.catalog",
    "apps.models_registry",
    "apps.downloads",
    "apps.inference",
    "apps.threads",
    "apps.system",
    "apps.gpu_pool",
    "apps.tasks",
    "apps.biomedparse",
]

INSTALLED_APPS = DJANGO_APPS + THIRD_PARTY_APPS + LOCAL_APPS

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    # corsheaders must be before CommonMiddleware (and ideally first after security).
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

# CORS — driven by env var, comma-separated. In dev, allow the Next.js origin.
CORS_ALLOWED_ORIGINS = env.list(
    "CORS_ALLOWED_ORIGINS",
    default=["http://localhost:3000", "http://127.0.0.1:3000"],
)

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

# --- Database ---
DATABASES = {
    "default": env.db_url(
        "DATABASE_URL",
        default="postgres://local_llm:local_llm@localhost:5432/local_llm",
    ),
}

# Vision chat sends base64-encoded images inside the JSON body (~33% inflation
# vs the raw bytes). Django's default of 2.5 MB rejects ~2 MB-and-up screenshots.
# 32 MB is generous; the frontend also down-scales to 1280 px before sending so
# typical real-world payloads land well under 1 MB.
DATA_UPLOAD_MAX_MEMORY_SIZE = 32 * 1024 * 1024

# --- DRF ---
REST_FRAMEWORK = {
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    "DEFAULT_PARSER_CLASSES": ["rest_framework.parsers.JSONParser"],
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": 50,
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.IsAuthenticated"],
    "EXCEPTION_HANDLER": "apps.core.exceptions.custom_exception_handler",
}

# --- Storage abstraction (FileSystemStorage now, GCSStorage later) ---
DATA_DIR = Path(env.str("DATA_DIR", default=str(BASE_DIR / "data")))
DATA_DIR.mkdir(parents=True, exist_ok=True)

DEFAULT_FILE_STORAGE = env.str(
    "DEFAULT_FILE_STORAGE",
    default="django.core.files.storage.FileSystemStorage",
)
MEDIA_ROOT = str(DATA_DIR)
MEDIA_URL = "/media/"

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

# --- Symmetric crypto (Fernet now, KMS later) ---
FERNET_KEY = env.str("FERNET_KEY", default="")

# --- Catalog manifest signing (Ed25519). See docs §6 + apps/catalog/services/manifest.py ---
CATALOG_SIGNING_PRIVATE_KEY = env.str("CATALOG_SIGNING_PRIVATE_KEY", default="")
CATALOG_SIGNING_PUBLIC_KEY = env.str("CATALOG_SIGNING_PUBLIC_KEY", default="")

# --- llama.cpp runner defaults (see apps/inference/services/llamacpp.py) ---
# n_gpu_layers: 0 = CPU only; 999 = offload all (Metal/CUDA). Set high on Apple Silicon.
LLAMACPP_N_GPU_LAYERS = env.int("LLAMACPP_N_GPU_LAYERS", default=0)
LLAMACPP_DEFAULT_CTX_SIZE = env.int("LLAMACPP_DEFAULT_CTX_SIZE", default=4096)
LLAMACPP_THREADS = env.int("LLAMACPP_THREADS", default=0)  # 0 → runner uses os.cpu_count()

# --- I18n ---
LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# Auth deferred to Phase 4 — we'll set AUTH_USER_MODEL = "authentication.User" then.

# --- Logging ---
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "verbose": {
            "format": "{levelname} {asctime} {name} {message}",
            "style": "{",
        },
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "verbose",
        },
    },
    "root": {"handlers": ["console"], "level": env.str("DJANGO_LOG_LEVEL", default="INFO")},
}
