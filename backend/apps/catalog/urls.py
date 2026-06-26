from django.urls import path

from apps.catalog.views import CatalogDetailView, CatalogListView

app_name = "catalog"

urlpatterns = [
    path("", CatalogListView.as_view(), name="list"),
    path("<slug:slug>/", CatalogDetailView.as_view(), name="detail"),
]
