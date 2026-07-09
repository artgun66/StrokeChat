"""MedGemma 27B-IT inference on Modal A100 80GB (bfloat16, no quantization).

Deployed with: modal deploy modal_functions/gemma.py
Called from Django ModalBackend via modal.Function.from_name().
"""
import os
from typing import Iterator

import modal

app = modal.App("medgemma")

MODEL_ID = "google/medgemma-27b-it"
CACHE_DIR = "/model-cache"

model_vol = modal.Volume.from_name("medgemma-model-cache", create_if_missing=True)

image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install(
        "torch==2.6.0",
        "transformers>=4.51.0,<5.0.0",
        "accelerate",
        "sentencepiece",
        "protobuf",
        "huggingface_hub",
    )
)

with image.imports():
    import torch
    from transformers import AutoTokenizer, AutoModelForCausalLM, TextIteratorStreamer

_tokenizer = None
_model = None


def _load_model():
    global _tokenizer, _model
    if _model is not None:
        return
    hf_token = os.environ.get("HF_TOKEN")
    _tokenizer = AutoTokenizer.from_pretrained(
        MODEL_ID, cache_dir=CACHE_DIR, token=hf_token
    )
    _model = AutoModelForCausalLM.from_pretrained(
        MODEL_ID,
        cache_dir=CACHE_DIR,
        token=hf_token,
        torch_dtype=torch.bfloat16,
        device_map="auto",
    )
    _model.eval()


@app.function(
    gpu="a100-80gb",
    image=image,
    volumes={CACHE_DIR: model_vol},
    timeout=300,
    memory=32768,
    secrets=[modal.Secret.from_name("hf-secret")],
    min_containers=0,
    max_containers=12,
    scaledown_window=30,
)
def chat_stream(messages: list[dict], extra: dict | None = None) -> Iterator[str]:
    """Stream MedGemma response tokens. Each yielded string is an OpenAI-format SSE JSON chunk."""
    import json
    import threading

    _load_model()

    # Flatten any multimodal content blocks to text only (MedGemma 27B is text-only)
    flat_messages = []
    for msg in messages:
        content = msg["content"]
        if isinstance(content, list):
            text = " ".join(b["text"] for b in content if b.get("type") == "text")
            flat_messages.append({"role": msg["role"], "content": text})
        else:
            flat_messages.append(msg)

    chat_text = _tokenizer.apply_chat_template(
        flat_messages, tokenize=False, add_generation_prompt=True
    )
    inputs = _tokenizer(chat_text, return_tensors="pt").to(_model.device)

    max_new_tokens = (extra or {}).get("max_tokens", 1024)
    temperature = (extra or {}).get("temperature", 0.7)

    streamer = TextIteratorStreamer(_tokenizer, skip_prompt=True, skip_special_tokens=True)

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
