"""Brain vessel segmentation microservice.

Wraps the robust-vessel-segmentation nnUNet pipeline (github.com/alceballosa/robust-vessel-segmentation)
for single-scan inference. Accepts a NIfTI (.nii.gz / .nii) CTA upload and runs the
pipeline in "Prediction" mode — isotropic resampling only, no ANTs registration
required — making it cross-platform without a compiled ANTs binary.

Required setup
--------------
1. Download weights from the repository's Google Drive link into a local directory.
   Expected structure:
     ${VESSEL_WEIGHTS_DIR}/
       Dataset241_<name>/
         nnUNetTrainer__nnUNetResEncUNetLPlans__3d_fullres/fold_all/checkpoint_best.pth
   (or Dataset242_* when VESSEL_MODEL_VERSION=242)

2. Set the environment variables:
     VESSEL_WEIGHTS_DIR   — path to the directory above
     VESSEL_MODEL_VERSION — 241 (default, more robust to intensity variation)
                          or 242 (more robust to artifacts outside the brain)
"""
from __future__ import annotations

import base64
import io
import logging
import os
import shutil
import subprocess
import sys
import tempfile
import threading
import uuid
from pathlib import Path

import nibabel as nib
import numpy as np
import SimpleITK as sitk
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from PIL import Image

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

VESSEL_WEIGHTS_DIR = os.environ.get("VESSEL_WEIGHTS_DIR", "")
MODEL_VERSION = int(os.environ.get("VESSEL_MODEL_VERSION", "241"))
SLIDING_WINDOW = float(os.environ.get("VESSEL_SLIDING_WINDOW", "0.5"))
# Resample to the training isotropic spacing used by this checkpoint.
ISOTROPIC_SPACING_MM = 0.468

# Job store: job_id -> Path of the mask .nii.gz (kept until process restarts).
_result_store: dict[str, Path] = {}
_store_lock = threading.Lock()


# ── weight / hardware helpers ─────────────────────────────────────────────────

def _weights_available() -> bool:
    if not VESSEL_WEIGHTS_DIR:
        return False
    for d in Path(VESSEL_WEIGHTS_DIR).glob(f"Dataset{MODEL_VERSION}_*"):
        ckpt = d / "nnUNetTrainer__nnUNetResEncUNetLPlans__3d_fullres" / "fold_all" / "checkpoint_best.pth"
        if ckpt.exists():
            return True
    return False


def _cuda_available() -> bool:
    try:
        import torch
        return torch.cuda.is_available()
    except ImportError:
        return False


def _nnunet_bin() -> str:
    candidate = Path(sys.executable).parent / "nnUNetv2_predict"
    return str(candidate) if candidate.exists() else "nnUNetv2_predict"


# ── pipeline steps ────────────────────────────────────────────────────────────

def _resample_isotropic(src: Path, dst: Path) -> None:
    img = sitk.ReadImage(str(src))
    orig_spacing = img.GetSpacing()
    orig_size = img.GetSize()
    s = ISOTROPIC_SPACING_MM
    new_size = [int(round(sz * sp / s)) for sz, sp in zip(orig_size, orig_spacing)]
    r = sitk.ResampleImageFilter()
    r.SetOutputSpacing([s, s, s])
    r.SetSize(new_size)
    r.SetInterpolator(sitk.sitkLinear)
    r.SetOutputDirection(img.GetDirection())
    r.SetOutputOrigin(img.GetOrigin())
    r.SetTransform(sitk.Transform())
    sitk.WriteImage(r.Execute(img), str(dst))


def _resample_mask_to_original(mask: Path, reference: Path, dst: Path) -> None:
    m = sitk.ReadImage(str(mask))
    ref = sitk.ReadImage(str(reference))
    resampled = sitk.Resample(m, ref, sitk.Transform(), sitk.sitkNearestNeighbor, 0, m.GetPixelID())
    sitk.WriteImage(resampled, str(dst))


def _run_nnunet(inference_dir: Path, pred_dir: Path) -> None:
    device = "cuda" if _cuda_available() else "cpu"
    cmd = [
        _nnunet_bin(),
        "--continue_prediction",
        "-p", "nnUNetResEncUNetLPlans",
        "-c", "3d_fullres",
        "-i", str(inference_dir),
        "-o", str(pred_dir),
        "-d", str(MODEL_VERSION),
        "-f", "all",
        "-step_size", str(SLIDING_WINDOW),
        "-chk", "checkpoint_best.pth",
        "-device", device,
    ]
    env = {**os.environ, "nnUNet_results": VESSEL_WEIGHTS_DIR}
    result = subprocess.run(cmd, env=env, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"nnUNetv2_predict failed:\n{result.stderr[-3000:]}")


# ── visualisation ─────────────────────────────────────────────────────────────

