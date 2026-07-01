"""Per-install secret bootstrap for the desktop profile.

The control-plane↔runtime split needs a shipped keypair; a single self-contained
desktop bundle does not. Shipping a private key inside a distributable would let anyone
extract it, so instead we generate a per-install keypair (and Fernet key + Django secret)
on first launch and persist them under ``${DATA_DIR}/secrets.json`` (0600). The catalog
signature then becomes a *local* integrity check — seed-time signs with this install's
private key, downloads verify with the matching public key — rather than a trust anchor.

This runs at settings-import time so every process (ASGI server, in-process worker,
management commands) sees the same values without the launcher having to inject them.
"""
from __future__ import annotations

import base64
import json
import os
import stat
from pathlib import Path

from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

SECRETS_FILENAME = "secrets.json"


def _new_django_secret() -> str:
    # 50 url-safe chars, same shape as Django's get_random_secret_key output.
    return base64.urlsafe_b64encode(os.urandom(48)).decode().rstrip("=")[:50]


def _new_catalog_keypair() -> tuple[str, str]:
    private = Ed25519PrivateKey.generate()
    private_b64 = base64.b64encode(
        private.private_bytes(
            encoding=serialization.Encoding.Raw,
            format=serialization.PrivateFormat.Raw,
            encryption_algorithm=serialization.NoEncryption(),
        )
    ).decode()
    public_b64 = base64.b64encode(
        private.public_key().public_bytes(
            encoding=serialization.Encoding.Raw,
            format=serialization.PublicFormat.Raw,
        )
    ).decode()
    return private_b64, public_b64


def ensure_local_secrets(data_dir: Path | str) -> dict[str, str]:
    """Load ``${data_dir}/secrets.json``, generating any missing values, and return them.

    Idempotent: existing values are preserved; only missing keys are minted. Env vars,
    when set, win over the file so a developer can still override.
    """
    path = Path(data_dir) / SECRETS_FILENAME

    stored: dict[str, str] = {}
    if path.exists():
        try:
            stored = json.loads(path.read_text())
        except (json.JSONDecodeError, OSError):
            stored = {}

    private = stored.get("catalog_private") or ""
    public = stored.get("catalog_public") or ""
    # A keypair must be internally consistent: regenerate both if either is missing.
    if not (private and public):
        private, public = _new_catalog_keypair()

    secrets = {
        "django_secret": stored.get("django_secret") or _new_django_secret(),
        "fernet_key": stored.get("fernet_key") or Fernet.generate_key().decode(),
        "catalog_private": private,
        "catalog_public": public,
    }

    if secrets != stored:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(secrets, indent=2))
        try:
            path.chmod(stat.S_IRUSR | stat.S_IWUSR)  # 0600
        except OSError:
            pass  # best-effort; Windows ignores POSIX mode bits

    # Explicit env vars override the persisted file.
    return {
        "django_secret": os.environ.get("DJANGO_SECRET_KEY") or secrets["django_secret"],
        "fernet_key": os.environ.get("FERNET_KEY") or secrets["fernet_key"],
        "catalog_private": os.environ.get("CATALOG_SIGNING_PRIVATE_KEY") or secrets["catalog_private"],
        "catalog_public": os.environ.get("CATALOG_SIGNING_PUBLIC_KEY") or secrets["catalog_public"],
    }
