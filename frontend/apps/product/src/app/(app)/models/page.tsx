"use client";

import type { ModelFile } from "@local-llm/api-client";
import { useEffect, useState } from "react";
import { api } from "../../../lib/api";

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(1)} ${units[i]}`;
}

function formatShortDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("en", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}

function statusClass(status: ModelFile["status"]): string {
  switch (status) {
    case "ready":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200/95";
    case "failed":
      return "border-red-500/30 bg-red-500/10 text-red-200/95";
    default:
      return "border-[var(--border)]/80 bg-white/[0.04] text-[var(--muted)]";
  }
}

export default function ModelsPage() {
  const [files, setFiles] = useState<ModelFile[]>([]);

  useEffect(() => {
    let cancelled = false;
    api.models
      .list()
      .then((data) => {
        if (!cancelled) setFiles(data.results);
      })
      .catch(() => {
        /* leave empty on failure */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const items = [...files].sort(
    (a, b) =>
      new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
  );

  return (
    <main className="mx-auto max-w-6xl px-4 py-5 md:px-6">
      <div className="border-b border-[var(--border)]/80 pb-4">
        <h1 className="text-lg font-semibold tracking-tight text-[var(--text)] md:text-xl">
          Installed models
        </h1>
        <p className="mt-1 text-xs leading-snug text-[var(--muted)]">
          Weight files on this runtime used by Chat.{" "}
          <span className="text-[var(--text)]/80">
            {items.length} file{items.length === 1 ? "" : "s"} on disk.
          </span>{" "}
          Paths under{" "}
          <code className="rounded border border-[var(--border)]/80 bg-white/[0.04] px-1 py-0.5 text-[10px] text-[var(--text)]/85">
            $DATA_DIR/models/&lt;slug&gt;/
          </code>
        </p>
      </div>

      {items.length === 0 ? (
        <p className="mt-6 text-xs text-[var(--muted)]">
          Nothing installed yet.{" "}
          <a
            className="font-medium text-[var(--link)] underline decoration-white/15 underline-offset-2 transition hover:decoration-[var(--link)]/60"
            href="/hub"
          >
            Open the catalog
          </a>{" "}
          to download a model.
        </p>
      ) : (
        <div className="mt-3 overflow-x-auto rounded-lg border border-[var(--border)]/90 bg-[var(--panel)]/50 shadow-sm shadow-black/20">
          <table className="w-full min-w-[680px] table-fixed border-collapse text-left text-sm">
            <caption className="sr-only">
              Installed model files: size, status, path, checksum, last updated
            </caption>
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--panel-elevated)]/90 text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">
                <th className="w-[18%] px-3 py-2 font-medium">Model</th>
                <th className="w-[10%] px-2 py-2 font-medium">Size</th>
                <th className="w-[12%] px-2 py-2 font-medium">Status</th>
                <th className="w-[30%] px-2 py-2 font-medium">Path</th>
                <th className="w-[22%] px-2 py-2 font-medium">SHA256</th>
                <th className="w-[8%] px-3 py-2 text-right font-medium">Updated</th>
              </tr>
            </thead>
            <tbody>
              {items.map((m) => (
                <tr
                  key={m.id}
                  className="border-b border-[var(--border)]/50 last:border-0 odd:bg-white/[0.01] hover:bg-white/[0.03]"
                >
                  <td className="px-3 py-1.5 align-top">
                    <div className="font-medium leading-tight text-[var(--text)]">
                      {m.catalog_slug}
                    </div>
                    {m.status === "failed" && m.error ? (
                      <p
                        className="mt-1 line-clamp-2 text-[10px] leading-snug text-[var(--error)]"
                        title={m.error}
                      >
                        {m.error}
                      </p>
                    ) : null}
                  </td>
                  <td className="whitespace-nowrap px-2 py-1.5 align-top text-xs tabular-nums text-[var(--text)]/90">
                    {formatBytes(m.size_bytes)}
                  </td>
                  <td className="px-2 py-1.5 align-top">
                    <span
                      className={
                        "inline-block rounded border px-1.5 py-0.5 text-[10px] font-medium capitalize " +
                        statusClass(m.status)
                      }
                    >
                      {m.status}
                    </span>
                  </td>
                  <td
                    className="max-w-0 px-2 py-1.5 align-top text-[10px] font-mono text-[var(--muted)]"
                    title={m.local_path}
                  >
                    <span className="line-clamp-2 break-all">{m.local_path}</span>
                  </td>
                  <td
                    className="px-2 py-1.5 align-top font-mono text-[10px] text-[var(--muted)]"
                    title={m.sha256}
                  >
                    {m.sha256.slice(0, 14)}…
                  </td>
                  <td className="whitespace-nowrap px-3 py-1.5 text-right align-top text-[10px] tabular-nums text-[var(--muted)]">
                    {formatShortDate(m.updated_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
