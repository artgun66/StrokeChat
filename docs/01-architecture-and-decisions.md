# local_llm — Architecture & Decisions (v0)

**Status:** Pre-implementation. Decisions in §3–§10 are locked unless listed in §13 or explicitly marked **TBD** inline.
**Date:** 2026-04-25
**Audience:** Anyone joining the project later, or future-us re-checking why a choice was made.

---

## 0. Purpose of this document

This is the founding architectural record for `local_llm`. It captures:
- *What* we are building.
- *What we decided* before writing a single line of code, and *why*.
- *What we deferred* and the trigger for revisiting.

If a later choice contradicts this doc, update this doc in the same PR. No drift.

---

## 1. Product

A web app that lets enterprise users **download and run open-weight LLMs on their own infrastructure**, with a chat UI shaped like a desktop app (model hub, threads sidebar, streaming message pane, model picker, settings panels, OpenAI-compatible local API).

### Deployment classes — by who controls the compute

We split deployments along the most consequential axis for enterprise buyers: **who owns and physically controls the box that runs the model**.

| Class | Compute owner | Examples | Sales positioning |
|---|---|---|---|
| **A. Customer-controlled (true on-prem)** | The customer | Their datacenter, their VPC in their cloud account, their bare-metal | Sellable as "on-prem" / "data never leaves your boundary" — works for regulated buyers |
| **B. Vendor-hosted (us)** | Us | Our GCP project, our reserved Lambda Labs / RunPod / colo GPUs | Managed/SaaS-style. **Not** on-prem, even if a customer's data is the only thing on the box. Many regulated/security-sensitive buyers will reject this framing. |
| **C. Vendor-managed in customer's cloud (BYOC)** | Customer (account), us (operator) | Our agent installed in customer's AWS/GCP/Azure account | Hybrid. Some buyers accept it as on-prem because the data plane stays in their account; others don't. Out of scope for v1. |

### Where each component lives

1. **Customer-controlled runtime** (Class A) — installed inside the enterprise's network on hardware they own. Downloads vetted GGUFs from the catalog and runs them locally with `llama.cpp`. Model weights and chat data never leave the customer's boundary. (v1 target.)
2. **Control plane** (Class B) — operated by us. Hosts auth, catalog, license/usage metadata, and routes traffic to whichever inference target a tenant has selected. (Currently runs locally; moves to GCP Cloud Run later.)
3. **Vendor-hosted GPU pool** (Class B) — bare-metal GPU servers in our own infrastructure, reserved per tenant. Pre-loaded with vetted models, accessed by tenants over a reverse-tunnel-+-mTLS path so the public internet never sees them. **Not on-prem.** Suitable for tenants who want GPU-class throughput and accept vendor-hosted compute. (Phase 7.)

The frontend is the same in all classes; what differs is which backend serves chat.

---

## 2. Design tenets

- **OpenAI-compatible local API.** The chat surface speaks the OpenAI chat-completions wire format so any standard client works.
- **Engine-agnostic, model-agnostic.** The dispatcher knows nothing about the underlying inference engine; we can swap llama.cpp / vLLM / managed providers behind the same `InferenceBackend` interface (§5).
- **Customer-data-never-leaves discipline.** The default deployment class (A) is customer-controlled compute; nothing in the data plane is required to talk to anything outside the customer's boundary at runtime.
- **House style** — Django apps under `apps/`, layered settings, UUID-PK base model, JWT cookie auth, RLS-backed multi-tenancy on the control plane; pnpm + turbo monorepo, Next.js App Router, shadcn/ui-style primitives on the frontend.

---

## 3. Tech stack (locked)

