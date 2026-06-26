"""Resolve every catalog entry's `source_revision`, `sha256`, `size_bytes`, and
`license_text_sha256` from Hugging Face, then rewrite curated.yaml in place
(preserving comments via ruamel.yaml).

For each row we issue ONE HEAD against `source_url` — that handles the redirect to the
LFS bucket and gives us all four headers we need:
  - X-Repo-Commit:  the commit SHA the URL resolved to
  - X-Linked-Etag:  the LFS sha256 of the file (gguf is always LFS)
  - X-Linked-Size:  the LFS file size in bytes
  - Content-Length: fallback for non-LFS small files

License text sha is best-effort: GET the converted /raw/ URL and hash the bytes.

After this command runs successfully, you can drop `--allow-placeholders` from
`seed_catalog`. Manifest signatures will then bind to the *real* sha256s.
"""
from __future__ import annotations

import hashlib
import re
import sys
from pathlib import Path
from typing import Any

import httpx
from django.core.management.base import BaseCommand, CommandError
from ruamel.yaml import YAML

DATA_FILE = Path(__file__).resolve().parent.parent.parent / "data" / "curated.yaml"

_yaml = YAML()
_yaml.preserve_quotes = True
_yaml.width = 1000  # don't wrap long URLs


def _blob_to_raw(url: str) -> str:
    """huggingface.co/owner/repo/blob/main/LICENSE → .../raw/main/LICENSE"""
    return re.sub(r"(huggingface\.co/[^/]+/[^/]+)/blob/", r"\1/raw/", url, count=1)


