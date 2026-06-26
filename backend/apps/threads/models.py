"""Conversations: Threads, Messages, Assistants."""
from __future__ import annotations

from django.db import models

from apps.core.models import BaseModel


class Assistant(BaseModel):
    """Reusable system prompt + default model + parameters."""

    name = models.CharField(max_length=200)
    instructions = models.TextField(blank=True, default="")
    default_model_slug = models.SlugField(max_length=128, blank=True, default="")
    parameters = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = "threads_assistant"
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return self.name


class Thread(BaseModel):
    title = models.CharField(max_length=200, default="New thread")
    model_slug = models.SlugField(max_length=128, blank=True, default="")
    # Per-thread "custom instructions" — prepended as a `system` message on every
    # chat request. Non-technical users edit this directly in the thread header;
    # the Assistant entity above is for *reusable presets* across threads (later).
    # 4000 chars ≈ ~1000 tokens, leaving plenty of the 4096 ctx-size for actual chat.
    SYSTEM_PROMPT_MAX_CHARS = 4000
    system_prompt = models.TextField(blank=True, default="", max_length=SYSTEM_PROMPT_MAX_CHARS)
    assistant = models.ForeignKey(
        Assistant,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="threads",
    )
    parameters = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = "threads_thread"
        ordering = ["-updated_at"]

    def __str__(self) -> str:
        return self.title


class MessageRole(models.TextChoices):
    USER = "user"
    ASSISTANT = "assistant"
    SYSTEM = "system"
    TOOL = "tool"


class Message(BaseModel):
    thread = models.ForeignKey(Thread, on_delete=models.CASCADE, related_name="messages")
    role = models.CharField(max_length=16, choices=MessageRole.choices)
    content = models.TextField(blank=True, default="")
    metadata = models.JSONField(default=dict, blank=True)

    # Token usage for billing surface (Phase 9). Filled by the chat-completions view on success.
    tokens_in = models.IntegerField(default=0)
    tokens_out = models.IntegerField(default=0)

    class Meta:
        db_table = "threads_message"
        ordering = ["created_at"]
        indexes = [models.Index(fields=["thread", "created_at"])]

    def __str__(self) -> str:
        return f"{self.role}#{self.id}"
