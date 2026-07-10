"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "../../../lib/api";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const PRESETS = [
  { label: "Hemorrhage", value: "bleeding", short: "Hemorrhage", color: "red" },
  { label: "Ischemic Stroke", value: "stroke", short: "Ischemic", color: "amber" },
];

// ASPECTS regions: 10 MCA territory zones, each subtracts 1 point when affected
const ASPECTS_REGIONS = [
  {
    id: "C",  label: "C",  full: "Caudate",
    group: "subcortical", tip: "Caudate head",
  },
  {
    id: "L",  label: "L",  full: "Lentiform",
    group: "subcortical", tip: "Lentiform nucleus (putamen + globus pallidus)",
  },
  {
    id: "IC", label: "IC", full: "Internal Capsule",
    group: "subcortical", tip: "Posterior limb of internal capsule",
  },
  {
    id: "I",  label: "I",  full: "Insular Ribbon",
    group: "subcortical", tip: "Insular cortex ribbon",
  },
  {
    id: "M1", label: "M1", full: "Ant. MCA cortex",
    group: "cortical", tip: "Anterior MCA cortex (ganglionic level)",
  },
  {
    id: "M2", label: "M2", full: "Lat. to insula",
    group: "cortical", tip: "MCA cortex lateral to insular ribbon",
  },
  {
    id: "M3", label: "M3", full: "Post. MCA cortex",
    group: "cortical", tip: "Posterior MCA cortex (ganglionic level)",
  },
  {
    id: "M4", label: "M4", full: "Sup. ant. MCA",
    group: "cortical", tip: "Anterior MCA cortex superior to M1",
  },
  {
    id: "M5", label: "M5", full: "Sup. lat. MCA",
    group: "cortical", tip: "Lateral MCA cortex superior to M2",
  },
  {
    id: "M6", label: "M6", full: "Sup. post. MCA",
    group: "cortical", tip: "Posterior MCA cortex superior to M3",
  },
] as const;

type RegionId = typeof ASPECTS_REGIONS[number]["id"];

function aspectsInterpretation(score: number) {
  if (score === 10) return { label: "Normal", color: "text-green-300", bg: "bg-green-500/10 border-green-500/30" };
  if (score >= 8)   return { label: "Minor ischemia — IV tPA favorable", color: "text-blue-300", bg: "bg-blue-500/10 border-blue-500/30" };
  if (score >= 7)   return { label: "Moderate — treat with caution", color: "text-amber-300", bg: "bg-amber-500/10 border-amber-500/30" };
  if (score >= 5)   return { label: "Extensive — high hemorrhagic risk", color: "text-orange-300", bg: "bg-orange-500/10 border-orange-500/30" };
  return { label: "Severe — very poor prognosis", color: "text-red-300", bg: "bg-red-500/10 border-red-500/30" };
}