| Layer | Choice | Why |
|---|---|---|
| Backend | Django 5 + DRF (async views) | Mature, batteries-included, async-capable. SSE streaming uses native async views + `StreamingHttpResponse` — Channels deferred (only needed for WebSockets later). |
| Backend deps | simplejwt, django-environ, django-storages, huggingface_hub, psutil, pynvml, cryptography | Minimal, batteries-included |
| Tooling | uv, ruff, mypy, pytest-django | Standard modern Python toolchain |
| Frontend | Next.js 15 (App Router) + TypeScript | RSC + streaming, strong typing |
| Frontend deps | Tailwind 4, shadcn/ui, Radix, Zustand, TanStack Query, react-hook-form + Zod | Standard component + data-fetching stack |
| Monorepo | pnpm + turbo | Workspaces + cached task graph |
| DB | PostgreSQL 16 | Native JSON + row-level security for multi-tenancy |
| Inference engine v1 | **llama.cpp** (`llama-server`) consuming GGUF | Engine supports many hardware backends (CPU, CUDA, Metal, Vulkan, ROCm). Our v1 **supported** target is Linux + NVIDIA (runtime); Mac is dev-only via CPU. Broadest open-model coverage. |
| Inference engine Phase 7 | **vLLM** for the bare-metal GPU pool | Continuous batching, higher throughput when we control the hardware |
| Container runtime (dev) | docker-compose | No GCP needed for v1 |
| Node | 20 |
| Python | 3.12 |

### Engine vs model — important distinction

`llama.cpp` is the *engine*; the system is **model-agnostic**. The frontend, dispatcher, and catalog speak only the OpenAI chat-completions contract. Engines are an implementation detail behind the `InferenceBackend` interface (§5). Adding vLLM later is a backend class swap, not an app rewrite.

---

## 4. Repo layout

Single monorepo:

```
local_llm/
├── README.md
├── docs/                              # this directory
├── pyproject.toml                     # workspace marker
├── .python-version                    # 3.12
├── .nvmrc                             # 20
├── docker-compose.local.yml           # postgres, backend, frontend
├── .env.example
├── .github/workflows/
│   ├── lint.yml
│   └── test-essential.yml
│
├── backend/
│   ├── manage.py
│   ├── pyproject.toml
│   ├── Dockerfile                     # control-plane default
│   ├── Dockerfile.runtime             # bundles llama-server, runtime profile
│   ├── config/
│   │   ├── asgi.py / wsgi.py / urls.py
│   │   └── settings/
│   │       ├── base.py
│   │       ├── development.py
│   │       ├── production.py          # control-plane (Cloud-Run-shaped, runs locally for now)
│   │       ├── runtime.py             # customer-controlled runtime profile (Class A)
│   │       ├── baremetal.py           # GPU-box auth shim profile (Phase 7)
│   │       └── test.py
│   └── apps/
│       ├── core/                      # BaseModel (UUID + timestamps), middleware, exceptions, storage, crypto
│       ├── authentication/            # stub Phase 0, real Phase 4
│       ├── catalog/                   # control-plane curated registry
│       ├── models_registry/           # runtime: on-disk model state
│       ├── downloads/                 # runtime: download jobs
│       ├── inference/
│       │   ├── dispatcher.py          # tenant → backend
│       │   ├── backends/
│       │   │   ├── base.py
│       │   │   ├── local_runtime.py   # llama-server subprocess
│       │   │   ├── bare_metal.py      # Phase 7
│       │   │   └── remote_provider.py # Phase 8
│       │   └── views.py               # /v1/chat/completions, /v1/models
│       ├── threads/                   # threads, messages, assistants
│       ├── system/                    # /system: cpu/gpu/ram probe
│       ├── gpu_pool/                  # control-plane only (Phase 7), shell exists day 0
│       └── tasks/                     # async work abstraction
│
├── frontend/
│   ├── pnpm-workspace.yaml
│   ├── turbo.json
│   ├── package.json
│   ├── apps/
│   │   └── product/                   # Next.js 15 App Router
│   │       └── src/app/
│   │           ├── (auth)/...
│   │           ├── (app)/hub/...
│   │           ├── (app)/threads/...
│   │           └── (app)/settings/...
│   └── packages/
│       ├── ui/
│       ├── auth/
│       ├── api-client/
│       └── config/
│
├── agent/
│   └── tunnel-agent/                  # Go binary (Phase 7) — reverse SSH tunnel from GPU box to bastion
│
└── infra/
    ├── gcp/terraform/                 # later: Cloud Run, Cloud SQL, Artifact Registry, Secret Manager, bastion VM
    ├── runtime-compose/               # customer-controlled runtime v1 install (Class A)
    └── runtime-helm/                  # customer-controlled runtime Phase 6 (Class A)
```

