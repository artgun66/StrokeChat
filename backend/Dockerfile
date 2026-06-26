# Cloud-Run-shaped (single process, $PORT, non-root) — runs locally for now via docker-compose.
FROM python:3.12-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    UV_LINK_MODE=copy \
    UV_SYSTEM_PYTHON=1

RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential \
        libpq-dev \
        curl \
        ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir uv

WORKDIR /app

# Compile a deterministic requirements list, then install. Two RUN steps so layers cache cleanly.
COPY pyproject.toml ./
RUN uv pip compile pyproject.toml -o /tmp/requirements.txt --quiet
RUN uv pip install --system --no-cache -r /tmp/requirements.txt

COPY . .

RUN useradd --uid 10001 --create-home --shell /usr/sbin/nologin app \
    && mkdir -p /app/data \
    && chown -R app:app /app
USER app

ENV PORT=8000
EXPOSE 8000

CMD ["sh", "-c", "uvicorn config.asgi:application --host 0.0.0.0 --port ${PORT}"]
