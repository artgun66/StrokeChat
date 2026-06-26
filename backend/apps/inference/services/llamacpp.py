"""LlamaCppRunner — manages a single `llama-server` subprocess.

One model is loaded at a time per worker process. Loading a different model unloads the
current one. The server is bound to 127.0.0.1 and never exposed.

Phase 2 caveat: this is process-local state. With multiple Uvicorn workers, each worker
will have its own runner. For dev that's fine; for production we'll need a shared
coordinator (Redis or a single dedicated inference process). Filed as a Phase 3+ concern.
"""
from __future__ import annotations

import logging
import os
import socket
import subprocess
import threading
import time
from dataclasses import dataclass

import httpx
from django.conf import settings

logger = logging.getLogger(__name__)

LLAMA_SERVER_BINARY = os.environ.get("LLAMA_SERVER_BINARY", "llama-server")
HEALTH_TIMEOUT_SECONDS = 60.0
HEALTH_POLL_INTERVAL_SECONDS = 0.5


class LlamaCppError(RuntimeError):
    pass


@dataclass
class _Loaded:
    model_slug: str
    model_path: str
    port: int
    process: subprocess.Popen
    mmproj_path: str = ""


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


class LlamaCppRunner:
    """Singleton-ish: one runner per process. Thread-safe via _lock."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._loaded: _Loaded | None = None

    # -- public API ----------------------------------------------------

    def start(self, model_slug: str, model_path: str, mmproj_path: str = "") -> int:
        """Ensure llama-server is running for `model_slug`. Returns the bound port.

        If `mmproj_path` is provided, llama-server is started with `--mmproj <path>`
        so the model can accept image inputs. Empty string = text-only mode.
        Reusing the loaded process across requests requires the mmproj_path to
        match — switching it forces a respawn.
        """
        with self._lock:
            if self._loaded and self._loaded.model_slug == model_slug \
                    and self._loaded.mmproj_path == mmproj_path:
                if self._loaded.process.poll() is None:
                    return self._loaded.port
                logger.warning("llama-server for %s died; restarting", model_slug)
                self._loaded = None
            if self._loaded is not None:
                self._stop_locked()
            self._loaded = self._spawn(model_slug, model_path, mmproj_path)
            return self._loaded.port

    def stop(self) -> None:
        with self._lock:
            self._stop_locked()

    def health(self) -> dict:
        with self._lock:
            if self._loaded is None:
                return {"loaded": False}
            return {
                "loaded": True,
                "model_slug": self._loaded.model_slug,
                "port": self._loaded.port,
                "alive": self._loaded.process.poll() is None,
            }

    def base_url_for(self, model_slug: str) -> str:
        with self._lock:
            if not self._loaded or self._loaded.model_slug != model_slug:
                raise LlamaCppError(f"model {model_slug} is not loaded")
            return f"http://127.0.0.1:{self._loaded.port}"

    # -- internals -----------------------------------------------------

    def _spawn(self, model_slug: str, model_path: str, mmproj_path: str = "") -> _Loaded:
        port = _free_port()
        cmd = [
            LLAMA_SERVER_BINARY,
            "--model", model_path,
            "--host", "127.0.0.1",
            "--port", str(port),
            "--ctx-size", str(getattr(settings, "LLAMACPP_DEFAULT_CTX_SIZE", 4096)),
            "--n-gpu-layers", str(getattr(settings, "LLAMACPP_N_GPU_LAYERS", 0)),
            "--threads", str(getattr(settings, "LLAMACPP_THREADS", 0) or os.cpu_count() or 4),
            "--no-webui",
        ]
        if mmproj_path:
            cmd.extend(["--mmproj", mmproj_path])
        logger.info(
            "spawning llama-server for %s on :%d%s",
            model_slug, port, " (vision)" if mmproj_path else "",
        )
        try:
            proc = subprocess.Popen(  # noqa: S603 — args list, not shell
                cmd,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.PIPE,
            )
        except FileNotFoundError as exc:
            raise LlamaCppError(
                f"{LLAMA_SERVER_BINARY!r} not found in PATH. "
                "Install llama.cpp (`brew install llama.cpp` on Mac) or set LLAMA_SERVER_BINARY."
            ) from exc

        deadline = time.time() + HEALTH_TIMEOUT_SECONDS
        url = f"http://127.0.0.1:{port}/health"
        while time.time() < deadline:
            if proc.poll() is not None:
                err = (proc.stderr.read() if proc.stderr else b"").decode(errors="replace")
                raise LlamaCppError(f"llama-server exited: rc={proc.returncode} stderr={err[:500]}")
            try:
                r = httpx.get(url, timeout=1.0)
                if r.status_code == 200:
                    logger.info("llama-server for %s ready on :%d", model_slug, port)
                    return _Loaded(
                        model_slug=model_slug,
                        model_path=model_path,
                        port=port,
                        process=proc,
                        mmproj_path=mmproj_path,
                    )
            except httpx.HTTPError:
                pass
            time.sleep(HEALTH_POLL_INTERVAL_SECONDS)

        proc.terminate()
        raise LlamaCppError(f"llama-server for {model_slug} did not become healthy in time")

    def _stop_locked(self) -> None:
        if self._loaded is None:
            return
        logger.info("stopping llama-server for %s", self._loaded.model_slug)
        self._loaded.process.terminate()
        try:
            self._loaded.process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            self._loaded.process.kill()
        self._loaded = None


# Process-local singleton.
_runner: LlamaCppRunner | None = None


def get_runner() -> LlamaCppRunner:
    global _runner
    if _runner is None:
        _runner = LlamaCppRunner()
    return _runner