**Key idea:** one Django codebase, multiple deployment profiles selected by `DJANGO_SETTINGS_MODULE`. `INSTALLED_APPS` and URL includes differ per profile, code does not.

---

## 5. Inference architecture

### Three targets, one router

```
                ┌──────────────────────────────────────────────┐
                │   Frontend (Next.js)  POST /v1/chat/...      │
                └──────────────┬───────────────────────────────┘
                               │
                ┌──────────────▼──────────────┐
                │  Backend / Inference        │
                │  apps/inference/dispatcher  │
                │  → looks up tenant's active │
                │    InferenceTarget          │
                └──┬─────────┬─────────┬──────┘
                   │         │         │
        ┌──────────▼─┐  ┌────▼─────┐  ┌─▼──────────────────┐
        │ customer-  │  │ vendor-  │  │ remote provider    │
        │ controlled │  │ hosted   │  │ (OpenAI/Anthropic) │
        │ runtime    │  │ GPU pool │  │  Phase 8           │
        │ (llama.cpp │  │ (vLLM,   │  │                    │
        │  download  │  │  ours)   │  │  vendor-hosted     │
        │  + run)    │  │ Phase 7  │  │                    │
        │ Class A    │  │ Class B  │  │  Class B           │
        └────────────┘  └──────────┘  └────────────────────┘
```

### `InferenceBackend` interface

```python
class InferenceBackend(Protocol):
    target_id: UUID
    async def chat_completions(self, req: ChatRequest) -> AsyncIterator[Chunk]: ...
    async def list_models(self) -> list[ModelHandle]: ...
    async def health(self) -> HealthStatus: ...
```

All three concrete backends (`LocalRuntimeBackend`, `BareMetalBackend`, `RemoteProviderBackend`) implement this. The dispatcher knows nothing about engines.

The class names refer to **engines**, not deployment classes. `LocalRuntimeBackend` runs in whichever environment the runtime image is deployed to: customer hardware (Class A) or, in principle, our hosted hardware. The `BareMetalBackend` exists to *reach* our vendor-hosted GPU pool from the control plane and is the path used by Phase 7 only.

### Streaming

Server-Sent Events from native async Django views (no Channels). The async view forwards tokens from the engine's HTTP stream straight to the client via `StreamingHttpResponse`. OpenAI chat-completions wire format.

### Local runtime engine lifecycle

`apps/inference/backends/local_runtime.py::LlamaCppRunner`:
- `start(model_id) → port`
- `stop()`
- `health()`
- One model loaded per worker; LRU unload on a new model request.
- llama-server bound to `127.0.0.1`, never exposed.

### Vendor-hosted GPU pool connectivity (Phase 7)

This is **our** infrastructure (Class B). It is *not* on-prem from the customer's perspective. Tenants who require true on-prem must stay on the customer-controlled runtime path (Phase 1–6).

- Each GPU box (in our cloud account / colo) runs `vllm serve` (or `llama-server`) bound to `127.0.0.1`, plus a small Go `tunnel-agent` opening a **reverse SSH tunnel** to a bastion in our VPC.
- The bastion forwards `127.0.0.1:<random>` per tenant to the box's local engine.
- Control-plane Django connects to the bastion port.
- Per-request short-lived JWT signed by the control plane and verified by an auth shim in front of the engine. Tunnel + signed request = defense in depth.
- **"SSH-based" describes internal transport only.** Tenants do **not** get shell access.
- GPU-box agent calls `POST /control/gpu_box/register` on startup with `{box_id, available_models, gpu_info}`. Catalog merges this into the per-tenant model list.

**Key & credential rotation (locked Phase 7 security stance):**

| Credential | Lifetime | Rotation | Grace window |
|---|---|---|---|
| Control-plane JWT signing key (Ed25519) | 90 days | Auth shim accepts **current + previous** verifying key | 7 days overlap |
| Per-request JWT (mints chat traffic) | 30 s TTL | Single-use; `jti` tracked to prevent replay | n/a |
| Per-box SSH key (tunnel-agent → bastion) | 30 days | Agent generates new key, registers via mTLS, control plane authorizes; old key revoked | 24 h overlap |
| Bastion `authorized_keys` (per tenant) | Tied to GPU reservation | Re-issued on reservation change; revoked on reservation end | n/a |

