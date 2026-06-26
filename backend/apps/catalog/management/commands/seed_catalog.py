"""Seed the catalog from data/curated.yaml. Idempotent: upserts by slug.

Anything in the DB but not in this YAML gets marked `deprecated=True` so its catalog
row stays auditable and existing user downloads keep resolving by slug — but the Hub
stops promoting it.
"""
from __future__ import annotations

from pathlib import Path

import yaml
from django.core.management.base import BaseCommand, CommandError

from apps.catalog.models import CatalogModel
from apps.catalog.services import manifest

DATA_FILE = Path(__file__).resolve().parent.parent.parent / "data" / "curated.yaml"


class Command(BaseCommand):
    help = (
        "Upsert curated catalog rows from data/curated.yaml, sign each manifest, "
        "and mark catalog rows not present in this YAML as deprecated."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--allow-placeholders",
            action="store_true",
            help="Permit PLACEHOLDER_* values during scaffolding. Refuses in production.",
        )
        parser.add_argument(
            "--no-deprecate",
            action="store_true",
            help="Do not mark missing rows as deprecated (only upsert).",
        )

    # Fields that must be real for a row to be production-ready. Other fields
    # (license_text_sha256) may stay as placeholders; they're informational.
    INTEGRITY_FIELDS = ("source_revision", "sha256", "size_bytes")

    def handle(self, *args, **opts):
        rows = yaml.safe_load(DATA_FILE.read_text())
        if not isinstance(rows, list):
            raise CommandError(f"{DATA_FILE} must be a YAML list")

        created = updated = 0
        seen_slugs: set[str] = set()
        for row in rows:
            if not opts["allow_placeholders"]:
                bad = [
                    f
                    for f in self.INTEGRITY_FIELDS
                    if isinstance(row.get(f), str) and row[f].startswith("PLACEHOLDER_")
                ]
                if bad:
                    raise CommandError(
                        f"row {row['slug']} has PLACEHOLDER values in integrity field(s) "
                        f"{bad}; run `manage.py refresh_catalog_hashes` first, or pass "
                        f"--allow-placeholders to bypass."
                    )

            signature = manifest.sign(row)
            # Force `deprecated=False` on every YAML row in case it was previously demoted.
            obj, was_created = CatalogModel.objects.update_or_create(
                slug=row["slug"],
                defaults={**row, "manifest_signature": signature, "deprecated": False},
            )
            seen_slugs.add(obj.slug)
            if was_created:
                created += 1
                self.stdout.write(self.style.SUCCESS(f"+ {obj.slug}"))
            else:
                updated += 1
                self.stdout.write(f"~ {obj.slug}")

        deprecated_count = 0
        if not opts["no_deprecate"]:
            deprecated_count = (
                CatalogModel.objects.exclude(slug__in=seen_slugs)
                .filter(deprecated=False)
                .update(deprecated=True)
            )
            for obj in CatalogModel.objects.exclude(slug__in=seen_slugs).filter(deprecated=True):
                self.stdout.write(self.style.WARNING(f"- {obj.slug} (deprecated)"))

        self.stdout.write(
            self.style.SUCCESS(
                f"done. created={created} updated={updated} deprecated={deprecated_count} "
                f"total_in_yaml={len(rows)}"
            )
        )
