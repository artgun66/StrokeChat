import os

from rest_framework import generics
from rest_framework.response import Response

from apps.models_registry.models import ModelFile
from apps.models_registry.serializers import ModelFileSerializer

_MODAL_VIRTUAL_MODEL = {
    "id": "modal-medgemma-27b-it",
    "catalog_slug": "medgemma-27b-it",
    "local_path": "",
    "sha256": "",
    "size_bytes": 0,
    "status": "ready",
    "error": "",
    "mmproj_path": "",
    "created_at": None,
    "updated_at": None,
}


class ModelFileListView(generics.ListAPIView):
    queryset = ModelFile.objects.all()
    serializer_class = ModelFileSerializer

    def list(self, request, *args, **kwargs):
        if os.environ.get("MODAL_TOKEN_ID"):
            return Response({"count": 1, "next": None, "previous": None, "results": [_MODAL_VIRTUAL_MODEL]})
        return super().list(request, *args, **kwargs)
