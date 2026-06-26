from django.urls import path

from apps.downloads.views import DownloadJobDetailView, DownloadJobListCreateView

app_name = "downloads"

urlpatterns = [
    path("", DownloadJobListCreateView.as_view(), name="list-create"),
    path("<uuid:id>/", DownloadJobDetailView.as_view(), name="detail"),
]
