from django.urls import path
from .views import HealthView, SegmentView

urlpatterns = [
    path("segment/", SegmentView.as_view()),
    path("health/", HealthView.as_view()),
]
