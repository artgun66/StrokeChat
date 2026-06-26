from __future__ import annotations

from rest_framework import serializers

from apps.catalog.models import CatalogModel


class CatalogModelSerializer(serializers.ModelSerializer):
    class Meta:
        model = CatalogModel
        fields = [
            "id",
            "slug",
            "display_name",
            "family",
            "tier",
            "source_url",
            "source_repo",
            "source_revision",
            "format",
            "compatible_engines",
            "sha256",
            "size_bytes",
            "license_spdx",
            "license_url",
            "allowed_use",
            "manifest_signature",
            "deprecated",
            "successor_slug",
            "model_metadata",
            "vision_enabled",
            "mmproj_url",
            "mmproj_sha256",
            "mmproj_size_bytes",
        ]
