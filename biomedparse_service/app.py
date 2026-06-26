"""BiomedParse inference microservice.

Loads the fine-tuned BiomedParse model once and serves segmentation requests
on POST /segment. Returns detection result + base64 overlay image.
"""
from __future__ import annotations

import base64
import io
import os
import sys
import logging
from contextlib import asynccontextmanager
from pathlib import Path

import cv2
import numpy as np
import torch
import torch.nn.functional as F
from fastapi import FastAPI, File, Form, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image

# ── paths ────────────────────────────────────────────────────────────────────
SERVICE_DIR = Path(__file__).parent
BIOMEDPARSE_DIR = SERVICE_DIR.parent / "artun_model" / "BiomedParse"
FINETUNED_CKPT = SERVICE_DIR.parent / "artun_model" / "outputs" / "checkpoints" / "last-v5.ckpt"
BASE_CKPT = BIOMEDPARSE_DIR / "checkpoints" / "biomedparse_v2.ckpt"

sys.path.insert(0, str(BIOMEDPARSE_DIR))
os.chdir(BIOMEDPARSE_DIR)  # Hydra resolves config paths relative to cwd

import hydra
from hydra import compose
from hydra.core.global_hydra import GlobalHydra

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

PRESET_PROMPTS = {
    "bleeding": "is there a bleeding in the image",
    "stroke": "is there a stroke in the image",
    "healthy": "is the image healthy",
}

# ── model state ──────────────────────────────────────────────────────────────
_model: object = None
_device: torch.device = None


def _load_checkpoint(model, path: Path, device: torch.device):
    checkpoint = torch.load(str(path), map_location=device)
    if "state_dict" in checkpoint:
        state_dict = checkpoint["state_dict"]
    elif "model" in checkpoint:
        state_dict = checkpoint["model"]
    else:
        state_dict = checkpoint
    cleaned = {
        (k[6:] if k.startswith("model.") else k): v
        for k, v in state_dict.items()
    }
    model.load_state_dict(cleaned, strict=False)
    return model


def _init_model():
    global _model, _device
    _device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    logger.info("Using device: %s", _device)

    GlobalHydra.instance().clear()
    hydra.initialize_config_dir(config_dir=str(BIOMEDPARSE_DIR / "configs"), job_name="biomedparse_service", version_base=None)
    cfg = compose(config_name="evaluate_biomedparse_2D")

    ckpt_path = FINETUNED_CKPT if FINETUNED_CKPT.exists() else BASE_CKPT
    logger.info("Loading checkpoint: %s", ckpt_path)

    model = hydra.utils.instantiate(cfg.model, _convert_="object")
    model = _load_checkpoint(model, ckpt_path, _device)
    model = model.to(_device).eval()
    _model = model
    logger.info("Model ready")


# ── image helpers ─────────────────────────────────────────────────────────────

def _preprocess(img_bytes: bytes) -> torch.Tensor:
    arr = np.frombuffer(img_bytes, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Could not decode image")
    img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    img = cv2.resize(img, (512, 512), interpolation=cv2.INTER_LINEAR)
    tensor = torch.from_numpy(img).permute(2, 0, 1).float()
    return tensor.unsqueeze(0)


def _run_inference(image_tensor: torch.Tensor, prompt: str):
    image_tensor = image_tensor.to(_device)
    with torch.no_grad():
        out = _model({"image": image_tensor, "text": [prompt]}, mode="eval")
    preds = out["predictions"]

    # detection probability
    oe = preds["object_existence"]
    if isinstance(oe, torch.Tensor):
        oe = oe.detach().to(torch.float32).squeeze()
        prob = torch.sigmoid(oe).mean().item() if oe.numel() > 1 else torch.sigmoid(oe).item()
    else:
        prob = float(oe)
    detected = prob > 0.5

    # segmentation mask
    pred_mask = None
    gmasks = preds.get("pred_gmasks")
    if gmasks is not None:
        if gmasks.shape[-2:] != (512, 512):
            gmasks = F.interpolate(gmasks, size=(512, 512), mode="bicubic",
                                   align_corners=False, antialias=True)
        mask_prob = torch.sigmoid(gmasks)
        if mask_prob.shape[1] > 1:
            mask_prob = mask_prob.mean(dim=1, keepdim=True)
        if detected:
            pred_mask = (mask_prob > 0.5).squeeze().cpu().numpy().astype(np.uint8) * 255
            if pred_mask.ndim < 2 or pred_mask.shape != (512, 512):
                pred_mask = np.zeros((512, 512), dtype=np.uint8)
        else:
            pred_mask = np.zeros((512, 512), dtype=np.uint8)

    return detected, prob, pred_mask


def _make_overlay(img_bytes: bytes, mask: np.ndarray | None) -> str:
    """Return base64-encoded PNG of original image with red mask overlay."""
    arr = np.frombuffer(img_bytes, dtype=np.uint8)
    orig = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    orig = cv2.cvtColor(orig, cv2.COLOR_BGR2RGB)
    orig_resized = cv2.resize(orig, (512, 512))

    if mask is not None and mask.max() > 0:
        overlay = orig_resized.copy()
        red_mask = np.zeros_like(orig_resized)
        red_mask[mask > 0] = [255, 50, 50]
        alpha = 0.45
        overlay = cv2.addWeighted(orig_resized, 1 - alpha, red_mask, alpha, 0)
        # draw contour
        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        cv2.drawContours(overlay, contours, -1, (255, 80, 80), 2)
    else:
        overlay = orig_resized.copy()

    pil = Image.fromarray(overlay)
    buf = io.BytesIO()
    pil.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode()


def _encode_original(img_bytes: bytes) -> str:
    arr = np.frombuffer(img_bytes, dtype=np.uint8)
    orig = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    orig = cv2.cvtColor(orig, cv2.COLOR_BGR2RGB)
    orig = cv2.resize(orig, (512, 512))
    pil = Image.fromarray(orig)
    buf = io.BytesIO()
    pil.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode()


# ── FastAPI app ───────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    _init_model()
    yield


app = FastAPI(title="BiomedParse Service", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok", "model_loaded": _model is not None}


@app.post("/segment")
async def segment(
    image: UploadFile = File(...),
    prompt: str = Form("is there a bleeding in the image"),
):
    if _model is None:
        raise HTTPException(503, "Model not loaded yet")

    img_bytes = await image.read()
    if not img_bytes:
        raise HTTPException(400, "Empty image")

    # resolve preset shorthand → full prompt
    full_prompt = PRESET_PROMPTS.get(prompt.strip().lower(), prompt)

    try:
        tensor = _preprocess(img_bytes)
        detected, confidence, mask = _run_inference(tensor, full_prompt)
        overlay_b64 = _make_overlay(img_bytes, mask)
        original_b64 = _encode_original(img_bytes)
    except Exception as exc:
        logger.exception("Inference error")
        raise HTTPException(500, str(exc)) from exc

    return {
        "detected": detected,
        "confidence": round(confidence, 4),
        "prompt": full_prompt,
        "overlay_image": overlay_b64,
        "original_image": original_b64,
    }
