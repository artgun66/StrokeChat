"""Gemma 3 27B-IT inference on Modal A10G (4-bit quantized).

Deployed with: modal deploy modal_functions/gemma.py
Called from Django ModalBackend via modal.Function.from_name().
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
        "torch==2.6.0",
        "transformers>=4.51.0,<5.0.0",
        "accelerate",
        "bitsandbytes",
        "Pillow",
        "sentencepiece",
        "protobuf",
        "huggingface_hub",
    )
)

with image.imports():
    import torch
    from transformers import (
        AutoProcessor,
        AutoModelForImageTextToText,
        BitsAndBytesConfig,
        TextIteratorStreamer,
    )

_processor = None
_model = None


def _load_model():
    global _processor, _model
    if _model is not None:
        return
    hf_token = os.environ.get("HF_TOKEN")
    bnb_config = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_compute_dtype=torch.bfloat16,
        bnb_4bit_use_double_quant=True,
        bnb_4bit_quant_type="nf4",
    )
    _processor = AutoProcessor.from_pretrained(
        MODEL_ID, cache_dir=CACHE_DIR, token=hf_token, use_fast=True
    )
    _model = AutoModelForImageTextToText.from_pretrained(
        MODEL_ID,
        cache_dir=CACHE_DIR,
        token=hf_token,
        quantization_config=bnb_config,
        device_map="auto",
    )
    _model.eval()


@app.function(
    gpu="A10G",
    image=image,
    volumes={CACHE_DIR: model_vol},
    timeout=300,
    memory=32768,
    secrets=[modal.Secret.from_name("hf-secret")],
)
def chat_stream(messages: list[dict], extra: dict | None = None) -> Iterator[str]:
    """Stream Gemma response tokens. Each yielded string is an OpenAI-format SSE JSON chunk."""
    import json
    import threading
    import base64, io, re
    from PIL import Image as PILImage

    _load_model()

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

    chunk_id = "chatcmpl-modal-gemma"
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
