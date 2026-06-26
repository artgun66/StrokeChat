"""Task handler registry. Each `kind` registers a callable taking the payload."""
from __future__ import annotations

from collections.abc import Callable
from typing import Any

Handler = Callable[[dict[str, Any]], None]

_HANDLERS: dict[str, Handler] = {}


def register(kind: str) -> Callable[[Handler], Handler]:
    def decorator(fn: Handler) -> Handler:
        if kind in _HANDLERS:
            raise RuntimeError(f"task handler for kind={kind!r} already registered")
        _HANDLERS[kind] = fn
        return fn

    return decorator


def get(kind: str) -> Handler:
    try:
        return _HANDLERS[kind]
    except KeyError as exc:
        raise LookupError(f"no handler registered for kind={kind!r}") from exc


def known_kinds() -> list[str]:
    return sorted(_HANDLERS)
