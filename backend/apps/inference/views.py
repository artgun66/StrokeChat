"""OpenAI-compatible chat completions endpoint.

Streams via SSE in the OpenAI wire format (`data: {...}\n\n` ... `data: [DONE]\n\n`).
Async Django view (no Channels needed; Channels would only be required for WebSockets).

Optional `thread_id` extension: if present, persists the user message and the assembled
assistant message to apps.threads.
"""
from __future__ import annotations

import asyncio
import json
import logging
from collections.abc import AsyncIterator

from asgiref.sync import sync_to_async
from django.http import HttpRequest, JsonResponse, StreamingHttpResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST

from apps.inference.backends.base import ChatRequest
from apps.inference.dispatcher import get_backend
from apps.inference.services.llamacpp import LlamaCppError
from apps.models_registry.models import ModelFile, ModelStatus

logger = logging.getLogger(__name__)


def _bad_request(detail: str, code: str = "invalid_request") -> JsonResponse:
    return JsonResponse({"error": detail, "code": code}, status=400)


@csrf_exempt
@require_POST
async def chat_completions(request: HttpRequest) -> StreamingHttpResponse | JsonResponse:
    try:
        payload = json.loads(request.body or b"{}")
    except json.JSONDecodeError:
        return _bad_request("body must be JSON")

    model = payload.get("model")
    messages = payload.get("messages")
    if not isinstance(model, str) or not model:
        return _bad_request("`model` (catalog slug) is required")
    if not isinstance(messages, list) or not messages:
        return _bad_request("`messages` must be a non-empty list")
    if not all(isinstance(m, dict) and "role" in m and "content" in m for m in messages):
        return _bad_request("each message needs `role` and `content`")

    thread_id = payload.get("thread_id")  # our extension (optional)

    @sync_to_async
    def _check_ready() -> bool:
        return ModelFile.objects.filter(catalog_slug=model, status=ModelStatus.READY).exists()

    if not await _check_ready():
        return JsonResponse(
            {"error": f"model {model!r} is not downloaded on this runtime", "code": "model_not_ready"},
            status=404,
        )

    # Custom instructions: if this thread has a system_prompt set and the client
    # didn't already include a system message, prepend ours. Clients that already
    # know what they're doing (raw OpenAI clients) keep full control.
    if thread_id and not any(m.get("role") == "system" for m in messages):
        @sync_to_async
        def _get_thread_system_prompt() -> str:
            from apps.threads.models import Thread
            try:
                return Thread.objects.values_list("system_prompt", flat=True).get(id=thread_id) or ""
            except Thread.DoesNotExist:
                return ""

        system_prompt = await _get_thread_system_prompt()
        if system_prompt.strip():
            messages = [{"role": "system", "content": system_prompt}, *messages]

    extra = {k: v for k, v in payload.items() if k not in {"model", "messages", "stream", "thread_id"}}
    backend = get_backend()
    req = ChatRequest(model=model, messages=messages, stream=True, extra=extra)

    async def stream() -> AsyncIterator[bytes]:
        assembled = []
        try:
            async for chunk in backend.chat_completions(req):
                # chunk.delta is the raw OpenAI JSON line from llama-server.
                yield f"data: {chunk.delta}\n\n".encode()
                # Best-effort: pull text out for thread persistence.
                try:
                    obj = json.loads(chunk.delta)
                    delta = obj.get("choices", [{}])[0].get("delta", {}).get("content", "")
                    if delta:
                        assembled.append(delta)
                except (json.JSONDecodeError, IndexError, AttributeError):
                    pass
        except LlamaCppError as exc:
            err = json.dumps({"error": str(exc), "code": "engine_error"})
            yield f"data: {err}\n\n".encode()
        finally:
            yield b"data: [DONE]\n\n"

        if thread_id and assembled:
            # last_user_msg.content may be a string OR an OpenAI-vision array
            # ([{"type":"text","text":...},{"type":"image_url",...}]). Extract just
            # the text portion for the stored Message.content + title-refine prompt;
            # images aren't persisted in v1 (they're ephemeral to this turn).
            user_text = _extract_user_text(messages[-1].get("content"))
            assistant_text = "".join(assembled)
            needs_title = await _persist(thread_id, user_text, assistant_text)
            if needs_title:
                # Fire-and-forget: refine the placeholder title via the LLM after
                # the response is fully streamed. Same model + same warm runner —
                # adds nothing to the user-perceived turn latency.
                asyncio.create_task(
                    _refine_title(thread_id, user_text, assistant_text, model)
                )

    response = StreamingHttpResponse(stream(), content_type="text/event-stream")
    response["Cache-Control"] = "no-cache"
    response["X-Accel-Buffering"] = "no"
    return response


# ----------------------------------------------------------------------------
# Persistence + auto-titling
# ----------------------------------------------------------------------------

_PLACEHOLDER_TITLES = ("", "New thread")
_FALLBACK_TITLE_MAX_CHARS = 60
_REFINED_TITLE_MAX_CHARS = 60


def _extract_user_text(content: object) -> str:
    """Get the plain-text portion of a user message, whether it's a string or a
    OpenAI-vision-format array (each item is {type, text?, image_url?})."""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for item in content:
            if isinstance(item, dict) and item.get("type") == "text":
                t = item.get("text")
                if isinstance(t, str):
                    parts.append(t)
        return "\n".join(parts)
    return ""


