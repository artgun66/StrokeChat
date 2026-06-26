from __future__ import annotations

from rest_framework import generics

from apps.catalog.models import CatalogModel
from apps.catalog.serializers import CatalogModelSerializer


class CatalogListView(generics.ListAPIView):
    """List the current catalog. Hides `deprecated` rows by default; pass
    `?include_deprecated=true` to surface them (admin tooling, audits)."""

    serializer_class = CatalogModelSerializer

    def get_queryset(self):
        qs = CatalogModel.objects.all()
        include = self.request.query_params.get("include_deprecated", "").lower()
        if include not in ("1", "true", "yes"):
            qs = qs.filter(deprecated=False)
        return qs


class CatalogDetailView(generics.RetrieveAPIView):
    """Detail view never filters — direct slug lookup must work even after deprecation."""

    queryset = CatalogModel.objects.all()
    serializer_class = CatalogModelSerializer
    lookup_field = "slug"
