from rest_framework import serializers

from apps.models_registry.models import ModelFile


class ModelFileSerializer(serializers.ModelSerializer):
    class Meta:
        model = ModelFile
        fields = [
            "id",
            "catalog_slug",
            "local_path",
            "sha256",
            "size_bytes",
            "status",
            "error",
            "mmproj_path",
            "created_at",
            "updated_at",
        ]
