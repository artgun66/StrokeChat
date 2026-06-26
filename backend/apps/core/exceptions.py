"""Centralized DRF exception handler. Returns {error, code, fields?} shape consistently."""
from __future__ import annotations

from rest_framework.views import exception_handler


def _flatten_detail(data) -> str:
    """DRF's response.data may be a string, list, or dict of field-errors. Flatten it."""
    if isinstance(data, str):
        return data
    if isinstance(data, list):
        return "; ".join(_flatten_detail(d) for d in data)
    if isinstance(data, dict):
        if "detail" in data:
            return _flatten_detail(data["detail"])
        return "; ".join(f"{k}: {_flatten_detail(v)}" for k, v in data.items())
    return str(data) if data else "request failed"


def custom_exception_handler(exc, context):
    response = exception_handler(exc, context)
    if response is None:
        return None

    payload = {
        "error": _flatten_detail(response.data),
        "code": getattr(exc, "default_code", "error"),
    }
    if isinstance(response.data, dict) and "detail" not in response.data:
        # Preserve per-field errors so clients can highlight inputs.
        payload["fields"] = response.data
    response.data = payload
    return response
