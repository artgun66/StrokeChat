from rest_framework import serializers

from apps.downloads.models import DownloadJob


class DownloadJobSerializer(serializers.ModelSerializer):
    progress_pct = serializers.FloatField(read_only=True)

    class Meta:
        model = DownloadJob
        fields = [
            "id",
            "catalog_slug",
            "status",
            "bytes_downloaded",
            "bytes_total",
            "progress_pct",
            "error",
            "started_at",
            "finished_at",
            "created_at",
        ]
        read_only_fields = [
            "id", "status", "bytes_downloaded", "bytes_total", "progress_pct",
            "error", "started_at", "finished_at", "created_at",
        ]


class DownloadJobCreateSerializer(serializers.Serializer):
    # Catalog slugs include dots (e.g. "smollm2-1.7b-instruct-q4"). SlugField rejects
    # them on input validation, so use CharField with a permissive pattern.
    catalog_slug = serializers.RegexField(
        regex=r"^[a-zA-Z0-9._-]+$", max_length=128
    )
