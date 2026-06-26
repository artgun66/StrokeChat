from __future__ import annotations

from rest_framework import generics, status
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.response import Response

from apps.catalog.models import CatalogModel
from apps.downloads.models import DownloadJob, DownloadStatus
from apps.downloads.serializers import DownloadJobCreateSerializer, DownloadJobSerializer
from apps.tasks.services.enqueue import enqueue


class DownloadJobListCreateView(generics.ListCreateAPIView):
    queryset = DownloadJob.objects.all()
    serializer_class = DownloadJobSerializer

    def create(self, request, *args, **kwargs):
        body = DownloadJobCreateSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        slug = body.validated_data["catalog_slug"]

        try:
            CatalogModel.objects.get(slug=slug)
        except CatalogModel.DoesNotExist as exc:
            raise NotFound(f"unknown catalog slug: {slug}") from exc

        if DownloadJob.objects.filter(
            catalog_slug=slug,
            status__in=[DownloadStatus.PENDING, DownloadStatus.RUNNING],
        ).exists():
            raise ValidationError({"catalog_slug": "a download for this model is already active"})

        job = DownloadJob.objects.create(catalog_slug=slug)
        handle = enqueue("download_model", {"download_job_id": str(job.id)})
        job.task_id = handle.id
        job.save(update_fields=["task_id", "updated_at"])

        return Response(DownloadJobSerializer(job).data, status=status.HTTP_201_CREATED)


class DownloadJobDetailView(generics.RetrieveAPIView):
    queryset = DownloadJob.objects.all()
    serializer_class = DownloadJobSerializer
    lookup_field = "id"