class Command(BaseCommand):
    help = (
        "Refresh source_revision / sha256 / size_bytes / license_text_sha256 in "
        "curated.yaml from the Hugging Face API, in place."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Probe HF and report findings, but don't rewrite curated.yaml",
        )
        parser.add_argument(
            "--only",
            metavar="SLUG",
            help="Refresh just this one slug (useful to fix a single bad URL)",
        )
        parser.add_argument(
            "--skip-license",
            action="store_true",
            help="Skip the license-text sha256 fetch (one fewer HTTP request per row)",
        )

    def handle(self, *args, **opts):
        rows: list[dict[str, Any]] = _yaml.load(DATA_FILE)
        if not isinstance(rows, list):
            raise CommandError(f"{DATA_FILE} must be a YAML list")

        only = opts.get("only")
        skip_license = opts.get("skip_license", False)

        ok = failed = skipped = 0
        client = httpx.Client(
            timeout=httpx.Timeout(30.0, read=30.0),
            follow_redirects=True,
            headers={"User-Agent": "local-llm-catalog/0.1"},
        )

        for row in rows:
            slug = row.get("slug", "?")
            if only and slug != only:
                skipped += 1
                continue
            try:
                changes = self._refresh_row(client, row, skip_license=skip_license)
                ok += 1
                self.stdout.write(self.style.SUCCESS(
                    f"+ {slug}  rev={row['source_revision'][:8]} "
                    f"sha256={row['sha256'][:12]}…  size={row['size_bytes']:,}  "
                    f"({', '.join(changes) or 'no changes'})"
                ))
            except _ResolveError as e:
                failed += 1
                self.stdout.write(self.style.ERROR(f"! {slug}  {e}"))
            except Exception as e:  # noqa: BLE001
                failed += 1
                self.stdout.write(self.style.ERROR(f"!! {slug}  {type(e).__name__}: {e}"))

        if not opts["dry_run"] and ok > 0:
            with DATA_FILE.open("w") as f:
                _yaml.dump(rows, f)
            self.stdout.write(self.style.SUCCESS(f"\nWrote {DATA_FILE}"))
        elif opts["dry_run"]:
            self.stdout.write(self.style.WARNING("\n--dry-run: not writing YAML"))

        self.stdout.write(self.style.SUCCESS(
            f"done. resolved={ok} failed={failed} skipped={skipped}"
        ))
        if failed:
            sys.exit(1)

    # ------- per-row resolve -------

    def _refresh_row(
        self, client: httpx.Client, row: dict[str, Any], *, skip_license: bool
    ) -> list[str]:
        url = row.get("source_url")
        if not url:
            raise _ResolveError("missing source_url")

        # HF responds either with a redirect chain (e.g. lowercase → canonical capitalized
        # repo name → 302 LFS bucket) or directly with 200 for inline files. We follow the
        # redirect chain manually so we keep the LAST HF response (the 302 to the bucket)
        # — that's the one carrying X-Repo-Commit, X-Linked-Etag, X-Linked-Size.
        seen: list[str] = []
        current = url
        while True:
            r = client.head(current, follow_redirects=False)
            seen.append(f"{r.status_code} {current}")
            if r.status_code == 200:
                hf_resp = r
                break
            if r.status_code in (301, 302, 303, 307, 308):
                location = r.headers.get("location", "")
                # Once the redirect leaves huggingface.co (i.e. → cas-bridge.xethub.hf.co),
                # we're at the LFS-bucket hop and `r` already has the headers we need.
                if "huggingface.co" not in location:
                    hf_resp = r
                    break
                # Still on HF — follow the case-fix or org-rename redirect.
                current = location
                continue
            raise _ResolveError(
                f"HEAD chain failed: {' → '.join(seen)}"
            )

        commit = hf_resp.headers.get("x-repo-commit")
        if not commit:
            raise _ResolveError(
                f"no X-Repo-Commit header — chain: {' → '.join(seen)}"
            )

        linked_etag = hf_resp.headers.get("x-linked-etag", "")
        linked_size = hf_resp.headers.get("x-linked-size")
        content_length = hf_resp.headers.get("content-length")

        # LFS files: x-linked-etag is the sha256 (sometimes wrapped in quotes,
        # sometimes prefixed with `sha256:`).
        sha = linked_etag.strip('"').removeprefix("sha256:")
        if not sha or len(sha) != 64:
            # Non-LFS (small file) — fall back to GET + hash. GGUFs are always LFS so
            # this branch is rare, but the command stays general-purpose this way.
            full = client.get(url, follow_redirects=True)
            if full.status_code != 200:
                raise _ResolveError(f"GET fallback {url} → {full.status_code}")
            sha = hashlib.sha256(full.content).hexdigest()

        size_str = linked_size or content_length
        if not size_str:
            raise _ResolveError("no size header (X-Linked-Size or Content-Length)")
        size = int(size_str)

        changes: list[str] = []
        if row.get("source_revision") != commit:
            changes.append(f"rev: {str(row.get('source_revision'))[:8]}→{commit[:8]}")
            row["source_revision"] = commit
        if row.get("sha256") != sha:
            changes.append(
                f"sha256: {str(row.get('sha256'))[:12]}…→{sha[:12]}…"
            )
            row["sha256"] = sha
        if row.get("size_bytes") != size:
            changes.append(f"size: {row.get('size_bytes')}→{size}")
            row["size_bytes"] = size

        if not skip_license and row.get("license_url"):
            try:
                lic_raw = _blob_to_raw(row["license_url"])
                lic = client.get(lic_raw)
                if lic.status_code == 200:
                    new_lic_sha = hashlib.sha256(lic.content).hexdigest()
                    if row.get("license_text_sha256") != new_lic_sha:
                        changes.append("license_sha")
                        row["license_text_sha256"] = new_lic_sha
                else:
                    self.stdout.write(self.style.WARNING(
                        f"  license fetch for {row['slug']}: {lic.status_code} {lic_raw}"
                    ))
            except httpx.HTTPError as e:
                self.stdout.write(self.style.WARNING(
                    f"  license fetch for {row['slug']}: {type(e).__name__} {e}"
                ))

        # Vision: same HEAD-chain logic for the optional mmproj companion file.
        mmproj_url = row.get("mmproj_url") or ""
        if mmproj_url:
            try:
                mm_sha, mm_size = self._resolve_blob(client, mmproj_url)
                if row.get("mmproj_sha256") != mm_sha:
                    changes.append(f"mmproj_sha: …→{mm_sha[:12]}…")
                    row["mmproj_sha256"] = mm_sha
                if row.get("mmproj_size_bytes") != mm_size:
                    changes.append(f"mmproj_size: {row.get('mmproj_size_bytes')}→{mm_size}")
                    row["mmproj_size_bytes"] = mm_size
                if not row.get("vision_enabled"):
                    changes.append("vision_enabled→true")
                    row["vision_enabled"] = True
            except _ResolveError as e:
                self.stdout.write(self.style.ERROR(
                    f"  mmproj resolve failed for {row['slug']}: {e}"
                ))
                raise

        return changes

    def _resolve_blob(self, client: httpx.Client, url: str) -> tuple[str, int]:
        """Run the HEAD redirect chain for a single HF blob URL, return (sha256, size)."""
        seen: list[str] = []
        current = url
        while True:
            r = client.head(current, follow_redirects=False)
            seen.append(f"{r.status_code} {current}")
            if r.status_code == 200:
                hf_resp = r
                break
            if r.status_code in (301, 302, 303, 307, 308):
                location = r.headers.get("location", "")
                if "huggingface.co" not in location:
                    hf_resp = r
                    break
                current = location
                continue
            raise _ResolveError(f"HEAD chain failed: {' → '.join(seen)}")

        sha = hf_resp.headers.get("x-linked-etag", "").strip('"').removeprefix("sha256:")
        if not sha or len(sha) != 64:
            full = client.get(url, follow_redirects=True)
            if full.status_code != 200:
                raise _ResolveError(f"GET fallback {url} → {full.status_code}")
            sha = hashlib.sha256(full.content).hexdigest()

        size_str = (
            hf_resp.headers.get("x-linked-size")
            or hf_resp.headers.get("content-length")
        )
        if not size_str:
            raise _ResolveError("no size header on mmproj response")
        return sha, int(size_str)


class _ResolveError(Exception):
    pass
