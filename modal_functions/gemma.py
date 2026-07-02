"""Gemma 3 27B-IT inference on Modal A10G.

Deployed with: modal deploy modal_functions/gemma.py
Called from Django ModalBackend via modal.Function.lookup().
"""
import os
from typing import Iterator

import modal

app = modal.App("gemma")

MODEL_ID = "google/gemma-3-27b-it"
CACHE_DIR = "/model-cache"

model_vol = modal.Volume.from_name("gemma-model-cache", create_if_missing=True)

image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install(
        "torch==2.3.0",
        "transformers>=4.50.0",
        "accelerate",
        "Pillow",
        "sentencepiece",
        "protobuf",
        "huggingface_hub",
    )
)


@app.function(
    gpu="A10G",
    image=image,
    volumes={CACHE_DIR: model_vol},
    timeout=30,
    memory=32768,
    secrets=[modal.Secret.from_dict({"HF_TOKEN": os.environ.get("HF_TOKEN", "")})],
)
def chat_stream(messages: list[dict], extra: dict | None = None) -> Iterator[str]:
    """Stream Gemma response tokens. Each yielded string is an OpenAI-format SSE JSON chunk."""
    import json
    import threading

    import torch
    from transformers import AutoProcessor, AutoModelForImageTextToText, TextIteratorStreamer

    hf_token = os.environ.get("HF_TOKEN")

    # Load model (cached in volume after first run)
    processor = AutoProcessor.from_pretrained(MODEL_ID, cache_dir=CACHE_DIR, token=hf_token)
    model = AutoModelForImageTextToText.from_pretrained(
        MODEL_ID,
        cache_dir=CACHE_DIR,
        token=hf_token,
        torch_dtype=torch.bfloat16,
        device_map="auto",
    )
    model.eval()

    # Build input — handle vision messages (image_url content blocks)
    from PIL import Image as PILImage
    import base64, io, re

    processed_messages = []
    images = []

    for msg in messages:
        content = msg["content"]
        if isinstance(content, list):
            text_parts = []
            for block in content:
                if block.get("type") == "text":
                    text_parts.append(block["text"])
                elif block.get("type") == "image_url":
                    url = block["image_url"]["url"]
                    if url.startswith("data:"):
                        b64 = re.sub(r"^data:[^;]+;base64,", "", url)
                        img = PILImage.open(io.BytesIO(base64.b64decode(b64))).convert("RGB")
                        images.append(img)
                        text_parts.append("<image>")
            processed_messages.append({"role": msg["role"], "content": "\n".join(text_parts)})
        else:
            processed_messages.append(msg)

    chat_text = processor.apply_chat_template(
        processed_messages, tokenize=False, add_generation_prompt=True
    )

    if images:
        inputs = processor(text=chat_text, images=images, return_tensors="pt").to(model.device)
    else:
        inputs = processor(text=chat_text, return_tensors="pt").to(model.device)

    max_new_tokens = (extra or {}).get("max_tokens", 1024)
    temperature = (extra or {}).get("temperature", 0.7)

    streamer = TextIteratorStreamer(processor.tokenizer, skip_prompt=True, skip_special_tokens=True)

    gen_kwargs = {
        **inputs,
        "max_new_tokens": max_new_tokens,
        "temperature": temperature,
        "do_sample": temperature > 0,
        "streamer": streamer,
    }

    thread = threading.Thread(target=model.generate, kwargs=gen_kwargs)
    thread.start()

    chunk_id = "chatcmpl-modal-gemma"
    for token in streamer:
        if token:
            payload = {
                "id": chunk_id,
                "object": "chat.completion.chunk",
                "choices": [{"index": 0, "delta": {"content": token}, "finish_reason": None}],
            }
            yield json.dumps(payload)

    thread.join()

    done_payload = {
        "id": chunk_id,
        "object": "chat.completion.chunk",
        "choices": [{"index": 0, "delta": {}, "finish_reason": "stop"}],
    }
    yield json.dumps(done_payload)
