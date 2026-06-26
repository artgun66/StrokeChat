# local_llm

Web app for downloading and running open-weight LLMs on enterprise infrastructure.

See [`docs/01-architecture-and-decisions.md`](docs/01-architecture-and-decisions.md) for the founding architecture record. Read it before making structural changes.

## Repo layout

```
backend/    Django 5 + DRF + (Phase 2) Channels — control plane + on-prem runtime
frontend/   Next.js 15 App Router — pnpm + turbo monorepo
agent/      Go tunnel-agent (Phase 7, bare-metal GPU pool)
infra/      docker-compose, Helm chart (Phase 6), GCP terraform (later)
docs/       architecture & decisions
```

## Quick start (local docker-compose)

Prereqs: Docker, Python 3.12, Node 20, pnpm.

```bash
cp .env.example .env.local

# 1. Fernet key (symmetric crypto for provider secrets later)
python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
# paste into .env.local as FERNET_KEY=...

# 2. Boot — generates migrations on first run, runs them, starts server + worker
docker compose -f docker-compose.local.yml up --build

# 3. Generate the Ed25519 keypair for catalog manifest signing (in another terminal)
docker compose -f docker-compose.local.yml exec backend python manage.py rotate_catalog_keys
# paste both lines into .env.local, then `docker compose restart backend worker`

# 4. Resolve real integrity hashes from Hugging Face, then seed the catalog
docker compose -f docker-compose.local.yml exec backend \
    python manage.py refresh_catalog_hashes
docker compose -f docker-compose.local.yml exec backend \
    python manage.py seed_catalog
```

Then:
- Backend: <http://localhost:8000/> (DRF root)
- Hub: <http://localhost:3000/hub>
- Local models: <http://localhost:3000/models>
- Postgres: `localhost:55432` (user `local_llm` / db `local_llm`)

### About catalog integrity

`apps/catalog/data/curated.yaml` is the curated tier list. `refresh_catalog_hashes` hits the Hugging Face API (one HEAD per row) to resolve each entry's current commit SHA, file size, and LFS sha256 in place — these are the values the runtime verifies on download. After that, `seed_catalog` upserts them into Postgres and signs each row's manifest with the catalog Ed25519 key. Any DB row not in the YAML is marked `deprecated=True` and hidden from the Hub — but stays addressable so prior downloads still resolve.

`seed_catalog --allow-placeholders` exists for bootstrap mode only; it permits unresolved integrity fields. Don't use it in production; downloads can't verify file integrity in that mode.

### Without Docker

Backend:

```bash
cd backend
uv sync
uv run python manage.py migrate
uv run python manage.py rotate_catalog_keys  # paste keys into .env.local
uv run python manage.py seed_catalog --allow-placeholders
uv run python manage.py runserver       # in one terminal
uv run python manage.py run_worker      # in another terminal
```

Frontend:

```bash
cd frontend
pnpm install
pnpm dev
```

## Tests

```bash
cd backend && uv run pytest
cd frontend && pnpm lint
```

## Phase status

**Phase 1 — Catalog & Downloads.** Hub UI lists curated GGUFs, click to download, sha256 + manifest signature verified, files land in `$DATA_DIR/models/<slug>/`. See `docs/01-architecture-and-decisions.md §11` for the phase plan.
