"use client";

import type { ThreadMessage } from "@local-llm/api-client";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { AvailableModel } from "../app/(app)/threads/[id]/ThreadView";
import { api, apiBaseUrl } from "../lib/api";
import { CustomInstructions } from "./CustomInstructions";
import { MessageInput, type ImageAttachment, type MessageInputHandle } from "./MessageInput";

type BiomedResult = {
  target: "bleeding" | "stroke";
  detected: boolean;
  confidence: number;
  overlay_image: string;
  original_image: string;
};

type DisplayMessage = {
  role: "user" | "assistant" | "system";
  content: string;
  reasoning?: string;
  pending?: boolean;
  biomedResults?: BiomedResult[];
  biomedPending?: boolean;
};

type Props = {
  threadId: string;
  initialMessages: ThreadMessage[];
  modelSlug: string;
  availableModels: AvailableModel[];
  onModelChange: (slug: string) => void;
  systemPrompt: string;
  onSystemPromptSave: (next: string) => Promise<void>;
  onMessageComplete?: () => void;
};

type ApiMessage =
  | { role: string; content: string }
  | {
      role: string;
      content: Array<
        | { type: "text"; text: string }
        | { type: "image_url"; image_url: { url: string } }
      >;
    };

function dataUrlToBlob(dataUrl: string): Blob {
  const [header, b64] = dataUrl.split(",");
  const mime = header.match(/:(.*?);/)?.[1] ?? "image/png";
  const bytes = atob(b64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

function detectTarget(text: string): "bleeding" | "stroke" {
  const lc = text.toLowerCase();
  if (lc.includes("stroke") || lc.includes("ischemic")) return "stroke";
  return "bleeding";
}

async function runBiomedParse(img: ImageAttachment, target: "bleeding" | "stroke"): Promise<BiomedResult | null> {
  try {
    const fd = new FormData();
    fd.append("image", dataUrlToBlob(img.dataUrl), img.name);
    fd.append("prompt", target);
    const resp = await fetch(`${apiBaseUrl}/api/biomedparse/segment/`, { method: "POST", body: fd });
    if (!resp.ok) return null;
    const data = await resp.json();
    return { target, ...data };
  } catch {
    return null;
  }
}

export function ChatPane({
  threadId,
  initialMessages,
  modelSlug,
  availableModels,
  onModelChange,
  systemPrompt,
  onSystemPromptSave,
  onMessageComplete,
}: Props) {
  const [messages, setMessages] = useState<DisplayMessage[]>(
    initialMessages.map((m) => ({
      role: m.role === "tool" ? "system" : m.role,
      content: m.content,
    })),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<MessageInputHandle>(null);
  const dragDepth = useRef(0);
  const modelSelectId = useId();
  const currentModelId = `${modelSelectId}-current`;
  const controlRing =
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--ring-offset)]";

  const currentModelHasVision = useMemo(
    () => availableModels.find((m) => m.slug === modelSlug)?.visionEnabled ?? false,
    [availableModels, modelSlug],
  );

  const didInitialScroll = useRef(false);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({
      behavior: didInitialScroll.current ? "smooth" : "auto",
      block: "end",
    });
    didInitialScroll.current = true;
  }, [messages]);

  async function send(text: string, images: ImageAttachment[]) {
    if ((!text.trim() && images.length === 0) || busy || !modelSlug) return;
    setError(null);

    const visibleText = text.trim() || "(CT scan submitted for analysis)";
    const userMsg: DisplayMessage = {
      role: "user",
      content: visibleText,
      biomedPending: images.length > 0,
    };

    setMessages((prev) => [
      ...prev,
      userMsg,
      { role: "assistant", content: "", pending: true },
    ]);
    setBusy(true);

    // ── 1. Run BiomedParse on every image ──────────────────────────────────
    let biomedResults: BiomedResult[] = [];
    if (images.length > 0) {
      const target = detectTarget(text);
      const settled = await Promise.all(images.map((img) => runBiomedParse(img, target)));
      biomedResults = settled.filter((r): r is BiomedResult => r !== null);

      setMessages((prev) => {
        const copy = [...prev];
        const userIdx = copy.length - 2;
        if (userIdx >= 0) {
          copy[userIdx] = { ...copy[userIdx], biomedResults, biomedPending: false };
        }
        return copy;
      });
    }

    // ── 2. Build LLM context ────────────────────────────────────────────────
    const biomedContext = biomedResults.length > 0
      ? biomedResults.map((r) => {
          const targetLabel = r.target === "bleeding" ? "intracranial hemorrhage" : "ischemic stroke";
          const verdict = r.detected ? "DETECTED" : "NOT DETECTED";
          return `[BiomedParse CT Scan Analysis]\nDetection target: ${targetLabel}\nResult: ${verdict}\nModel confidence: ${(r.confidence * 100).toFixed(1)}%`;
        }).join("\n\n") + "\n\n"
      : "";

    const userContent = biomedContext + (text.trim() || "Based on this CT scan analysis, what can you tell me about the findings? Explain what this means clinically.");

    // ── 3. Build OpenAI-format history for the LLM ─────────────────────────
    // For any prior user message that had BiomedParse results, reconstruct the
    // full context so the LLM keeps the scan findings across follow-up turns.
    const apiMessages: ApiMessage[] = messages
      .filter((m) => !m.pending)
      .map((m) => {
        if (m.role !== "user" || !m.biomedResults?.length) {
          return { role: m.role, content: m.content };
        }
        const ctx = m.biomedResults.map((r) => {
          const label = r.target === "bleeding" ? "intracranial hemorrhage" : "ischemic stroke";
          return `[BiomedParse CT Scan Analysis]\nTarget: ${label}\nResult: ${r.detected ? "DETECTED" : "NOT DETECTED"}\nConfidence: ${(r.confidence * 100).toFixed(1)}%`;
        }).join("\n\n");
        const userText = m.content === "(CT scan submitted for analysis)" ? "Analyse these findings." : m.content;
        return { role: m.role, content: ctx + "\n\n" + userText };
      });
    apiMessages.push({ role: "user", content: userContent });

    // ── 4. Stream LLM response ─────────────────────────────────────────────
    let contentAssembled = "";
    let reasoningAssembled = "";
    try {
      for await (const chunk of api.streamChat({
        model: modelSlug,
        messages: apiMessages,
        thread_id: threadId,
      })) {
        if ("error" in chunk) { setError(chunk.error); break; }
        const delta = chunk.choices?.[0]?.delta;
        const dContent = delta?.content ?? "";
        const dReasoning = delta?.reasoning_content ?? "";
        if (!dContent && !dReasoning) continue;
        if (dContent) contentAssembled += dContent;
        if (dReasoning) reasoningAssembled += dReasoning;
        setMessages((prev) => {
          const copy = prev.slice();
          const last = copy[copy.length - 1];
          if (last?.pending) {
            copy[copy.length - 1] = {
              ...last,
              content: contentAssembled,
              reasoning: reasoningAssembled || undefined,
            };
          }
          return copy;
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "stream failed");
    } finally {
      setMessages((prev) => {
        const copy = prev.slice();
        const last = copy[copy.length - 1];
        if (last?.pending) copy[copy.length - 1] = { ...last, pending: false };
        return copy;
      });
      setBusy(false);
      onMessageComplete?.();
    }
  }

  // ── drag-and-drop ──────────────────────────────────────────────────────────
  function onDragEnter(e: React.DragEvent) {
    if (!Array.from(e.dataTransfer.types).includes("Files")) return;
    e.preventDefault(); dragDepth.current += 1; setDragActive(true);
  }
  function onDragLeave(e: React.DragEvent) {
    if (!Array.from(e.dataTransfer.types).includes("Files")) return;
    e.preventDefault();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragActive(false);
  }
  function onDragOver(e: React.DragEvent) {
    if (!Array.from(e.dataTransfer.types).includes("Files")) return;
    e.preventDefault(); e.dataTransfer.dropEffect = "copy";
  }
  function onDrop(e: React.DragEvent) {
    e.preventDefault(); dragDepth.current = 0; setDragActive(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) inputRef.current?.addFiles(files);
  }

  return (
    <div
      className="relative flex h-full flex-col"
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {dragActive && (
        <div
          className="pointer-events-none absolute inset-2 z-30 flex items-center justify-center rounded-2xl border-2 border-dashed border-[var(--accent)] bg-[var(--accent-soft)]/40 backdrop-blur-sm"
          aria-hidden
        >
          <div className="rounded-xl border border-[var(--border)] bg-[var(--panel)] px-4 py-3 text-sm text-white shadow-lg">
            Drop to attach
          </div>
        </div>
      )}

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="flex flex-col gap-3 border-b border-[var(--border)] bg-[var(--panel)]/40 px-6 py-3 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <p id={currentModelId} className="text-sm text-white">
            <span className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">Model: </span>
            <span className="font-medium">{modelSlug || "No local model selected"}</span>
            {currentModelHasVision && (
              <span className="ml-2 inline-flex items-center rounded bg-[var(--accent-soft)] px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-white" title="This model accepts images">
                vision
              </span>
            )}
          </p>
          <p className="mt-0.5 text-[11px] text-[var(--muted)]">
            CT images are analysed by BiomedParse — drop one to get started
          </p>
        </div>
        <div className="flex w-full flex-col gap-1 sm:w-auto sm:shrink-0 sm:items-end">
          <label htmlFor={modelSelectId} className="text-xs text-[var(--muted)]">Switch model</label>
          <select
            id={modelSelectId}
            aria-describedby={currentModelId}
            className={"w-full min-w-0 rounded-lg border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-sm text-[var(--text)] transition " + controlRing}
            value={modelSlug}
            onChange={(e) => onModelChange(e.target.value)}
          >
            {availableModels.length === 0 && <option value="">No local models — visit Hub</option>}
            {availableModels.map((m) => (
              <option key={m.slug} value={m.slug}>{m.slug}{m.visionEnabled ? " 👁" : ""}</option>
            ))}
          </select>
        </div>
      </header>

      <CustomInstructions value={systemPrompt} onSave={onSystemPromptSave} />

      {/* ── Messages ───────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        {messages.length === 0 ? (
          <div className="mx-auto mt-12 max-w-md rounded-2xl border border-[var(--border)]/90 bg-gradient-to-b from-[var(--panel-elevated)]/80 to-[var(--panel)]/90 p-8 text-center shadow-lg shadow-black/20">
            <p className="text-sm font-medium text-[var(--text)]">Stroke Assistant</p>
            <p className="mt-2 text-balance text-sm leading-relaxed text-[var(--muted)]">
              Ask anything about stroke, or drop a CT brain scan image to get an
              AI-powered analysis with segmentation overlay. Follow-up questions
              are answered in context.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {["What are the signs of hemorrhagic stroke?", "Drop a CT scan image"].map((hint) => (
                <span key={hint} className="rounded-full border border-[var(--border)]/60 px-3 py-1 text-xs text-[var(--muted)]">
                  {hint}
                </span>
              ))}
            </div>
          </div>
        ) : (
          <ul className="mx-auto max-w-3xl space-y-4">
            {messages.map((m, i) => (
              <li key={i} className={"flex " + (m.role === "user" ? "justify-end" : "justify-start")}>
                <div className={
                  "max-w-[85%] rounded-2xl border px-4 py-3 text-sm " +
                  (m.role === "user"
                    ? "border-[var(--accent)]/40 bg-[var(--accent-soft)] text-white"
                    : m.role === "assistant"
                      ? "border-[var(--border)] bg-[var(--panel-elevated)] text-white"
                      : "border-[var(--border)] bg-black/20 text-[var(--muted)]")
                }>
                  <p className="mb-1 text-[10px] uppercase tracking-[0.18em] text-[var(--muted)]">{m.role}</p>

                  {/* BiomedParse loading state */}
                  {m.biomedPending && (
                    <div className="mb-3 flex items-center gap-2 rounded-lg border border-[var(--border)] bg-black/20 px-3 py-2">
                      <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/20 border-t-white/80" />
                      <span className="text-xs text-[var(--muted)]">Analysing CT scan with BiomedParse…</span>
                    </div>
                  )}

                  {/* BiomedParse results */}
                  {m.biomedResults && m.biomedResults.length > 0 && (
                    <div className="mb-3 space-y-3">
                      {m.biomedResults.map((r, ri) => (
                        <div key={ri} className={`rounded-xl border p-3 ${r.detected ? "border-red-500/30 bg-red-500/10" : "border-green-500/30 bg-green-500/10"}`}>
                          {/* Verdict row */}
                          <div className="flex items-center gap-2 mb-2">
                            <span className={`h-2.5 w-2.5 shrink-0 rounded-full shadow-sm ${r.detected ? "bg-red-400 shadow-red-400/50" : "bg-green-400 shadow-green-400/50"}`} />
                            <p className={`text-sm font-semibold ${r.detected ? "text-red-300" : "text-green-300"}`}>
                              {r.detected
                                ? `${r.target === "bleeding" ? "Hemorrhage" : "Ischemic stroke"} detected`
                                : `No ${r.target === "bleeding" ? "hemorrhage" : "ischemic stroke"} detected`}
                            </p>
                            <span className={`ml-auto text-xs font-medium ${r.detected ? "text-red-300" : "text-green-300"}`}>
                              {(r.confidence * 100).toFixed(1)}%
                            </span>
                          </div>
                          {/* Confidence bar */}
                          <div className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                            <div
                              className={`h-full rounded-full ${r.detected ? "bg-red-400" : "bg-green-400"}`}
                              style={{ width: `${(r.confidence * 100).toFixed(0)}%` }}
                            />
                          </div>
                          {/* Images */}
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <p className="mb-1 text-[9px] uppercase tracking-wider text-[var(--muted)]">Original</p>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={`data:image/png;base64,${r.original_image}`} alt="Original CT" className="w-full rounded-lg" />
                            </div>
                            <div>
                              <p className="mb-1 text-[9px] uppercase tracking-wider text-[var(--muted)]">Segmentation</p>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={`data:image/png;base64,${r.overlay_image}`} alt="Segmentation overlay" className="w-full rounded-lg" />
                            </div>
                          </div>
                          <p className="mt-2 text-[10px] italic text-[var(--muted)]/70">
                            BiomedParse fine-tuned model · not for clinical use
                          </p>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Message text */}
                  {m.reasoning && !m.content && (
                    <p className="whitespace-pre-wrap text-xs italic leading-6 text-[var(--muted)]">💭 {m.reasoning}</p>
                  )}
                  {m.content && <p className="whitespace-pre-wrap leading-6">{m.content}</p>}
                  {!m.content && !m.reasoning && m.pending && <p className="leading-6">…</p>}
                </div>
              </li>
            ))}
          </ul>
        )}
        {error && <p className="mt-4 text-xs text-[var(--error)]" role="alert">{error}</p>}
        <div ref={bottomRef} />
      </div>

      <MessageInput
        ref={inputRef}
        disabled={busy || !modelSlug}
        hasModel={!!modelSlug}
        allowImages={true}
        onSend={send}
      />
    </div>
  );
}
