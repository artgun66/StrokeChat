from __future__ import annotations

import httpx
from django.http import JsonResponse
from django.utils.decorators import method_decorator
from django.views import View
from django.views.decorators.csrf import csrf_exempt

BIOMEDPARSE_SERVICE = "http://127.0.0.1:8001"


@method_decorator(csrf_exempt, name="dispatch")
class SegmentView(View):
    def post(self, request):
        image = request.FILES.get("image")
        prompt = request.POST.get("prompt", "is there a bleeding in the image")
        if not image:
            return JsonResponse({"error": "image field required"}, status=400)

        try:
            resp = httpx.post(
                f"{BIOMEDPARSE_SERVICE}/segment",
                files={"image": (image.name, image.read(), image.content_type)},
                data={"prompt": prompt},
                timeout=120.0,
            )
            resp.raise_for_status()
            return JsonResponse(resp.json())
        except httpx.ConnectError:
            return JsonResponse(
                {"error": "BiomedParse service is not running. Start it with: ./biomedparse_service/start.sh"},
                status=503,
            )
        except httpx.TimeoutException:
            return JsonResponse({"error": "BiomedParse service timed out. The model may still be loading."}, status=504)
        except httpx.HTTPStatusError as exc:
            return JsonResponse({"error": exc.response.text}, status=502)
        except Exception as exc:
            return JsonResponse({"error": f"Unexpected error: {exc}"}, status=500)


class HealthView(View):
    def get(self, request):
        try:
            resp = httpx.get(f"{BIOMEDPARSE_SERVICE}/health", timeout=3.0)
            return JsonResponse(resp.json())
        except httpx.ConnectError:
            return JsonResponse({"status": "unavailable"}, status=503)
