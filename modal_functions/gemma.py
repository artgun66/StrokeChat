"""MedGemma 4B-IT multimodal inference on Modal A10G (bfloat16).

4B is the multimodal variant — accepts both images and text.
27B is text-only and cannot process images.

Deployed with: modal deploy modal_functions/gemma.py
Called from Django via HTTP SSE to the public fastapi_endpoint URL.
No Modal SDK credentials needed on the caller side.
"""
import os
from typing import Iterator

import modal

app = modal.App("medgemma")

MODEL_ID = "google/medgemma-4b-it"
CACHE_DIR = "/model-cache"

model_vol = modal.Volume.from_name("medgemma-model-cache", create_if_missing=True)

image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install(
        "torch==2.6.0",
        "torchvision",
        "transformers>=4.51.0,<5.0.0",
        "accelerate",
        "Pillow",
        "sentencepiece",
        "protobuf",
        "huggingface_hub",
        "fastapi[standard]",
    )
)

with image.imports():
    import torch
    from transformers import AutoProcessor, AutoModelForImageTextToText, TextIteratorStreamer

_processor = None
_model = None


def _load_model():
    global _processor, _model
    if _model is not None:
        return
    hf_token = os.environ.get("HF_TOKEN")
    # Try local cache first (model pre-cached in volume); fall back to download.
    # Newer transformers re-validates gated access even on cache hits, so we
    # explicitly use local_files_only to skip that network check.
    for local_only in (True, False):
        try:
            _processor = AutoProcessor.from_pretrained(
                MODEL_ID, cache_dir=CACHE_DIR, token=hf_token, local_files_only=local_only
            )
            _model = AutoModelForImageTextToText.from_pretrained(
                MODEL_ID,
                cache_dir=CACHE_DIR,
                token=hf_token,
                local_files_only=local_only,
                torch_dtype=torch.bfloat16,
                device_map="auto",
            )
            _model.eval()
            return
        except Exception:
            if not local_only:
                raise


def _generate_tokens(messages: list[dict], extra: dict | None = None) -> Iterator[str]:
    """Core inference — yields OpenAI-format JSON chunk strings."""
    import json
    import threading
    import base64
    import io
    import re
    from PIL import Image as PILImage

    _load_model()

    processed_messages = []
    images = []

    for msg in messages:
        content = msg["content"]
        if isinstance(content, list):
            parts = []
            for block in content:
                if block.get("type") == "text":
                    parts.append(block["text"])
                elif block.get("type") == "image_url":
                    url = block["image_url"]["url"]
                    if url.startswith("data:"):
                        b64 = re.sub(r"^data:[^;]+;base64,", "", url)
                        img = PILImage.open(io.BytesIO(base64.b64decode(b64))).convert("RGB")
                        images.append(img)
                        parts.append("<image>")
            processed_messages.append({"role": msg["role"], "content": "\n".join(parts)})
        else:
            processed_messages.append(msg)

    chat_text = _processor.apply_chat_template(
        processed_messages, tokenize=False, add_generation_prompt=True
    )

    if images:
        inputs = _processor(text=chat_text, images=images, return_tensors="pt").to(_model.device)
    else:
        inputs = _processor(text=chat_text, return_tensors="pt").to(_model.device)

    max_new_tokens = (extra or {}).get("max_tokens", 1024)
    temperature = (extra or {}).get("temperature", 0.7)

    streamer = TextIteratorStreamer(_processor.tokenizer, skip_prompt=True, skip_special_tokens=True)

    thread = threading.Thread(target=_model.generate, kwargs={
        **inputs,
        "max_new_tokens": max_new_tokens,
        "temperature": temperature,
        "do_sample": temperature > 0,
        "streamer": streamer,
    })
    thread.start()

    chunk_id = "chatcmpl-modal-medgemma"
    for token in streamer:
        if token:
            yield json.dumps({
                "id": chunk_id,
                "object": "chat.completion.chunk",
                "choices": [{"index": 0, "delta": {"content": token}, "finish_reason": None}],
            })

    thread.join()

    yield json.dumps({
        "id": chunk_id,
        "object": "chat.completion.chunk",
        "choices": [{"index": 0, "delta": {}, "finish_reason": "stop"}],
    })


@app.function(
    gpu="A10G",
    image=image,
    volumes={CACHE_DIR: model_vol},
    timeout=300,
    memory=16384,
    secrets=[modal.Secret.from_name("hf-secret")],
    min_containers=0,
    max_containers=12,
    scaledown_window=30,
)
@modal.fastapi_endpoint(method="POST")
def chat_http(item: dict):
    """Public HTTP SSE endpoint — no Modal credentials needed on the caller side."""
    from fastapi.responses import StreamingResponse

    messages = item.get("messages", [])
    extra = item.get("extra") or {}

    def generate():
        for token_json in _generate_tokens(messages, extra):
            yield f"data: {token_json}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")
