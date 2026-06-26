from django.urls import path

from apps.models_registry.views import ModelFileListView

app_name = "models_registry"

urlpatterns = [
    path("", ModelFileListView.as_view(), name="list"),
]