All rotations are non-disruptive (overlapping validity windows); no scheduled downtime, no manual intervention.

---

## 6. Catalog & compliance

Every catalog row carries provenance and license fields from day 0. This is non-negotiable; enterprises will ask, and adding it later means migrations on production data.

`apps/catalog/models.py::CatalogModel`:

| Field | Purpose |
|---|---|
| `id`, `slug`, `display_name`, `family` | Identity |
| `source_url` | Exact HF URL |
| `source_repo`, `source_revision` | HF repo + commit SHA, pinned (never `main`) |
| `format` | `gguf` \| `safetensors` \| `awq` \| `gptq` |
| `compatible_engines` | array, e.g. `["llamacpp"]` or `["vllm","tgi"]` |
| `sha256` | Verified post-download; download fails closed on mismatch |
| `size_bytes` | Disk preflight |
| `license_spdx` | `apache-2.0`, `mit`, `llama3.1`, `gemma`, etc. |
| `license_url`, `license_text_sha256` | Click-through + tamper check |
| `allowed_use` | Enum: `commercial`, `research-only`, `restricted` |
| `manifest_signature` | Ed25519 signature over the row, signed by control-plane key. Runtime verifies before download. |
| `gguf_metadata` (or `model_metadata`) | Cached `n_ctx`, `n_layer`, etc. from the file header |

### Download flow (runtime)

1. Fetch manifest from control plane.
2. Verify Ed25519 signature with embedded public key.
3. Check tenant's `license_allowlist`.
4. Disk preflight (`size_bytes` < free).
5. Stream download with progress events.
6. Verify `sha256`. Fail closed on mismatch.
7. Write `model.yml` next to the file.

### Catalog scope for v1

- Curated 5–20 vetted GGUFs.
- "Custom HF URL" is feature-flagged off by default.
- Air-gapped install (later): pre-staged tarball with the same manifest format dropped into `${DATA_DIR}/import/`. No code change.

---

## 7. Multi-tenancy rules

| Context | Rule | Enforcement |
|---|---|---|
| Control plane | Multi-tenant. Every row has `tenant_id`. | Postgres RLS + `TenantMiddleware` |
| Customer-controlled runtime (Class A) | **Single-tenant by default.** One install = one tenant. `tenant_id` hard-coded from registration. | Constant injected at startup; no tenant switching UI |
| Bare-metal GPU box | **Zero-tenant.** Box just serves a token-authed API. | Tenant binding happens in the control-plane router; the box doesn't know who it serves |

This boundary is non-negotiable. Any future "multi-tenant on a single customer-controlled runtime install" feature requires a security review; do not add it incrementally.

---

## 8. Auth (Phase 4)

Auth follows data: **same code path in every deployment class**, just a different Postgres and a different network. Below is the locked spec for what Phase 4 implements; nothing here is hand-wavable.

### 8.1 Pre-decided shape (all classes)

| Concern | Decision |
|---|---|
| User identifier | Email (lowercased, normalized on save). `USERNAME_FIELD = "email"`. `display_name` is the human label. |
| User model | Custom `User(AbstractBaseUser, PermissionsMixin)` in `apps/authentication/`, UUID PK, `display_name`, `is_active`, `is_staff`, `must_change_password`, `metadata` JSONField. |
| Hashing | `argon2-cffi` first in `PASSWORD_HASHERS`, `pbkdf2` second so old hashes still verify and rehash on next login. |
| Password validators | Django's MinimumLength (10), CommonPassword, NumericPassword, UserAttributeSimilarity. |
| Token engine | `djangorestframework-simplejwt` with the `token_blacklist` app installed and migrated. `BLACKLIST_AFTER_ROTATION=True`. |
| Lifetimes | Access 15 min, refresh 7 days. Logout blacklists the current refresh token. |
| Where tokens live | HttpOnly + Secure + SameSite cookies named `access_token` / `refresh_token`. Never `localStorage`, never `Authorization` headers from the browser. |
| Auth class | `apps.authentication.cookie_auth.CookieJWTAuthentication` — reads `access_token` cookie, falls back to `Authorization: Bearer …` for service-to-service. |
| Brute-force lockout | `django-axes` with `AXES_ONLY_USER_FAILURES=True`. **Lock the account, not the IP** — corporate NAT puts a whole office behind one IP and IP-based lockout would lock everyone for one user's bad password. |
| TenantMiddleware | Reads `tenant_id` claim from the verified access token; sets `request.tenant`. |

