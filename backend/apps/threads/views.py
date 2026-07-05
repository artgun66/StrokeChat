from __future__ import annotations

from rest_framework import generics
from rest_framework.exceptions import PermissionDenied

from apps.threads.models import Assistant, Message, Thread
from apps.threads.serializers import AssistantSerializer, MessageSerializer, ThreadSerializer


def _session_key(request) -> str | None:
    return request.headers.get("X-Session-Key") or request.COOKIES.get("session_key") or None


class ThreadListCreateView(generics.ListCreateAPIView):
    serializer_class = ThreadSerializer

    def get_queryset(self):
        sk = _session_key(self.request)
        if sk:
            return Thread.objects.filter(session_key=sk)
        return Thread.objects.none()

    def perform_create(self, serializer):
        sk = _session_key(self.request)
        serializer.save(session_key=sk)


class ThreadDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = ThreadSerializer
    lookup_field = "id"

    def get_queryset(self):
        sk = _session_key(self.request)
        if sk:
            return Thread.objects.filter(session_key=sk)
        return Thread.objects.none()


class ThreadMessagesListCreateView(generics.ListCreateAPIView):
    serializer_class = MessageSerializer

    def _get_thread(self):
        sk = _session_key(self.request)
        qs = Thread.objects.filter(id=self.kwargs["thread_id"])
        if sk:
            qs = qs.filter(session_key=sk)
        thread = qs.first()
        if thread is None:
            raise PermissionDenied()
        return thread

    def get_queryset(self):
        thread = self._get_thread()
        return Message.objects.filter(thread=thread)

    def perform_create(self, serializer):
        thread = self._get_thread()
        serializer.save(thread=thread)


class AssistantListCreateView(generics.ListCreateAPIView):
    queryset = Assistant.objects.all()
    serializer_class = AssistantSerializer


class AssistantDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = Assistant.objects.all()
    serializer_class = AssistantSerializer
    lookup_field = "id"
