"use client";

import { useCallback, useRef, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

type Result = {
  job_id: string;
  vessel_voxels: number;
  preview_image: string;
  overlay_image: string;
  error?: string;
};

function formatVoxels(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export default function VesselSegmentationPage() {
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((f: File) => {
    setFile(f); setResult(null); setError(null);
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }, [handleFile]);

  const run = async () => {
    if (!file) return;
    setLoading(true); setError(null); setResult(null);
    try {
      const fd = new FormData();
      fd.append("scan", file);
      const resp = await fetch(`${API}/api/vessel/segment/`, { method: "POST", body: fd });
      if (!resp.ok) {
        const text = await resp.text().catch(() => "");
        let msg = "Request failed";
        try { msg = JSON.parse(text).error ?? msg; } catch { if (text && !text.trimStart().startsWith("<")) msg = text.slice(0, 300); }
        throw new Error(msg);
      }
      setResult(await resp.json());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const downloadMask = () => {
    if (!result) return;
    window.open(`${API}/api/vessel/download/${result.job_id}/`, "_blank");
  };

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 md:px-8 md:py-8">

      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[var(--text)]">Brain Vessel Segmentation</h1>
          <p className="mt-0.5 text-sm text-[var(--muted)]">
            nnUNet · robust-vessel-segmentation · 3D CTA → binary vessel mask
          </p>
        </div>
        <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-widest text-amber-300">
          Research only
        </span>
      </div>

      <div className="grid gap-5 md:grid-cols-2">

        {/* Left: upload + run */}
        <div className="flex flex-col gap-3">

          {/* Drop zone */}
          <div
            role="button"
            tabIndex={0}
            onClick={() => inputRef.current?.click()}
            onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={`flex min-h-[200px] cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed transition ${
              dragging
                ? "border-[var(--accent)] bg-[var(--accent)]/10"
                : "border-[var(--border)] hover:border-[var(--accent)]/50 hover:bg-white/[0.02]"
            }`}
          >
            {file ? (
              <div className="flex flex-col items-center gap-2 text-center px-4">
                <svg className="h-7 w-7 text-[var(--accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                </svg>
                <p className="text-sm font-medium text-[var(--accent)]">{file.name}</p>
                <p className="text-[11px] text-[var(--muted)]/60">NIfTI ready — no browser preview available</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 text-center px-4">
                <svg className="h-7 w-7 text-[var(--muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                </svg>
                <p className="text-sm text-[var(--muted)]">
                  Drop a CTA scan or <span className="text-[var(--accent)]">browse</span>
                </p>
                <p className="text-[11px] text-[var(--muted)]/50">NIfTI (.nii.gz, .nii) or NRRD (.nrrd)</p>
              </div>
            )}
            <input
              ref={inputRef}
              type="file"
              accept=".nii,.nii.gz,.nrrd,.mhd,.mha,application/gzip"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
            />
          </div>

          {file && (
            <p className="text-xs text-[var(--muted)]">
              {file.name}{" "}
              <button className="text-[var(--accent)] hover:underline" onClick={() => { setFile(null); setResult(null); }}>
                Remove
              </button>
            </p>
          )}

          <button
            onClick={run}
            disabled={!file || loading}
            className="flex items-center justify-center gap-2 rounded-xl bg-[var(--accent)] py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {loading ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                Segmenting… (may take several minutes on CPU)
              </>
            ) : "Segment vessels"}
          </button>

          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">{error}</div>
          )}

        </div>

        {/* Right: results */}
        <div className="flex flex-col gap-3">
          {result ? (
            <>
              <div className="rounded-xl border border-[var(--accent)]/30 bg-[var(--accent)]/5 px-4 py-3">
                <p className="text-sm font-semibold text-[var(--accent)]">Segmentation complete</p>
                <p className="mt-0.5 text-xs text-[var(--muted)]">
                  {formatVoxels(result.vessel_voxels)} vessel voxels detected
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="mb-1 text-[10px] uppercase tracking-wider text-[var(--muted)]">Input (axial)</p>
                  <img
                    src={`data:image/png;base64,${result.preview_image}`}
                    alt="CTA axial slice"
                    className="w-full rounded-xl border border-[var(--border)]/60"
                  />
                </div>
                <div>
                  <p className="mb-1 text-[10px] uppercase tracking-wider text-[var(--muted)]">Vessel overlay</p>
                  <img
                    src={`data:image/png;base64,${result.overlay_image}`}
                    alt="Vessel segmentation overlay"
                    className="w-full rounded-xl border border-[var(--border)]/60"
                  />
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={downloadMask}
                  className="flex-1 rounded-lg border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-3 py-2 text-xs font-medium text-[var(--accent)] transition hover:bg-[var(--accent)]/20"
                >
                  Download 3D mask (.nii.gz)
                </button>
                <button
                  onClick={() => { setResult(null); setFile(null); }}
                  className="rounded-lg border border-[var(--border)] px-3 py-2 text-xs text-[var(--muted)] transition hover:text-[var(--text)]"
                >
                  New scan
                </button>
              </div>
            </>
          ) : (
            <div className="flex h-full min-h-[260px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--border)] text-center">
              <p className="text-sm text-[var(--muted)]">Results will appear here</p>
              <p className="text-xs text-[var(--muted)]/50">Upload a .nii.gz CTA scan and click Segment vessels</p>
            </div>
          )}
        </div>
      </div>

      <p className="mt-6 text-[11px] text-[var(--muted)]/50">
        Model: alceballosa/robust-vessel-segmentation · CC-BY-NC-SA 4.0 · not for clinical use.
      </p>

    </main>
  );
}
