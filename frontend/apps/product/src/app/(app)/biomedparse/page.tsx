"use client";

import { useCallback, useRef, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const PRESETS = [
  { label: "Hemorrhage", value: "bleeding", short: "Hemorrhage", color: "red" },
  { label: "Ischemic Stroke", value: "stroke", short: "Ischemic", color: "amber" },
];

type Result = {
  detected: boolean;
  confidence: number;
  prompt: string;
  overlay_image: string;
  original_image: string;
  error?: string;
};

export default function BiomedParsePage() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("bleeding");
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((f: File) => {
    setFile(f); setResult(null); setError(null);
    setPreview(URL.createObjectURL(f));
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }, [handleFile]);

  const run = async () => {
    if (!file || !prompt) return;
    setLoading(true); setError(null); setResult(null);
    try {
      const fd = new FormData();
      fd.append("image", file);
      fd.append("prompt", prompt);
      const resp = await fetch(`${API}/api/biomedparse/segment/`, { method: "POST", body: fd });
      if (!resp.ok) {
        const text = await resp.text().catch(() => "");
        let msg = "Request failed";
        try { msg = JSON.parse(text).error ?? msg; } catch { if (text && !text.trimStart().startsWith("<")) msg = text.slice(0, 200); }
        throw new Error(msg);
      }
      const data = await resp.json();
      setResult(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const activePreset = PRESETS.find((p) => p.value === prompt) ?? PRESETS[0];

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 md:px-8 md:py-8">

      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[var(--text)]">CT Scan Analysis</h1>
          <p className="mt-0.5 text-sm text-[var(--muted)]">Fine-tuned BiomedParse v2 · stroke detection &amp; segmentation</p>
        </div>
        <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-widest text-amber-300">
          Research only
        </span>
      </div>

      <div className="grid gap-5 md:grid-cols-2">

        {/* Left: upload + controls */}
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
            {preview ? (
              <img src={preview} alt="CT scan" className="max-h-[180px] rounded-lg object-contain" />
            ) : (
              <div className="flex flex-col items-center gap-2 text-center px-4">
                <svg className="h-7 w-7 text-[var(--muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                </svg>
                <p className="text-sm text-[var(--muted)]">
                  Drop a CT image or <span className="text-[var(--accent)]">browse</span>
                </p>
              </div>
            )}
            <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
          </div>

          {file && (
            <p className="text-xs text-[var(--muted)]">
              {file.name} —{" "}
              <button className="text-[var(--accent)] hover:underline" onClick={() => { setFile(null); setPreview(null); setResult(null); }}>
                Remove
              </button>
            </p>
          )}

          {/* Target */}
          <div className="flex gap-2">
            {PRESETS.map((p) => (
              <button
                key={p.value}
                onClick={() => setPrompt(p.value)}
                className={`flex-1 rounded-xl border py-2.5 text-sm font-medium transition ${
                  prompt === p.value
                    ? p.color === "red"
                      ? "border-red-500/40 bg-red-500/10 text-red-300"
                      : "border-amber-500/40 bg-amber-500/10 text-amber-300"
                    : "border-[var(--border)] text-[var(--muted)] hover:bg-white/[0.03]"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <button
            onClick={run}
            disabled={!file || loading}
            className="flex items-center justify-center gap-2 rounded-xl bg-[var(--accent)] py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {loading ? (
              <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" /> Analysing…</>
            ) : "Analyse scan"}
          </button>

          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">{error}</div>
          )}
        </div>

        {/* Right: result */}
        <div className="flex flex-col gap-3">
          {result ? (
            <>
              <div className={`rounded-xl border px-4 py-3 ${result.detected ? "border-red-500/30 bg-red-500/10" : "border-green-500/30 bg-green-500/10"}`}>
                <div className="flex items-center gap-2.5">
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${result.detected ? "bg-red-400" : "bg-green-400"}`} />
                  <p className={`font-semibold ${result.detected ? "text-red-300" : "text-green-300"}`}>
                    {result.detected ? `${activePreset.short} detected` : `No ${activePreset.short.toLowerCase()} detected`}
                  </p>
                  <span className={`ml-auto text-sm font-medium ${result.detected ? "text-red-300" : "text-green-300"}`}>
                    {(result.confidence * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${result.detected ? "bg-red-400" : "bg-green-400"}`}
                    style={{ width: `${(result.confidence * 100).toFixed(0)}%` }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="mb-1 text-[10px] uppercase tracking-wider text-[var(--muted)]">Original</p>
                  <img src={`data:image/png;base64,${result.original_image}`} alt="Original CT" className="w-full rounded-xl border border-[var(--border)]/60" />
                </div>
                <div>
                  <p className="mb-1 text-[10px] uppercase tracking-wider text-[var(--muted)]">Segmentation</p>
                  <img src={`data:image/png;base64,${result.overlay_image}`} alt="Overlay" className="w-full rounded-xl border border-[var(--border)]/60" />
                </div>
              </div>

              <button
                onClick={() => { setResult(null); setFile(null); setPreview(null); }}
                className="rounded-lg border border-[var(--border)] px-3 py-2 text-xs text-[var(--muted)] transition hover:text-[var(--text)]"
              >
                Analyse another scan
              </button>
            </>
          ) : (
            <div className="flex h-full min-h-[260px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--border)] text-center">
              <p className="text-sm text-[var(--muted)]">Results will appear here</p>
              <p className="text-xs text-[var(--muted)]/50">Upload an image and click Analyse scan</p>
            </div>
          )}
        </div>
      </div>

      <p className="mt-6 text-[11px] text-[var(--muted)]/50">
        Research prototype · Henry M. Gunn High School · not for clinical diagnosis or treatment.
      </p>

    </main>
  );
}
