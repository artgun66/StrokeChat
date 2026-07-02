"""Vessel segmentation (nnUNet) inference on Modal A10G.

Deployed with: modal deploy modal_functions/vessel.py
Weights uploaded once with:
  modal volume put vessel-weights vessel_weights/nnUNet_weights /nnUNet_weights
"""
import modal

app = modal.App("vessel")

WEIGHTS_DIR = "/nnUNet_weights"

weights_vol = modal.Volume.from_name("vessel-weights", create_if_missing=True)

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("git", "libgl1", "libglib2.0-0")
    .pip_install(
        "torch==2.3.0",
        "nnunetv2",
        "SimpleITK",
        "nibabel",
        "numpy",
        "Pillow",
        "scipy",
        "scikit-image",
        "acvl-utils",
        "dynamic-network-architectures",
    )
)


@app.function(
    gpu="A10G",
    image=image,
    volumes={"/nnUNet_weights": weights_vol},
    timeout=30,
    memory=16384,
)
def segment(nifti_bytes: bytes, filename: str) -> dict:
    import base64, io, os, shutil, tempfile, uuid

    import nibabel as nib
    import numpy as np
    import SimpleITK as sitk
    from PIL import Image

    # Convert NRRD / MHD / other formats to NIfTI bytes
    if filename.lower().endswith((".nrrd", ".mhd", ".mha")):
        with tempfile.NamedTemporaryFile(suffix=os.path.splitext(filename)[1], delete=False) as f:
            f.write(nifti_bytes)
            tmp_in = f.name
        tmp_out = tmp_in + ".nii.gz"
        img = sitk.ReadImage(tmp_in)
        sitk.WriteImage(img, tmp_out)
        with open(tmp_out, "rb") as f:
            nifti_bytes = f.read()
        os.unlink(tmp_in)
        os.unlink(tmp_out)
        filename = filename.rsplit(".", 1)[0] + ".nii.gz"

    job_id = str(uuid.uuid4())

    with tempfile.TemporaryDirectory() as tmpdir:
        tmpdir = os.path.realpath(tmpdir)
        infer_dir = os.path.join(tmpdir, "input")
        pred_dir = os.path.join(tmpdir, "predictions")
        os.makedirs(infer_dir)
        os.makedirs(pred_dir)

        # nnUNet expects _0000 channel suffix
        base = filename.replace(".nii.gz", "").replace(".nii", "")
        scan_path = os.path.join(infer_dir, f"{base}_0000.nii.gz")
        with open(scan_path, "wb") as f:
            f.write(nifti_bytes)

        import subprocess
        env = {**os.environ, "nnUNet_results": WEIGHTS_DIR}
        cmd = [
            "nnUNetv2_predict",
            "-i", infer_dir,
            "-o", pred_dir,
            "-d", "Dataset241_Dyn",
            "-c", "3d_fullres",
            "-tr", "nnUNetTrainer",
            "-p", "nnUNetResEncUNetLPlans",
            "-f", "all",
            "--continue_prediction",
        ]
        result = subprocess.run(cmd, env=env, capture_output=True, text=True)
        if result.returncode != 0:
            raise RuntimeError(f"nnUNetv2_predict failed:\n{result.stderr[-3000:]}")

        # Find output file (nnUNet strips _0000)
        pred_files = [f for f in os.listdir(pred_dir) if f.endswith(".nii.gz")]
        if not pred_files:
            raise RuntimeError("nnUNet produced no output file")
        pred_path = os.path.join(pred_dir, pred_files[0])

        # Count vessel voxels
        mask_img = nib.load(pred_path)
        mask_data = np.asarray(mask_img.dataobj)
        vessel_voxels = int(np.sum(mask_data > 0))

        # Generate axial slice preview
        orig_img = nib.load(scan_path)
        orig_data = np.asarray(orig_img.dataobj, dtype=np.float32)
        mid = orig_data.shape[2] // 2

        def _window(arr, lo=-200, hi=400):
            arr = np.clip(arr, lo, hi)
            return ((arr - lo) / (hi - lo) * 255).astype(np.uint8)

        orig_slice = _window(orig_data[:, :, mid])
        mask_slice = (mask_data[:, :, mid] > 0).astype(np.uint8)

        orig_rgb = np.stack([orig_slice] * 3, axis=-1)
        overlay = orig_rgb.copy()
        overlay[mask_slice > 0] = [255, 80, 80]
        overlay = (orig_rgb * 0.6 + overlay * 0.4).astype(np.uint8)

        def _b64_png(arr):
            buf = io.BytesIO()
            Image.fromarray(arr).save(buf, format="PNG")
            return base64.b64encode(buf.getvalue()).decode()

        # Read mask file for download
        with open(pred_path, "rb") as f:
            mask_bytes = f.read()

    import json
    return json.dumps({
        "job_id": job_id,
        "vessel_voxels": int(vessel_voxels),
        "preview_image": _b64_png(orig_rgb),
        "overlay_image": _b64_png(overlay),
        "mask_b64": base64.b64encode(mask_bytes).decode(),
    })