### 8.2 Per-class differences

Code is the same; the differences are operational:

| Class | Where users + hashes live | Signup UX | Outbound calls during login |
|---|---|---|---|
| **A. Customer-controlled** | Customer's Postgres | None — admin creates users | None. Login works air-gapped. |
| **B. Vendor-hosted** | Our cloud Postgres | Open or invite-only per tenant policy | Internal to our VPC |
| **C. BYOC** | Postgres in the customer's cloud account, reached via private connectivity (PSC / VPC peering / Tailscale) | Same as Class A | Inside the customer's VPC |

The `AUTH_PROFILE` env var (`runtime` / `control_plane` / `baremetal`) gates whether the public signup endpoint and signup UI exist. Class A runs `AUTH_PROFILE=runtime` → no signup, admin-only user creation.

### 8.3 First-admin bootstrap (Class A)

A clean three-step install runbook — no broken middle states:

1. Install runs migrations.
2. Helm post-install hook (or `./scripts/dev.sh init` locally) executes `python manage.py createsuperuser` — interactive prompt for email + display_name + password. This produces the very first admin row in `auth_user`.
3. Admin opens `<install URL>/login`, signs in, lands on **Settings → Users** to create more accounts.

User creation by admin in v1 (no SMTP assumption):

- Admin enters email + display_name + a temporary password.
- New user has `must_change_password=True`.
- Admin shares the credentials out-of-band (Slack, secure DM, paper).
- On first login, the user is forced through `/account/set-password` before they can do anything else.
- `must_change_password` is cleared on success.

**Invite-via-email** (one-time link with short-lived signed token) is a Phase 4.5 add-on, gated on the customer configuring SMTP. The temporary-password flow above keeps working with no SMTP.

### 8.4 CSRF strategy (mandatory for cookie auth)

Cookies travel automatically with cross-site form submissions, so **cookie auth without CSRF protection is a vulnerability**, not an oversight to defer.

