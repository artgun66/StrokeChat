from django.urls import path
from .views import DownloadView, HealthView, SegmentView

urlpatterns = [
    path("segment/", SegmentView.as_view()),
    path("health/", HealthView.as_view()),
    path("download/<str:job_id>/", DownloadView.as_view()),
]
