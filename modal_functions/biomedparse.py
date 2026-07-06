"""BiomedParse inference on Modal A10G — served as an HTTP web endpoint.

Deployed with: modal deploy modal_functions/biomedparse.py
Weights uploaded once with: modal volume put biomedparse-weights <local_ckpt> /checkpoints/last-v5.ckpt
Call from Django: POST https://gunturkunartun--biomedparse-segment.modal.run
  with JSON body: {"image_b64": "<base64>", "prompt": "..."}
"""
import modal

app = modal.App("biomedparse")

BIOMEDPARSE_SRC = "/biomedparse"
SHIM_SRC = "/detectron2_shim"
CKPT_PATH = "/weights/checkpoints/last-v5.ckpt"

weights_vol = modal.Volume.from_name("biomedparse-weights", create_if_missing=True)

image = (
    modal.Image.from_registry("pytorch/pytorch:2.2.0-cuda11.8-cudnn8-runtime")
    .apt_install("libgl1", "libglib2.0-0", "git")
    .pip_install(
        "torch==2.2.0",
        "torchvision==0.17.0",
        "fastapi[standard]",
        "opencv-python-headless",
        "Pillow",
        "numpy<2.0",
        "hydra-core==1.3.2",
        "omegaconf",
        "einops",
        "timm",
        "transformers==4.47.0",
        "huggingface_hub",
        "pydicom[all]",
        "open_clip_torch",
        "ftfy",
        "regex",
        "scipy",
        "scikit-image",
        "panopticapi @ git+https://github.com/cocodataset/panopticapi.git",
        "fvcore",
    )
    .add_local_dir("artun_model/BiomedParse", remote_path=BIOMEDPARSE_SRC)
    .add_local_dir("biomedparse_service/detectron2_shim", remote_path=SHIM_SRC)
)


@app.function(
    gpu="A10G",
    image=image,
    volumes={"/weights": weights_vol},
    timeout=300,
    memory=16384,
    min_containers=0,
    max_containers=12,
    scaledown_window=30,
)
@modal.fastapi_endpoint(method="POST")
def segment(item: dict):
    import base64, io, os, sys
    import cv2
    import numpy as np
    import torch
    import torch.nn.functional as F
    from fastapi.responses import JSONResponse
    from PIL import Image

    image_b64 = item.get("image_b64", "")
    prompt = item.get("prompt", "is there a bleeding in the image")
    image_bytes = base64.b64decode(image_b64)

    sys.path.insert(0, BIOMEDPARSE_SRC)
    sys.path.insert(0, "/")
    import detectron2_shim as _d2
    import detectron2_shim.layers as _d2l
    import detectron2_shim.modeling as _d2m
    sys.modules.setdefault("detectron2", _d2)
    sys.modules.setdefault("detectron2.layers", _d2l)
    sys.modules.setdefault("detectron2.modeling", _d2m)

    os.chdir(BIOMEDPARSE_SRC)

    import hydra
    from hydra import compose
    from hydra.core.global_hydra import GlobalHydra

    PRESET_PROMPTS = {
        "bleeding": "is there a bleeding in the image",
        "stroke": "is there a stroke in the image",
        "healthy": "is the image healthy",
    }

    device = torch.device("cuda")
    GlobalHydra.instance().clear()
    hydra.initialize_config_dir(
        config_dir=f"{BIOMEDPARSE_SRC}/configs",
        job_name="biomedparse_modal",
        version_base=None,
    )
    cfg = compose(config_name="evaluate_biomedparse_2D")
    model = hydra.utils.instantiate(cfg.model, _convert_="object")

    checkpoint = torch.load(CKPT_PATH, map_location=device)
    state_dict = checkpoint.get("state_dict") or checkpoint.get("model") or checkpoint
    cleaned = {(k[6:] if k.startswith("model.") else k): v for k, v in state_dict.items()}
    model.load_state_dict(cleaned, strict=False)
    model = model.to(device).eval()

    full_prompt = PRESET_PROMPTS.get(prompt.strip().lower(), prompt)

    arr = np.frombuffer(image_bytes, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    img = cv2.resize(img, (512, 512))
    tensor = torch.from_numpy(img).permute(2, 0, 1).float().unsqueeze(0).to(device)

    with torch.inference_mode():
        out = model({"image": tensor, "text": [full_prompt]}, mode="eval")

    preds = out["predictions"]
    oe = preds["object_existence"]
    if isinstance(oe, torch.Tensor):
        oe = oe.detach().float().squeeze()
        prob = torch.sigmoid(oe).mean().item() if oe.numel() > 1 else torch.sigmoid(oe).item()
    else:
        prob = float(oe)
    detected = prob > 0.5

    pred_mask = None
    gmasks = preds.get("pred_gmasks")
    if gmasks is not None:
        if gmasks.shape[-2:] != (512, 512):
            gmasks = F.interpolate(gmasks.float(), size=(512, 512), mode="bicubic", align_corners=False, antialias=True)
        mask_prob = torch.sigmoid(gmasks)
        if mask_prob.shape[1] > 1:
            mask_prob = mask_prob.mean(dim=1, keepdim=True)
        pred_mask = (
            (mask_prob > 0.5).squeeze().cpu().numpy().astype(np.uint8) * 255
            if detected else np.zeros((512, 512), dtype=np.uint8)
        )
        if pred_mask.ndim < 2 or pred_mask.shape != (512, 512):
            pred_mask = np.zeros((512, 512), dtype=np.uint8)

    orig = cv2.resize(img, (512, 512))
    if pred_mask is not None and pred_mask.max() > 0:
        overlay = orig.copy()
        red = np.zeros_like(orig)
        red[pred_mask > 0] = [255, 50, 50]
        overlay = cv2.addWeighted(orig, 0.55, red, 0.45, 0)
        contours, _ = cv2.findContours(pred_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        cv2.drawContours(overlay, contours, -1, (255, 80, 80), 2)
    else:
        overlay = orig.copy()

    def _b64(arr_rgb):
        buf = io.BytesIO()
        Image.fromarray(arr_rgb).save(buf, format="PNG")
        return base64.b64encode(buf.getvalue()).decode()

    # Mask coverage: fraction of 512×512 image occupied by the segmented region
    mask_area_pct = (
        round(float(np.sum(pred_mask > 0)) / (512 * 512) * 100, 2)
        if pred_mask is not None else 0.0
    )
    # Aspect score (0–10): 70% detection confidence + 30% lesion coverage
    # Coverage component saturates at 5% of image area (typical large lesion)
    coverage_component = min(mask_area_pct / 5.0, 1.0)
    aspect_score = round(float(prob) * 7.0 + coverage_component * 3.0, 1)

    return {
        "detected": bool(detected),
        "confidence": round(float(prob), 4),
        "mask_area_pct": mask_area_pct,
        "aspect_score": aspect_score,
        "prompt": str(full_prompt),
        "overlay_image": _b64(overlay),
        "original_image": _b64(orig),
    }