- Backend issues a non-HttpOnly `csrftoken` cookie on first GET (Django's standard CsrfViewMiddleware behavior).
- `CookieJWTAuthentication.authenticate()` enforces CSRF on unsafe methods (POST, PUT, PATCH, DELETE) the same way `SessionAuthentication` does — by calling `CsrfViewMiddleware.process_view()` and rejecting on mismatch. Safe methods (GET, HEAD, OPTIONS) skip the check.
- Frontend `ApiClient` reads the `csrftoken` cookie at startup (it is intentionally NOT HttpOnly so JS can read it) and sets `X-CSRFToken` on every non-GET request automatically.
- This is the standard double-submit-cookie pattern; we don't roll our own.

### 8.5 Cookie attributes

```
HttpOnly:  true              # always — XSS can't read tokens
Secure:    true (prod)       # HTTPS-only; dev exception flips with DJANGO_DEBUG
SameSite:  Lax (default)     # OK for same-origin app+API
Domain:    unset (default)   # browser scopes to current host
```

**On-prem TLS is required.** A customer running over plain HTTP on a LAN with `Secure=true` will see login silently fail (browser drops the cookie). The on-prem install runbook MUST front the app with TLS — Caddy / nginx / a Helm-managed cert-manager Issuer. We don't ship `Secure=false` even on private networks; HTTP-only deployments are an explicit dev-only configuration.

### 8.6 Same-origin vs CORS-with-credentials

Two valid topologies; v1 ships only the simpler one:

**Topology A (default v1) — same-origin.** Frontend (Next.js) and backend (Django) live on the same hostname, with Next either reverse-proxying `/api/*` to Django (recommended for prod) or running side-by-side at different ports during dev (Lax cookies cover both). No CORS preflight involved. SameSite=Lax works.

**Topology B (advanced, documented but not default) — split hostnames** (e.g. `app.acme.local` + `api.acme.local`). Requires:

- Cookies: `SameSite=None; Secure=True; Domain=.acme.local` (the shared parent).
- Django: `CORS_ALLOWED_ORIGINS=["https://app.acme.local"]`, `CORS_ALLOW_CREDENTIALS=True`.
- Frontend: every fetch with `credentials: "include"`.
- All four settings have to agree or login silently fails.

Phase 4 ships A; B is a documented configuration in the install runbook for customers who need it.

### 8.7 SimpleJWT blacklist setup (so logout actually means something)

```python
INSTALLED_APPS += ["rest_framework_simplejwt.token_blacklist"]
SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME":  timedelta(minutes=15),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),
    "ROTATE_REFRESH_TOKENS":  True,
    "BLACKLIST_AFTER_ROTATION": True,
}
```

Run migrations to create the blacklist tables. Trade-off to be explicit about: **access tokens cannot be revoked mid-life** (that's the price of stateless JWT). The 15-min lifetime caps exposure; refresh-token rotation cuts it shorter than that in practice.

### 8.8 Brute-force lockout (`django-axes`)

```python
AXES_ENABLED = True
AXES_FAILURE_LIMIT = 5
AXES_COOLOFF_TIME = timedelta(minutes=15)
AXES_ONLY_USER_FAILURES = True   # ← lock account, not IP
AXES_RESET_ON_SUCCESS = True
AXES_LOCKOUT_PARAMETERS = ["username"]
```

Account lockout — not IP — is the correct default for the on-prem case where everyone shares one egress IP. Admin can reset locks via `python manage.py axes_reset_username <email>` or the admin UI.

### 8.9 Email normalization

Django's `BaseUserManager.normalize_email()` lowercases only the domain part (`Foo@ACME.com` → `Foo@acme.com`). For non-technical users this surprises everyone. We override `User.save()` to also lowercase the local part, so `Alice@Acme` and `alice@acme` are the same account. Documented in the User model docstring.

### 8.10 SSO (Phase 4.5+)

Out of scope for v1; architecturally clear so we don't paint ourselves in:

- Add `django-allauth` (broad: OAuth, OIDC, SAML) or `mozilla-django-oidc` (focused).
- Customer configures the IdP per tenant via Settings; gated by an `SSO_ENABLED` flag.
- When SSO is on, `password` field is optional/unused; the User row exists for ownership and permissions but auth comes from the IdP.
- LDAP / Active Directory: `django-auth-ldap`, same pattern.

### 8.11 Phase 4 implementation checklist

- [ ] `argon2-cffi`, `djangorestframework-simplejwt`, `django-axes` added to backend deps.
- [ ] Custom `User` model + `AUTH_USER_MODEL` setting + initial migration. Email lowercasing in `save()`.
- [ ] `PASSWORD_HASHERS`, `AUTH_PASSWORD_VALIDATORS`, `SIMPLE_JWT`, `AXES_*` settings.
- [ ] `INSTALLED_APPS += ["rest_framework_simplejwt.token_blacklist", "axes"]`; migrations run.
- [ ] `apps.authentication.cookie_auth.CookieJWTAuthentication` (CSRF-enforced for unsafe methods).
- [ ] Login / logout / refresh / me / change-password DRF endpoints. Login sets cookies; logout clears + blacklists.
- [ ] `must_change_password` forced redirect to `/account/set-password` on first login.
- [ ] `apps.core.middleware.TenantMiddleware` reads JWT claim → `request.tenant`.
- [ ] Frontend: `(auth)` route group, AuthProvider context, `useAuth()` hook. `(app)` group middleware-gated.
- [ ] `ApiClient` auto-attaches `X-CSRFToken` header on POST/PUT/PATCH/DELETE.
- [ ] `AUTH_PROFILE` toggles signup endpoint and Settings UI.
- [ ] Settings → Users page for admin (list, create, deactivate, force-reset-password).
- [ ] Install runbook: TLS reverse proxy + `createsuperuser` step.

---

## 9. Discipline: storage, secrets, async — abstractions

**Non-negotiable rule:** no GCP-specific imports in app code. Anything cloud-flavoured goes behind these three abstractions:

| Concern | Local now | Future swap | Lives in |
|---|---|---|---|
| File/blob storage | `FileSystemStorage` under `./data/` | `GCSStorage` (django-storages) | `apps/core/storage.py` (thin wrapper) + `DEFAULT_FILE_STORAGE` setting |
| Secrets | `.env.local` (gitignored) | Cloud Secret Manager | `django-environ` everywhere; never `os.environ` directly in views |
| Symmetric crypto (provider keys) | `cryptography.Fernet` with key from env | Cloud KMS | `apps/core/crypto.py::encrypt/decrypt` |
| Async work | Postgres-backed `task_queue` table polled by a `worker` docker-compose service running `python manage.py run_worker`. No Redis, no broker. Required from Phase 1 (downloads, sha256 verification, future health probes) — these are too long-running for request handlers. | Cloud Tasks (HTTP-driven workers, same `enqueue()` signature) | `apps/tasks/services/enqueue.py` + `apps/tasks/management/commands/run_worker.py` |
| Container shape | docker-compose | Cloud Run | Dockerfiles already Cloud-Run-shaped (single process, `$PORT`, non-root) from day 0 |

If the GCP migration requires changing app code, we did this wrong.

---

## 10. Local-first build plan

No GCP infrastructure is required to build, run, demo, or test through Phase 8. Everything runs locally via `docker-compose.local.yml`:

- `postgres:16`
- `backend-controlplane` (settings: `production`, models off, catalog on)
- `backend-runtime` (settings: `runtime`, full model lifecycle)
- `frontend`
- `worker` (added Phase 1, runs `python manage.py run_worker` against the runtime DB for download jobs and other long-running tasks)
- (Phase 7) `bastion` (openssh-server) + `fake-gpu-box` (CPU llama-server pretending to be a reserved GPU)

What we *don't* delay:
- Dockerfiles are Cloud-Run-shaped from day 0.
- `production.py` settings are written for Cloud Run from day 0 (DATABASE_URL only, no .env).
- We use `django-storages` from day 0 with FileSystemStorage backend; swap is one env var.

---

## 11. Phase plan

| # | Phase | Outcome | Where it runs |
|---|---|---|---|
| 0 | Skeleton | Monorepo builds; Next.js page + DRF root + Postgres up; one CI lane green | docker-compose |
| 1 | Catalog + download | Hub UI lists 10 curated GGUFs; click-to-download with progress; sha256 + signature verified; rows in `models_registry`. Adds `worker` docker-compose service + `apps/tasks` enqueue/run abstraction. | docker-compose |
| 2 | Inference + chat | `LocalRuntimeBackend` working; `/v1/chat/completions` streams via SSE; chat UI end-to-end on a 7B model | docker-compose |
| 3 | Settings + system info | Per-engine settings panels; `/system` returns CPU/RAM/GPU/VRAM; defaults adapt | docker-compose |
| 4 | Auth (real) | Custom UUID User, simplejwt cookie auth, `TenantMiddleware`, protected routes, threads scoped to user | docker-compose |
| 5 | Control-plane / runtime split | Two docker-compose services on the same host; runtime registers on startup with bootstrap token; catalog syncs down | docker-compose (still local) |
| 6 | Helm chart + customer-controlled runtime install doc (Class A) | Helm chart applies cleanly on `kind` | local kind cluster |
| 7 | Bare-metal GPU pool | `BareMetalBackend` + bastion + tunnel-agent + `gpu_pool` Django app; tenant can flip target in settings; vLLM on the (fake) GPU box | docker-compose with fake bastion + fake GPU box |
| 8 | Remote provider target | `RemoteProviderBackend`; per-tenant API keys encrypted (Fernet now) | docker-compose |
| 9 | Usage metering | `usage_event` aggregation; admin views. Billing integration deferred. | docker-compose |
| — | **GCP migration** | Flip storage to GCS, secrets to Secret Manager, push images to Artifact Registry, deploy control plane to Cloud Run | GCP |

---

## 12. GCP migration (when triggered)

Trigger candidates: first paying customer, demo to investors, multi-region requirement, or simply "we have time."

Migration is a **deployment** project, not a software project, because of the §9 discipline:

1. Provision: Cloud Run, Cloud SQL (Postgres), Artifact Registry, Secret Manager, GCS bucket, VPC + Serverless VPC connector, bastion VM (if Phase 7 is live).
2. Push images to Artifact Registry.
3. Wire env vars (`DATABASE_URL`, `DEFAULT_FILE_STORAGE=storages.backends.gcloud.GoogleCloudStorage`, secret refs).
4. Deploy control plane to Cloud Run.
5. Re-point customer-controlled runtime registration URL at the Cloud Run host.

No app-code changes. If any are required, treat it as a defect against this doc.

---

## 13. Open items / deferred decisions

| # | Item | Trigger to revisit |
|---|---|---|
| O1 | Bare-metal SSH = transport only, *not* a customer-facing shell | Confirmed; revisit only if a customer requests notebook leases (would be a separate Phase 8+ "compute lease" feature) |
| O2 | vLLM vs llama-server on bare-metal | Revisit at Phase 7 kickoff; benchmark both with a real workload |
| O3 | License/billing | Out of scope for v1; `usage_event` rows emitted from Phase 2 onward so billing is a future SQL query |
| O4 | Air-gapped install (no internet from runtime to control plane) | When a customer requires it; design uses pre-staged tarballs in `${DATA_DIR}/import/` |
| O5 | Multi-tenant on a single customer-controlled runtime install (one install, multiple departments) | Requires security review before any work; do not add incrementally |
| O6 | Custom HF URL (any GGUF, not just curated) | Feature-flagged off in v1; revisit when curated catalog feels limiting |
| O7 | Mac as a *supported* customer-controlled-runtime target (Metal acceleration) | Engine supports Metal; v1 only supports it as a CPU dev path. Revisit if a customer requests Mac on-prem. |
| O8 | Bastion location & VPC topology for GCP | Decided at GCP migration time; default = new VPC + bastion VM + Serverless VPC Access |
| O9 | Add Django Channels (WebSockets) | Triggered by features needing bidirectional realtime: live download progress fan-out across tabs, collab editing, multi-user thread presence. SSE handles v1 streaming. |
| O10 | **BYOC GPU path (Class C): customer's own GPUs running our runtime image** | Triggered by a regulated/security-sensitive buyer who wants GPU-class throughput AND data-never-leaves-their-boundary. Same `local_runtime` profile, deployed to customer's GPU hardware (not our pool). Probably a Helm chart variant. |
| O11 | "On-prem" vs "vendor-hosted" labelling on customer-facing materials | Always label deployment classes by compute owner (§1). Marketing/docs must NOT call the vendor-hosted GPU pool "on-prem"; regulated buyers will reject. |

---

## 14. Change log

| Date | Change | Reason |
|---|---|---|
| 2026-04-25 | Initial document | Pre-implementation planning complete |
| 2026-04-25 | Refinements: clarified Mac wording (§3 + §13/O7); committed to a Postgres-backed `worker` service from Phase 1 instead of sync-in-request (§9, §10, §11); added Phase 7 key/credential rotation table (§5); softened §0 "locked" wording to refer to §13 + inline TBDs | Review feedback addressed |
| 2026-04-25 | Phase 2 implementation deviation: Channels dropped from §3 stack and §5 streaming. Native async Django views + `StreamingHttpResponse` are sufficient for SSE. Channels is now an open item — revisit when WebSockets are needed. | Phase 2 build choice |
| 2026-04-25 | §1 rewritten with **deployment classes by compute owner** (A customer-controlled, B vendor-hosted, C BYOC). Renamed the Phase 7 path to "vendor-hosted GPU pool" everywhere (§1, §5, §11). Added O10 (BYOC) and O11 (labelling rule: never call vendor-hosted "on-prem"). | Terminology was sloppy: regulated buyers reject vendor-hosted-as-on-prem. |
| 2026-04-26 | §8 Auth: replaced the four-bullet sketch with a Phase-4-ready spec — locked decisions table (8.1), per-class differences (8.2), first-admin bootstrap (8.3), explicit CSRF strategy (8.4), cookie attribute table + TLS-required note (8.5), same-origin vs CORS-with-credentials topologies (8.6), SimpleJWT blacklist config (8.7), `django-axes` with `ONLY_USER_FAILURES=True` for corporate NAT (8.8), email normalization gotcha (8.9), SSO sequencing (8.10), checklist (8.11). | Pre-implementation review feedback: the sketch had implicit hand-waving on CSRF, secure-cookies-vs-LAN-HTTP, lockout-by-IP-vs-account, and bootstrap; locking before code lands. |
