from django.urls import path

from apps.threads.views import (
    AssistantDetailView,
    AssistantListCreateView,
    ThreadDetailView,
    ThreadListCreateView,
    ThreadMessagesListCreateView,
)

app_name = "threads"

urlpatterns = [
    path("", ThreadListCreateView.as_view(), name="list-create"),
    path("<uuid:id>/", ThreadDetailView.as_view(), name="detail"),
    path(
        "<uuid:thread_id>/messages/",
        ThreadMessagesListCreateView.as_view(),
        name="messages",
    ),
    path("assistants/", AssistantListCreateView.as_view(), name="assistant-list-create"),
    path("assistants/<uuid:id>/", AssistantDetailView.as_view(), name="assistant-detail"),
]
