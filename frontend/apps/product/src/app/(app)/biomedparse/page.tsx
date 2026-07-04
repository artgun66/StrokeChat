"use client";

import { useCallback, useRef, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const PRESETS = [
  { label: "Hemorrhage", value: "bleeding", short: "Hemorrhage", color: "red" },
  { label: "Ischemic Stroke", value: "stroke", short: "Ischemic", color: "amber" },
];

type SliceResult = {
  filename: string;
  detected: boolean;
  confidence: number;
  mask_area_pct: number;
  aspect_score: number;
  prompt: string;
  overlay_image: string;
  original_image: string;
  error?: string;
};

function AspectScoreBreakdown({ result }: { result: SliceResult }) {
  const conf = result.confidence;
  const covPct = result.mask_area_pct;
  const covComponent = Math.min(covPct / 5.0, 1.0);
  const confPart = +(conf * 7.0).toFixed(2);
  const covPart = +(covComponent * 3.0).toFixed(2);

  return (
    <div className="rounded-xl border border-[var(--border)]/60 bg-white/[0.02] p-4">
      {/* Score header */}
      <div className="mb-3 flex items-end justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-[var(--muted)]">Aspect Score</p>
          <p className="mt-0.5 text-3xl font-bold tabular-nums text-[var(--text)]">
            {result.aspect_score.toFixed(1)}
            <span className="ml-1 text-sm font-normal text-[var(--muted)]">/ 10</span>
          </p>
        </div>
        {/* Arc indicator */}
        <div className="relative h-12 w-12">
          <svg viewBox="0 0 48 48" className="h-12 w-12 -rotate-90">
            <circle cx="24" cy="24" r="18" fill="none" stroke="currentColor" strokeWidth="4" className="text-white/10" />
            <circle
              cx="24" cy="24" r="18" fill="none" stroke="currentColor" strokeWidth="4"
              strokeDasharray={`${(result.aspect_score / 10) * 113} 113`}
              strokeLinecap="round"
              className={result.aspect_score >= 5 ? "text-red-400" : "text-amber-400"}
            />
          </svg>
        </div>
      </div>

      {/* Calculation breakdown */}
      <div className="space-y-2 border-t border-[var(--border)]/40 pt-3 font-mono text-[11px]">
        <p className="text-[var(--muted)]/70">Score = Detection × 7 + Coverage × 3</p>

        <div className="flex items-center gap-2">
          <span className="w-28 text-[var(--muted)]">Detection</span>
          <div className="flex-1 overflow-hidden rounded-full bg-white/10">
            <div className="h-1.5 rounded-full bg-blue-400" style={{ width: `${conf * 100}%` }} />
          </div>
          <span className="w-10 text-right text-[var(--text)]">{(conf * 100).toFixed(0)}%</span>
          <span className="w-16 text-right text-[var(--muted)]">× 7 = {confPart}</span>
        </div>

        <div className="flex items-center gap-2">
          <span className="w-28 text-[var(--muted)]">Coverage</span>
          <div className="flex-1 overflow-hidden rounded-full bg-white/10">
            <div className="h-1.5 rounded-full bg-violet-400" style={{ width: `${Math.min(covPct / 5 * 100, 100)}%` }} />
          </div>
          <span className="w-10 text-right text-[var(--text)]">{covPct.toFixed(2)}%</span>
          <span className="w-16 text-right text-[var(--muted)]">× 3 = {covPart}</span>
        </div>

        <div className="flex justify-end border-t border-[var(--border)]/40 pt-1.5">
          <span className="text-[var(--text)]">= {result.aspect_score.toFixed(1)} / 10</span>
        </div>

        <p className="text-[var(--muted)]/50">Coverage saturates at 5% of image area</p>
      </div>
    </div>
  );
}

function SliceCard({ result, index }: { result: SliceResult; index: number }) {
  const activePreset = PRESETS.find((p) => result.prompt.toLowerCase().includes(p.value)) ?? PRESETS[0];

  if (result.error) {
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4">
        <p className="text-xs font-medium text-[var(--muted)]">Slice {index + 1} — {result.filename}</p>
        <p className="mt-1 text-xs text-red-400">{result.error}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-[var(--border)]/60 bg-white/[0.015] p-4">
      {/* Slice label + verdict */}
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-[var(--muted)]">Slice {index + 1} — {result.filename}</p>
        <span className={`flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
          result.detected
            ? "border border-red-500/30 bg-red-500/10 text-red-300"
            : "border border-green-500/30 bg-green-500/10 text-green-300"
        }`}>
          <span className={`h-1.5 w-1.5 rounded-full ${result.detected ? "bg-red-400" : "bg-green-400"}`} />
          {result.detected ? `${activePreset.short} detected` : "Clear"}
        </span>
      </div>

      {/* Images */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <p className="mb-1 text-[10px] uppercase tracking-wider text-[var(--muted)]">Original</p>
          <img src={`data:image/png;base64,${result.original_image}`} alt="Original" className="w-full rounded-lg border border-[var(--border)]/60" />
        </div>
        <div>
          <p className="mb-1 text-[10px] uppercase tracking-wider text-[var(--muted)]">Segmentation</p>
          <img src={`data:image/png;base64,${result.overlay_image}`} alt="Overlay" className="w-full rounded-lg border border-[var(--border)]/60" />
        </div>
      </div>

      {/* Aspect score */}
      <AspectScoreBreakdown result={result} />
    </div>
  );
}

export default function BiomedParsePage() {
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<(string | null)[]>([]);
  const [prompt, setPrompt] = useState("bleeding");
  const [results, setResults] = useState<SliceResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback((incoming: FileList | File[]) => {
    const arr = Array.from(incoming);
    setResults([]); setError(null);
    setFiles(prev => {
      const merged = [...prev, ...arr].slice(0, 12); // max 12 slices
      setPreviews(merged.map(f => f.name.toLowerCase().endsWith(".dcm") ? null : URL.createObjectURL(f)));
      return merged;
    });
  }, []);

  const removeFile = (i: number) => {
    setFiles(prev => prev.filter((_, j) => j !== i));
    setPreviews(prev => prev.filter((_, j) => j !== i));
    setResults([]);
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
  }, [addFiles]);

  const analyseOne = async (file: File): Promise<SliceResult> => {
    const fd = new FormData();
    fd.append("image", file);
    fd.append("prompt", prompt);
    const resp = await fetch(`${API}/api/biomedparse/segment/`, { method: "POST", body: fd });
    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      let msg = "Request failed";
      try { msg = JSON.parse(text).error ?? msg; } catch { if (text && !text.trimStart().startsWith("<")) msg = text.slice(0, 200); }
      return { filename: file.name, detected: false, confidence: 0, mask_area_pct: 0, aspect_score: 0, prompt, overlay_image: "", original_image: "", error: msg };
    }
    const data = await resp.json();
    return { ...data, filename: file.name };
  };

  const run = async () => {
    if (!files.length) return;
    setLoading(true); setError(null); setResults([]);
    try {
      // Analyse all slices in parallel
      const all = await Promise.all(files.map(analyseOne));
      setResults(all);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const activePreset = PRESETS.find((p) => p.value === prompt) ?? PRESETS[0];
  const detectedCount = results.filter(r => r.detected).length;

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 md:px-8 md:py-8">

      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[var(--text)]">CT Scan Analysis</h1>
          <p className="mt-0.5 text-sm text-[var(--muted)]">Fine-tuned BiomedParse v2 · stroke detection &amp; segmentation · up to 12 slices</p>
        </div>
        <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-widest text-amber-300">
          Research only
        </span>
      </div>

      {/* Controls row */}
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end">

        {/* Drop zone */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={`flex min-h-[100px] flex-1 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed transition ${
            dragging
              ? "border-[var(--accent)] bg-[var(--accent)]/10"
              : "border-[var(--border)] hover:border-[var(--accent)]/50 hover:bg-white/[0.02]"
          }`}
        >
          <svg className="mb-1 h-6 w-6 text-[var(--muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
          </svg>
          <p className="text-sm text-[var(--muted)]">
            {files.length ? `${files.length} slice${files.length > 1 ? "s" : ""} — add more` : <>Drop slices or <span className="text-[var(--accent)]">browse</span></>}
          </p>
          <p className="text-[11px] text-[var(--muted)]/50">PNG, JPEG, DICOM · up to 12 images</p>
          <input
            ref={inputRef} type="file" accept="image/*,.dcm" multiple className="hidden"
            onChange={(e) => { if (e.target.files?.length) addFiles(e.target.files); }}
          />
        </div>

        {/* Right controls */}
        <div className="flex flex-col gap-2 sm:w-52">
          <div className="flex gap-2">
            {PRESETS.map((p) => (
              <button
                key={p.value}
                onClick={() => setPrompt(p.value)}
                className={`flex-1 rounded-xl border py-2 text-xs font-medium transition ${
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
            disabled={!files.length || loading}
            className="flex items-center justify-center gap-2 rounded-xl bg-[var(--accent)] py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {loading
              ? <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" /> Analysing {files.length} slice{files.length > 1 ? "s" : ""}…</>
              : `Analyse ${files.length || ""} scan${files.length !== 1 ? "s" : ""}`}
          </button>
        </div>
      </div>

      {/* Thumbnail strip */}
      {files.length > 0 && (
        <div className="mb-5 flex flex-wrap gap-2">
          {files.map((f, i) => (
            <div key={i} className="group relative">
              {previews[i]
                ? <img src={previews[i]!} alt={f.name} className="h-16 w-16 rounded-lg border border-[var(--border)]/60 object-cover" />
                : <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-[var(--border)]/60 bg-white/[0.03] text-[10px] text-[var(--muted)]">DCM</div>
              }
              <button
                onClick={() => removeFile(i)}
                className="absolute -right-1.5 -top-1.5 hidden h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] text-white group-hover:flex"
              >×</button>
              <p className="mt-0.5 max-w-[64px] truncate text-[9px] text-[var(--muted)]/60">{f.name}</p>
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">{error}</div>
      )}

      {/* Summary banner when multiple results */}
      {results.length > 1 && (
        <div className={`mb-5 flex items-center gap-3 rounded-xl border px-4 py-3 ${
          detectedCount > 0 ? "border-red-500/30 bg-red-500/5" : "border-green-500/30 bg-green-500/5"
        }`}>
          <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${detectedCount > 0 ? "bg-red-400" : "bg-green-400"}`} />
          <div>
            <p className={`text-sm font-semibold ${detectedCount > 0 ? "text-red-300" : "text-green-300"}`}>
              {detectedCount > 0
                ? `${activePreset.short} detected in ${detectedCount} of ${results.length} slices`
                : `No ${activePreset.short.toLowerCase()} detected across all ${results.length} slices`}
            </p>
            <p className="text-xs text-[var(--muted)]">
              Avg. confidence {(results.reduce((s, r) => s + r.confidence, 0) / results.length * 100).toFixed(1)}% ·
              Avg. aspect score {(results.reduce((s, r) => s + r.aspect_score, 0) / results.length).toFixed(1)}/10
            </p>
          </div>
        </div>
      )}

      {/* Results grid */}
      {results.length > 0 && (
        <div className={`grid gap-4 ${results.length === 1 ? "md:grid-cols-1 max-w-lg" : "md:grid-cols-2"}`}>
          {results.map((r, i) => <SliceCard key={i} result={r} index={i} />)}
        </div>
      )}

      {results.length === 0 && files.length === 0 && (
        <div className="flex min-h-[200px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--border)] text-center">
          <p className="text-sm text-[var(--muted)]">Upload one or more CT slices to begin</p>
          <p className="text-xs text-[var(--muted)]/50">Each slice is analysed independently in parallel</p>
        </div>
      )}

      {results.length > 0 && (
        <button
          onClick={() => { setResults([]); setFiles([]); setPreviews([]); }}
          className="mt-5 rounded-lg border border-[var(--border)] px-3 py-2 text-xs text-[var(--muted)] transition hover:text-[var(--text)]"
        >
          Clear all & start over
        </button>
      )}

      <p className="mt-6 text-[11px] text-[var(--muted)]/50">
        Research prototype · not for clinical diagnosis or treatment.
      </p>
    </main>
  );
}
