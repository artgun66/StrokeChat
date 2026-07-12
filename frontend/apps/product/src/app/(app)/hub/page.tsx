"use client";

import type { CatalogModel } from "@local-llm/api-client";

type ModelTier = CatalogModel["tier"];
import { useEffect, useState } from "react";
import { api } from "../../../lib/api";
import { DownloadButton } from "../../../components/DownloadButton";

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

const TIER_ORDER: ModelTier[] = ["tiny", "small", "medium", "coding", "large"];

const TIER_SHORT: Record<ModelTier, string> = {
  tiny: "Tiny",
  small: "Small",
  medium: "Medium",
  coding: "Code",
  large: "Large",
};

const TIER_HINT: Record<ModelTier, string> = {
  tiny: "CPU / edge (≤2B)",
  small: "3B–9B",
  medium: "12B–32B",
  coding: "Code & tools",
  large: "70B+ / multi-GPU",
};

function tierIndex(t: ModelTier): number {
  const i = TIER_ORDER.indexOf(t);
  return i < 0 ? 999 : i;
}

export default function HubPage() {
  const [catalogModels, setCatalogModels] = useState<CatalogModel[]>([]);
  const [readySlugs, setReadySlugs] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.catalog.list(), api.models.list()])
      .then(([data, modelsData]) => {
        if (cancelled) return;
        setCatalogModels(data.results);
        setReadySlugs(
          new Set(
            modelsData.results
              .filter((m) => m.status === "ready")
              .map((m) => m.catalog_slug),
          ),
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const sorted: CatalogModel[] = [...catalogModels].sort((a, b) => {
    const d = tierIndex(a.tier) - tierIndex(b.tier);
    if (d !== 0) return d;
    return a.display_name.localeCompare(b.display_name, "en", {
      sensitivity: "base",
    });
  });

  return (
    <main className="mx-auto max-w-6xl px-4 py-5 md:px-6">
      <div className="border-b border-[var(--border)]/80 pb-4">
        <h1 className="text-lg font-semibold tracking-tight text-[var(--text)] md:text-xl">
          Model catalog
        </h1>
        <p className="mt-1 text-xs leading-snug text-[var(--muted)]">
          Signed manifests, checksum-verified downloads.{" "}
          <span className="text-[var(--text)]/80">
            {loading
              ? "Loading…"
              : `${sorted.length} model${sorted.length === 1 ? "" : "s"} available.`}
          </span>
        </p>
      </div>

      <div className="mt-3 overflow-x-auto rounded-lg border border-[var(--border)]/90 bg-[var(--panel)]/50 shadow-sm shadow-black/20">
        <table className="w-full min-w-[720px] table-fixed border-collapse text-left text-sm">
          <caption className="sr-only">
            List of open-weight models by tier, size, and license, with
            download actions
          </caption>
          <thead>
            <tr className="border-b border-[var(--border)] bg-[var(--panel-elevated)]/90 text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">
              <th className="w-[32%] px-3 py-2 font-medium">Model</th>
              <th className="w-[8%] px-2 py-2 font-medium" title="Hardware tier">
                Tier
              </th>
              <th className="w-[9%] px-2 py-2 font-medium">Size</th>
              <th className="w-[11%] px-2 py-2 font-medium">License</th>
              <th className="w-[25%] px-2 py-2 font-medium">Repository</th>
              <th className="w-[15%] px-3 py-2 text-right font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((m) => (
              <tr
                key={m.id}
                className="border-b border-[var(--border)]/50 last:border-0 odd:bg-slate-50/60 hover:bg-slate-50"
              >
                <td className="px-3 py-1.5 align-top">
                  <div className="font-medium leading-tight text-[var(--text)]">
                    {m.display_name}
                  </div>
                  <div className="mt-0.5 text-[10px] leading-tight text-[var(--muted)]">
                    {m.family} · {m.compatible_engines.join(", ")}
                  </div>
                </td>
                <td className="px-2 py-1.5 align-top">
                  <span
                    className="inline-block rounded border border-[var(--border)] bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-[var(--text)]"
                    title={TIER_HINT[m.tier]}
                  >
                    {TIER_SHORT[m.tier]}
                  </span>
                </td>
                <td
                  className="whitespace-nowrap px-2 py-1.5 align-top text-xs tabular-nums text-[var(--text)]/90"
                >
                  {formatBytes(m.size_bytes)}
                </td>
                <td className="px-2 py-1.5 align-top text-xs text-[var(--muted)]">
                  {m.license_spdx}
                </td>
                <td
                  className="max-w-0 px-2 py-1.5 align-top text-[10px] font-mono text-[var(--muted)]"
                >
                  <span className="line-clamp-2" title={m.source_repo}>
                    {m.source_repo}
                  </span>
                </td>
                <td className="px-2 py-1 text-right align-middle">
                  <div className="inline-flex justify-end">
                    <DownloadButton
                      catalogSlug={m.slug}
                      alreadyReady={readySlugs.has(m.slug)}
                      compact
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

    </main>
  );
}
