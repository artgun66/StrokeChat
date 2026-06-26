"""Generate a fresh Ed25519 keypair for catalog manifest signing.

This does NOT install the keys anywhere — it prints them so you can paste into .env.local
(dev) or your secret manager (later). Per docs/01-architecture-and-decisions.md §5,
production rotation is automated; this command is for bootstrap and dev only.
"""
from __future__ import annotations

from django.core.management.base import BaseCommand

from apps.catalog.services import manifest


class Command(BaseCommand):
    help = "Generate and print a fresh Ed25519 keypair for catalog manifest signing."

    def add_arguments(self, parser):
        parser.add_argument("--print", action="store_true", default=True)

    def handle(self, *args, **opts):
        private_b64, public_b64 = manifest.generate_keypair()
        self.stdout.write("# Paste into .env.local (dev) or your secret manager:")
        self.stdout.write(f"CATALOG_SIGNING_PRIVATE_KEY={private_b64}")
        self.stdout.write(f"CATALOG_SIGNING_PUBLIC_KEY={public_b64}")
