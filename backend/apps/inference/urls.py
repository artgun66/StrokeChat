from django.urls import path

from apps.inference.views import chat_completions

app_name = "inference"

urlpatterns = [
    path("chat/completions", chat_completions, name="chat-completions"),
]