@sync_to_async
def _persist(thread_id: str, user_text: str, assistant_text: str) -> bool:
    """Persist the user+assistant pair. Returns True if the thread had a placeholder
    title that was just replaced by a fallback (truncated) title — the caller can then
    schedule LLM-driven title refinement."""
    from apps.threads.models import Message, MessageRole, Thread

    try:
        thread = Thread.objects.get(id=thread_id)
    except Thread.DoesNotExist:
        logger.warning("thread %s not found; skipping persistence", thread_id)
        return False

    Message.objects.create(
        thread=thread,
        role=MessageRole.USER,
        content=user_text,
    )
    Message.objects.create(
        thread=thread,
        role=MessageRole.ASSISTANT,
        content=assistant_text,
    )

    # Set an instant fallback title from the user's opening line so the sidebar
    # has *something* to show within milliseconds. The async refiner overwrites
    # this with a real LLM-generated 2–5 word summary a few seconds later.
    title_was_placeholder = thread.title in _PLACEHOLDER_TITLES and bool(user_text)
    if title_was_placeholder:
        first_line = user_text.strip().split("\n", 1)[0].strip()
        if first_line:
            title = (
                first_line[: _FALLBACK_TITLE_MAX_CHARS - 1].rstrip() + "…"
                if len(first_line) > _FALLBACK_TITLE_MAX_CHARS
                else first_line
            )
            thread.title = title
            thread.save(update_fields=["title", "updated_at"])
    return title_was_placeholder


# ----------------------------------------------------------------------------
# Title refinement: ask the same warm model for a short summary
# ----------------------------------------------------------------------------

_TITLE_PROMPT = (
    "Summarize the topic of this conversation in 2 to 5 words for use as a chat title.\n"
    "Output ONLY the title — no quotes, no punctuation, no prefixes like 'Title:'.\n"
    "Use natural Title Case.\n\n"
    "User: {user}\n"
    "Assistant: {assistant}"
)
_TITLE_INPUT_CLIP = 600  # chars per side fed into the title prompt
_TITLE_GEN_TIMEOUT_SECONDS = 25


async def _refine_title(
    thread_id: str, user_text: str, assistant_text: str, model_slug: str
) -> None:
    """Call the LLM once to derive a clean 2–5 word title, then UPDATE the row.

    Best-effort. On any failure, the fallback title set by `_persist` stays.
    Runs in the background after the user's response is already streamed back.
    """
    backend = get_backend()
    prompt = _TITLE_PROMPT.format(
        user=(user_text or "")[:_TITLE_INPUT_CLIP],
        assistant=(assistant_text or "")[:_TITLE_INPUT_CLIP],
    )
    req = ChatRequest(
        model=model_slug,
        messages=[{"role": "user", "content": prompt}],
        stream=True,
        extra={"max_tokens": 24, "temperature": 0.2},
    )

    try:
        chunks: list[str] = []
        async def _consume() -> None:
            async for c in backend.chat_completions(req):
                try:
                    obj = json.loads(c.delta)
                    piece = obj.get("choices", [{}])[0].get("delta", {}).get("content", "")
                    if piece:
                        chunks.append(piece)
                except (json.JSONDecodeError, IndexError, AttributeError):
                    pass

        await asyncio.wait_for(_consume(), timeout=_TITLE_GEN_TIMEOUT_SECONDS)
        title = _clean_title("".join(chunks))
        if title:
            await _save_title(thread_id, title)
            logger.info("refined title for thread %s: %r", thread_id, title)
    except asyncio.TimeoutError:
        logger.warning("title refine timed out for thread %s", thread_id)
    except Exception as exc:  # noqa: BLE001
        logger.warning("title refine failed for thread %s: %s", thread_id, exc)


def _clean_title(raw: str) -> str:
    """Sanitize an LLM-generated title.

    Strips common prefixes, quotes, trailing punctuation, multi-line junk, and
    caps the length. Returns "" if nothing usable remains."""
    if not raw:
        return ""

    # First non-empty line; LLMs sometimes emit leading whitespace or "Title:" then
    # the actual title on the next line.
    lines = [ln.strip() for ln in raw.splitlines() if ln.strip()]
    if not lines:
        return ""
    line = lines[0]

    # Strip well-known prefixes.
    for prefix in ("Title:", "Topic:", "Subject:", "Chat title:", "Heading:"):
        if line.lower().startswith(prefix.lower()):
            line = line[len(prefix):].strip()

    # Strip surrounding quotes / asterisks / backticks (including curly quotes).
    line = line.strip(' "\'`*“”‘’«»')
    # Trim trailing punctuation that doesn't belong in a title.
    line = line.rstrip(".!?;:,—-")
    # Collapse whitespace.
    line = " ".join(line.split())

    if not line:
        return ""
    if len(line) > _REFINED_TITLE_MAX_CHARS:
        line = line[: _REFINED_TITLE_MAX_CHARS - 1].rstrip() + "…"
    return line


@sync_to_async
def _save_title(thread_id: str, title: str) -> None:
    from apps.threads.models import Thread

    Thread.objects.filter(id=thread_id).update(title=title)
