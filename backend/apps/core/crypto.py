"""Symmetric crypto abstraction.

Per docs/01-architecture-and-decisions.md §9: Fernet now, Cloud KMS later. App code calls
encrypt()/decrypt() and never imports the underlying library directly.
"""
from __future__ import annotations

from django.conf import settings


def _cipher():
    from cryptography.fernet import Fernet

    key = settings.FERNET_KEY
    if not key:
        raise RuntimeError(
            "FERNET_KEY is not set. Generate one with: "
            'python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"'
        )
    return Fernet(key.encode() if isinstance(key, str) else key)


def encrypt(plaintext: str) -> str:
    return _cipher().encrypt(plaintext.encode()).decode()


def decrypt(ciphertext: str) -> str:
    return _cipher().decrypt(ciphertext.encode()).decode()
