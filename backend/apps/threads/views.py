from __future__ import annotations

from rest_framework import generics

from apps.threads.models import Assistant, Message, Thread
from apps.threads.serializers import AssistantSerializer, MessageSerializer, ThreadSerializer


class ThreadListCreateView(generics.ListCreateAPIView):
    queryset = Thread.objects.all()
    serializer_class = ThreadSerializer


class ThreadDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = Thread.objects.all()
    serializer_class = ThreadSerializer
    lookup_field = "id"


class ThreadMessagesListCreateView(generics.ListCreateAPIView):
    serializer_class = MessageSerializer

    def get_queryset(self):
        return Message.objects.filter(thread_id=self.kwargs["thread_id"])

    def perform_create(self, serializer):
        serializer.save(thread_id=self.kwargs["thread_id"])


class AssistantListCreateView(generics.ListCreateAPIView):
    queryset = Assistant.objects.all()
    serializer_class = AssistantSerializer


class AssistantDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = Assistant.objects.all()
    serializer_class = AssistantSerializer
    lookup_field = "id"
