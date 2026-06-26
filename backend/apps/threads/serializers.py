from rest_framework import serializers

from apps.threads.models import Assistant, Message, Thread


class AssistantSerializer(serializers.ModelSerializer):
    class Meta:
        model = Assistant
        fields = [
            "id", "name", "instructions", "default_model_slug",
            "parameters", "created_at", "updated_at",
        ]


class MessageSerializer(serializers.ModelSerializer):
    class Meta:
        model = Message
        fields = [
            "id", "thread", "role", "content", "metadata",
            "tokens_in", "tokens_out", "created_at",
        ]
        read_only_fields = ["id", "tokens_in", "tokens_out", "created_at"]


class ThreadSerializer(serializers.ModelSerializer):
    # Catalog slugs include dots (e.g. "smollm2-1.7b-instruct-q4"). DRF's SlugField
    # validator rejects dots on input even though the model-level SlugField doesn't
    # enforce at the DB layer. Override with a permissive RegexField so PATCH works.
    model_slug = serializers.RegexField(
        regex=r"^[a-zA-Z0-9._-]*$",
        max_length=128,
        required=False,
        allow_blank=True,
    )

    class Meta:
        model = Thread
        fields = [
            "id", "title", "model_slug", "system_prompt", "assistant",
            "parameters", "created_at", "updated_at",
        ]
