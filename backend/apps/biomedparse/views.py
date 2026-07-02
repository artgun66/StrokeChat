from __future__ import annotations

import os

import httpx
from django.http import JsonResponse
from django.utils.decorators import method_decorator
from django.views import View
from django.views.decorators.csrf import csrf_exempt

BIOMEDPARSE_SERVICE = os.environ.get("BIOMEDPARSE_SERVICE_URL", "http://127.0.0.1:8001")
USE_MODAL = bool(os.environ.get("MODAL_TOKEN_ID"))


@method_decorator(csrf_exempt, name="dispatch")
class SegmentView(View):
    def post(self, request):
        image = request.FILES.get("image")
        prompt = request.POST.get("prompt", "is there a bleeding in the image")
        if not image:
            return JsonResponse({"error": "image field required"}, status=400)

        if USE_MODAL:
            return self._segment_modal(image.read(), prompt)
        return self._segment_local(image, prompt)

    def _segment_modal(self, image_bytes: bytes, prompt: str):
        try:
            import modal
            fn = modal.Function.from_name("biomedparse", "segment")
            result = fn.remote(image_bytes, prompt)
            return JsonResponse(result)
        except Exception as exc:
            return JsonResponse({"error": f"Modal inference error: {exc}"}, status=500)

    def _segment_local(self, image, prompt: str):
        try:
            resp = httpx.post(
                f"{BIOMEDPARSE_SERVICE}/segment",
                files={"image": (image.name, image.read(), image.content_type)},
                data={"prompt": prompt},
                timeout=600.0,
            )
            resp.raise_for_status()
            return JsonResponse(resp.json())
        except httpx.ConnectError:
            return JsonResponse(
                {"error": "BiomedParse service is not running. Start it with: ./biomedparse_service/start.sh"},
                status=503,
            )
        except httpx.TimeoutException:
            return JsonResponse({"error": "BiomedParse inference timed out after 10 minutes. CPU inference is slow — expected ~4-5 min on first run."}, status=504)
        except httpx.HTTPStatusError as exc:
            return JsonResponse({"error": exc.response.text}, status=502)
        except Exception as exc:
            return JsonResponse({"error": f"Unexpected error: {exc}"}, status=500)


class HealthView(View):
    def get(self, request):
        if USE_MODAL:
            return JsonResponse({"status": "ok", "backend": "modal"})
        try:
            resp = httpx.get(f"{BIOMEDPARSE_SERVICE}/health", timeout=3.0)
            return JsonResponse(resp.json())
        except httpx.ConnectError:
            return JsonResponse({"status": "unavailable"}, status=503)