function AspectsScorer({ confidence, maskAreaPct }: { confidence: number; maskAreaPct: number }) {
  const [affected, setAffected] = useState<Set<RegionId>>(new Set());

  const toggle = (id: RegionId) =>
    setAffected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const score = 10 - affected.size;
  const interp = aspectsInterpretation(score);

  const subcortical = ASPECTS_REGIONS.filter(r => r.group === "subcortical");
  const cortical    = ASPECTS_REGIONS.filter(r => r.group === "cortical");

  return (
    <div className="rounded-xl border border-[var(--border)]/60 bg-white/[0.02] p-4">

      {/* Score header */}
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">ASPECTS</p>
          <p className="mt-0.5 text-4xl font-bold tabular-nums text-[var(--text)]">
            {score}
            <span className="ml-1 text-base font-normal text-[var(--muted)]">/ 10</span>
          </p>
          <p className="mt-0.5 text-[11px] text-[var(--muted)]">
            Alberta Stroke Program Early CT Score
          </p>
        </div>
        {/* Arc */}
        <div className="relative h-14 w-14 shrink-0">
          <svg viewBox="0 0 56 56" className="h-14 w-14 -rotate-90">
            <circle cx="28" cy="28" r="22" fill="none" stroke="currentColor" strokeWidth="5" className="text-white/10" />
            <circle
              cx="28" cy="28" r="22" fill="none" stroke="currentColor" strokeWidth="5"
              strokeDasharray={`${(score / 10) * 138} 138`}
              strokeLinecap="round"
              className={score >= 8 ? "text-green-400" : score >= 7 ? "text-amber-400" : "text-red-400"}
              style={{ transition: "stroke-dasharray 0.3s ease" }}
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-[var(--text)]">{score}</span>
        </div>
      </div>

      {/* Interpretation badge */}
      <div className={`mb-4 rounded-lg border px-3 py-1.5 text-xs font-medium ${interp.bg} ${interp.color}`}>
        {interp.label}
      </div>

      {/* Formula explanation */}
      <p className="mb-3 text-[11px] text-[var(--muted)]/70">
        ASPECTS = 10 − affected regions · click each region below to mark as affected
      </p>

      {/* Subcortical regions */}
      <div className="mb-2">
        <p className="mb-1.5 text-[10px] uppercase tracking-widest text-[var(--muted)]/60">
          Subcortical (ganglionic level)
        </p>
        <div className="grid grid-cols-4 gap-1.5">
          {subcortical.map(r => (
            <button
              key={r.id}
              title={r.tip}
              onClick={() => toggle(r.id)}
              className={`group flex flex-col items-center rounded-lg border py-2 text-center transition ${
                affected.has(r.id)
                  ? "border-red-500/50 bg-red-500/15 text-red-300"
                  : "border-[var(--border)]/60 text-[var(--muted)] hover:border-[var(--border)] hover:bg-white/[0.04]"
              }`}
            >
              <span className="text-sm font-bold leading-none">{r.label}</span>
              <span className="mt-0.5 text-[9px] leading-tight opacity-60">{r.full}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Cortical regions */}
      <div>
        <p className="mb-1.5 text-[10px] uppercase tracking-widest text-[var(--muted)]/60">
          Cortical MCA territory
        </p>
        <div className="grid grid-cols-3 gap-1.5">
          {/* ganglionic level: M1 M2 M3 */}
          {cortical.slice(0, 3).map(r => (
            <button
              key={r.id}
              title={r.tip}
              onClick={() => toggle(r.id)}
              className={`group flex flex-col items-center rounded-lg border py-2 text-center transition ${
                affected.has(r.id)
                  ? "border-red-500/50 bg-red-500/15 text-red-300"
                  : "border-[var(--border)]/60 text-[var(--muted)] hover:border-[var(--border)] hover:bg-white/[0.04]"
              }`}
            >
              <span className="text-sm font-bold leading-none">{r.label}</span>
              <span className="mt-0.5 text-[9px] leading-tight opacity-60 px-1">{r.full}</span>
            </button>
          ))}
          {/* supraganglionic: M4 M5 M6 */}
          {cortical.slice(3).map(r => (
            <button
              key={r.id}
              title={r.tip}
              onClick={() => toggle(r.id)}
              className={`group flex flex-col items-center rounded-lg border py-2 text-center transition ${
                affected.has(r.id)
                  ? "border-red-500/50 bg-red-500/15 text-red-300"
                  : "border-[var(--border)]/60 text-[var(--muted)] hover:border-[var(--border)] hover:bg-white/[0.04]"
              }`}
            >
              <span className="text-sm font-bold leading-none">{r.label}</span>
              <span className="mt-0.5 text-[9px] leading-tight opacity-60 px-1">{r.full}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Affected list */}
      {affected.size > 0 && (
        <p className="mt-2 text-[11px] text-red-400">
          Affected: {Array.from(affected).join(", ")} (−{affected.size})
        </p>
      )}

      {/* AI metrics (informational) */}
      <div className="mt-3 border-t border-[var(--border)]/40 pt-3 flex gap-4">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-[var(--muted)]/60">AI confidence</p>
          <p className="mt-0.5 text-sm font-semibold tabular-nums text-[var(--text)]">{(confidence * 100).toFixed(1)}%</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-[var(--muted)]/60">Lesion area</p>
          <p className="mt-0.5 text-sm font-semibold tabular-nums text-[var(--text)]">{maskAreaPct.toFixed(2)}%</p>
        </div>
        {affected.size > 0 && (
          <button
            onClick={() => setAffected(new Set())}
            className="ml-auto self-end rounded px-2 py-1 text-[10px] text-[var(--muted)] hover:text-[var(--text)] border border-[var(--border)]/50 transition"
          >
            Reset
          </button>
        )}
      </div>
    </div>
  );
}

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
          <p className="mb-1 text-[10px] uppercase tracking-wider text-[var(--muted)]">AI Segmentation</p>
          <img src={`data:image/png;base64,${result.overlay_image}`} alt="Overlay" className="w-full rounded-lg border border-[var(--border)]/60" />
        </div>
      </div>

      {/* ASPECTS scorer */}
      <AspectsScorer confidence={result.confidence} maskAreaPct={result.mask_area_pct} />
    </div>
  );
}

export default function BiomedParsePage() {
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<(string | null)[]>([]);
  const [prompt, setPrompt] = useState("bleeding");
  const [results, setResults] = useState<SliceResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [navigating, setNavigating] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback((incoming: FileList | File[]) => {
    const arr = Array.from(incoming);
    setResults([]); setError(null);
    setFiles(prev => {
      const merged = [...prev, ...arr].slice(0, 12);
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

  const handleExploreInChat = async () => {
    if (!results.length || navigating) return;
    setNavigating(true);
    try {
      const label = activePreset.label;
      const lines = results
        .filter(r => !r.error)
        .map((r, i) =>
          `• Slice ${i + 1} (${r.filename}): ${r.detected ? `⚠ ${activePreset.short} DETECTED` : "✓ Clear"} — confidence ${(r.confidence * 100).toFixed(1)}%, lesion area ${r.mask_area_pct.toFixed(2)}%`
        );
      const message =
        `CT Scan Analysis — ${label} Detection\n\n` +
        `I ran BiomedParse AI segmentation on ${results.filter(r => !r.error).length} CT brain scan slice(s). Findings:\n\n` +
        lines.join("\n") +
        `\n\nThe original CT scan images are attached. Please provide clinical interpretation of these findings.`;

      const images = results
        .filter(r => !r.error && r.original_image)
        .slice(0, 4)
        .map((r, i) => ({
          name: r.filename || `slice-${i + 1}.png`,
          dataUrl: `data:image/png;base64,${r.original_image}`,
        }));

      sessionStorage.setItem("strokechat_biomedparse_prefill", JSON.stringify({ message, images }));
      const thread = await api.threads.create({ title: `CT Analysis — ${label}` });
      router.push(`/threads/view?id=${thread.id}`);
    } catch {
      setNavigating(false);
    }
  };

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 md:px-8 md:py-8">

      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[var(--text)]">CT Scan Analysis</h1>
          <p className="mt-0.5 text-sm text-[var(--muted)]">
            BiomedParse segmentation · interactive ASPECTS scoring · up to 12 slices
          </p>
        </div>
        <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-widest text-amber-300">
          Research only
        </span>
      </div>

      {/* Controls row */}
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end">
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

      {/* Summary banner */}
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
              Avg. AI confidence {(results.reduce((s, r) => s + r.confidence, 0) / results.length * 100).toFixed(1)}% ·
              Mark affected regions per slice to calculate ASPECTS
            </p>
          </div>
        </div>
      )}

      {/* Explore in chat CTA */}
      {results.length > 0 && (
        <div className="mb-5 flex items-center justify-between gap-4 rounded-xl border border-[var(--accent)]/30 bg-[var(--accent)]/5 px-4 py-3">
          <div>
            <p className="text-sm font-medium text-[var(--text)]">Explore further with our AI chat models</p>
            <p className="text-xs text-[var(--muted)]">Send these results and CT images directly to MedGemma for clinical interpretation</p>
          </div>
          <button
            onClick={handleExploreInChat}
            disabled={navigating}
            className="flex shrink-0 items-center gap-2 rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {navigating ? (
              <><span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" /> Opening…</>
            ) : (
              <>Chat<svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg></>
            )}
          </button>
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
          <p className="text-xs text-[var(--muted)]/50">AI segments the lesion · you mark the affected ASPECTS regions</p>
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
        StrokeChat · research prototype · not for clinical diagnosis or treatment.
      </p>
    </main>
  );
}
