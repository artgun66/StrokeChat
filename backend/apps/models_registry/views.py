from rest_framework import generics

from apps.models_registry.models import ModelFile
from apps.models_registry.serializers import ModelFileSerializer


class ModelFileListView(generics.ListAPIView):
    queryset = ModelFile.objects.all()
    serializer_class = ModelFileSerializer
