"""Ed25519 sign/verify for catalog manifests.

Per docs/01-architecture-and-decisions.md §6: every CatalogModel row carries a signature
over a canonical JSON of its provenance fields. Runtime verifies before download.

Keys live in env vars:
  CATALOG_SIGNING_PRIVATE_KEY  (only set on control plane / seed-time)
  CATALOG_SIGNING_PUBLIC_KEY   (everywhere; used to verify before download)

Generate a fresh keypair with:
  python manage.py rotate_catalog_keys --print
"""
from __future__ import annotations

import base64
import json
from typing import Any

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import (
    Ed25519PrivateKey,
    Ed25519PublicKey,
)
from django.conf import settings

# Fields covered by the signature, in canonical order. Anything below this line is
# excluded from the signed payload (e.g. model_metadata, vision_enabled, which are
# informational / derived).
SIGNED_FIELDS = (
    "slug",
    "display_name",
    "family",
    "source_url",
    "source_repo",
    "source_revision",
    "format",
    "compatible_engines",
    "sha256",
    "size_bytes",
    "license_spdx",
    "license_url",
    "license_text_sha256",
    "allowed_use",
    # Optional multimodal projector — empty strings + 0 for text-only rows so signing
    # is deterministic across rows that pre-date the field.
    "mmproj_url",
    "mmproj_sha256",
    "mmproj_size_bytes",
)


def _coerce_signed_payload(row: dict[str, Any]) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for f in SIGNED_FIELDS:
        if f in row:
            out[f] = row[f]
        elif f.startswith("mmproj_"):
            out[f] = 0 if f == "mmproj_size_bytes" else ""
        else:
            raise KeyError(f"signed field {f!r} missing from row")
    return out


def canonical_payload(row: dict[str, Any]) -> bytes:
    """Deterministic JSON of the signed fields. Sorted keys, no whitespace."""
    return json.dumps(_coerce_signed_payload(row), sort_keys=True, separators=(",", ":")).encode()


def generate_keypair() -> tuple[str, str]:
    """Return (private_b64, public_b64). Used by rotation tooling."""
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


def _load_private() -> Ed25519PrivateKey:
    raw = getattr(settings, "CATALOG_SIGNING_PRIVATE_KEY", "")
    if not raw:
        raise RuntimeError(
            "CATALOG_SIGNING_PRIVATE_KEY is not set. "
            "Generate one with: python manage.py rotate_catalog_keys --print"
        )
    return Ed25519PrivateKey.from_private_bytes(base64.b64decode(raw))


def _load_public() -> Ed25519PublicKey:
    raw = getattr(settings, "CATALOG_SIGNING_PUBLIC_KEY", "")
    if not raw:
        raise RuntimeError("CATALOG_SIGNING_PUBLIC_KEY is not set.")
    return Ed25519PublicKey.from_public_bytes(base64.b64decode(raw))


def sign(row: dict[str, Any]) -> str:
    return base64.b64encode(_load_private().sign(canonical_payload(row))).decode()


def verify(row: dict[str, Any], signature_b64: str) -> bool:
    try:
        _load_public().verify(base64.b64decode(signature_b64), canonical_payload(row))
        return True
    except InvalidSignature:
        return False