def _make_previews(ct_path: Path, mask_path: Path | None) -> tuple[str, str]:
    """Return (preview_b64, overlay_b64) PNGs from the most-content axial slice."""
    ct_img = nib.as_closest_canonical(nib.load(str(ct_path)))
    ct_data = ct_img.get_fdata()

    # Pick the axial slice (axis 2) with the most non-background content.
    sums = np.sum(ct_data > ct_data.min() + 50, axis=(0, 1))
    mid = int(np.argmax(sums)) if sums.max() > 0 else ct_data.shape[2] // 2
    ct_slice = ct_data[:, :, mid]

    # Auto-level: p2–p98 adapts to any scanner/protocol.
    p2, p98 = np.percentile(ct_slice, 2), np.percentile(ct_slice, 98)
    if p98 <= p2:
        p98 = p2 + 1
    ct_norm = np.clip((ct_slice - p2) / (p98 - p2) * 255, 0, 255).astype(np.uint8)
    ct_norm = np.rot90(ct_norm)
    ct_rgb = np.stack([ct_norm] * 3, axis=-1)

    preview_b64 = _arr_to_b64(ct_rgb)

    if mask_path is None or not mask_path.exists():
        return preview_b64, preview_b64

    mask_img = nib.as_closest_canonical(nib.load(str(mask_path)))
    mask_data = mask_img.get_fdata()

    if mask_data.shape != ct_data.shape:
        # Resample mask to CT grid for visualisation only.
        m_itk = sitk.GetImageFromArray(mask_data.astype(np.float32))
        c_itk = sitk.ReadImage(str(ct_path))
        m_itk.CopyInformation(sitk.GetImageFromArray(
            np.zeros(mask_data.shape[::-1], dtype=np.float32)))
        mask_data = sitk.GetArrayFromImage(
            sitk.Resample(m_itk, c_itk, sitk.Transform(),
                          sitk.sitkNearestNeighbor, 0, m_itk.GetPixelID())
        ).T  # SimpleITK uses x,y,z order; nibabel uses i,j,k

    vessel = np.rot90(mask_data[:, :, mid].astype(bool))

    overlay = ct_rgb.astype(np.float32)
    alpha = 0.55
    overlay[vessel] = alpha * np.array([0, 220, 255]) + (1 - alpha) * overlay[vessel]
    overlay = np.clip(overlay, 0, 255).astype(np.uint8)

    return preview_b64, _arr_to_b64(overlay)


def _arr_to_b64(arr: np.ndarray) -> str:
    buf = io.BytesIO()
    Image.fromarray(arr).save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode()


# ── FastAPI app ───────────────────────────────────────────────────────────────

app = FastAPI(title="Vessel Segmentation Service")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


@app.get("/health")
def health():
    return {
        "status": "ok",
        "weights_available": _weights_available(),
        "cuda": _cuda_available(),
        "model_version": MODEL_VERSION,
    }


@app.post("/segment")
async def segment(scan: UploadFile = File(...)):
    if not _weights_available():
        raise HTTPException(
            503,
            "Vessel segmentation weights not found. "
            "Download from the repository's Google Drive link and set VESSEL_WEIGHTS_DIR.",
        )

    raw = await scan.read()
    if not raw:
        raise HTTPException(400, "Empty file")

    tmpdir = Path(tempfile.mkdtemp(prefix="vessel_"))
    try:
        input_nii = tmpdir / "input.nii.gz"
        input_nii.write_bytes(raw)

        # 1. Resample to isotropic training resolution.
        infer_dir = tmpdir / "infer_in"
        infer_dir.mkdir()
        # nnUNet expects the channel suffix _0000.
        iso_path = infer_dir / "CA_00000_0000.nii.gz"
        _resample_isotropic(input_nii, iso_path)

        # 2. nnUNet inference.
        pred_dir = tmpdir / "predictions"
        pred_dir.mkdir()
        _run_nnunet(infer_dir, pred_dir)

        # nnUNet strips _0000 → CA_00000.nii.gz.
        pred_iso = pred_dir / "CA_00000.nii.gz"
        if not pred_iso.exists():
            preds = list(pred_dir.glob("*.nii.gz"))
            if not preds:
                raise HTTPException(500, "nnUNet produced no output file")
            pred_iso = preds[0]

        # 3. Resample mask back to patient space.
        mask_patient = tmpdir / "mask.nii.gz"
        _resample_mask_to_original(pred_iso, input_nii, mask_patient)

        # 4. Store mask for download.
        job_id = str(uuid.uuid4())
        result_dir = Path(tempfile.mkdtemp(prefix="vessel_result_"))
        result_path = result_dir / "vessel_mask.nii.gz"
        shutil.copy2(mask_patient, result_path)
        with _store_lock:
            _result_store[job_id] = result_path

        # 5. Visualise.
        preview_b64, overlay_b64 = _make_previews(input_nii, mask_patient)

        vessel_voxels = int(np.sum(nib.load(str(mask_patient)).get_fdata() > 0))

        return {
            "job_id": job_id,
            "vessel_voxels": vessel_voxels,
            "preview_image": preview_b64,
            "overlay_image": overlay_b64,
        }

    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Segmentation error")
        raise HTTPException(500, str(exc)) from exc
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)


@app.get("/download/{job_id}")
def download_mask(job_id: str):
    with _store_lock:
        path = _result_store.get(job_id)
    if path is None or not path.exists():
        raise HTTPException(404, "Result not found or expired")
    return FileResponse(str(path), media_type="application/gzip", filename="vessel_mask.nii.gz")
