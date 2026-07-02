from __future__ import annotations

import base64
import os

import httpx
from django.http import HttpResponse, JsonResponse, StreamingHttpResponse
from django.views import View
from django.views.decorators.csrf import csrf_exempt
from django.utils.decorators import method_decorator

VESSEL_SERVICE = os.environ.get("VESSEL_SERVICE_URL", "http://127.0.0.1:8002")
USE_MODAL = bool(os.environ.get("MODAL_TOKEN_ID"))


@method_decorator(csrf_exempt, name="dispatch")
class SegmentView(View):
    def post(self, request):
        scan = request.FILES.get("scan")
        if not scan:
            return JsonResponse({"error": "scan field required"}, status=400)

        if USE_MODAL:
            return self._segment_modal(scan.read(), scan.name)
        return self._segment_local(scan)

    def _segment_modal(self, nifti_bytes: bytes, filename: str):
        try:
            import json as _json
            import modal
            fn = modal.Function.from_name("vessel", "segment")
            result = fn.remote(nifti_bytes, filename)
            if isinstance(result, str):
                result = _json.loads(result)
            result.pop("mask_b64", None)
            return JsonResponse(result)
        except Exception as exc:
            return JsonResponse({"error": f"Modal inference error: {exc}"}, status=500)

    def _segment_local(self, scan):
        try:
            resp = httpx.post(
                f"{VESSEL_SERVICE}/segment",
                files={"scan": (scan.name, scan.read(), scan.content_type or "application/gzip")},
                timeout=600.0,
            )
            resp.raise_for_status()
            return JsonResponse(resp.json())
        except httpx.ConnectError:
            return JsonResponse({"error": "Vessel segmentation service is not running."}, status=503)
        except httpx.TimeoutException:
            return JsonResponse({"error": "Vessel segmentation timed out. nnUNet inference on CPU can take 10–30 minutes."}, status=504)
        except httpx.HTTPStatusError as exc:
            try:
                detail = exc.response.json().get("detail", exc.response.text)
            except Exception:
                detail = exc.response.text
            return JsonResponse({"error": detail}, status=exc.response.status_code)
        except Exception as exc:
            return JsonResponse({"error": f"Unexpected error: {exc}"}, status=500)


class HealthView(View):
    def get(self, request):
        if USE_MODAL:
            return JsonResponse({"status": "ok", "backend": "modal"})
        try:
            resp = httpx.get(f"{VESSEL_SERVICE}/health", timeout=3.0)
            return JsonResponse(resp.json())
        except httpx.ConnectError:
            return JsonResponse({"status": "unavailable"}, status=503)


class DownloadView(View):
    def get(self, request, job_id: str):
        if USE_MODAL:
            return JsonResponse({"error": "Direct download not supported in Modal mode"}, status=404)
        try:
            resp = httpx.get(f"{VESSEL_SERVICE}/download/{job_id}", timeout=30.0)
            resp.raise_for_status()
            return StreamingHttpResponse(
                resp.iter_bytes(),
                content_type="application/gzip",
                headers={"Content-Disposition": 'attachment; filename="vessel_mask.nii.gz"'},
            )
        except httpx.ConnectError:
            return JsonResponse({"error": "Service unavailable"}, status=503)
        except httpx.HTTPStatusError as exc:
            return JsonResponse({"error": "Not found"}, status=exc.response.status_code)
