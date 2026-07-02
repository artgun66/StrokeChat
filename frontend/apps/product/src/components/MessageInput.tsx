"use client";

import { Button } from "@local-llm/ui";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { extractPdfText } from "../lib/extract-pdf-text";

/** A text-or-pdf attachment. Its content is the extracted plaintext that gets
 *  prepended to the user's message as a fenced code block. */
type TextAttachment = { kind: "text"; name: string; content: string; size: number };

/** An image attachment. Sent to the model in OpenAI vision format
 *  (`{"type":"image_url","image_url":{"url":"data:image/...;base64,..."}}`). */
export type ImageAttachment = {
  kind: "image";
  name: string;
  dataUrl: string; // base64 data URL the model consumes directly
  size: number;
};

/** A NIfTI scan attachment (.nii / .nii.gz). Routed to the vessel segmentation
 *  service instead of the vision model. The raw File is kept so it can be POSTed
 *  as multipart/form-data. */
export type NiftiAttachment = {
  kind: "nifti";
  name: string;
  file: File;
  size: number;
};

type Attachment = TextAttachment | ImageAttachment | NiftiAttachment;

type Props = {
  disabled: boolean;
  hasModel: boolean;
  /** Whether the currently-selected model accepts images. Drives the image-drop
   *  behavior — when false, dropping an image surfaces a "switch to a vision
   *  model" hint instead of attaching. */
  allowImages: boolean;
  onSend: (text: string, images: ImageAttachment[], niftis: NiftiAttachment[]) => void;
};

export type MessageInputHandle = {
  /** Append externally-supplied files (e.g. via drag-and-drop) to the chip list. */
  addFiles: (files: File[]) => void;
};

const MAX_TEXT_BYTES = 200_000;   // 200 KB — text / code / data
const MAX_PDF_BYTES = 5_000_000;  // 5 MB — source PDF
const MAX_IMAGE_BYTES = 8_000_000; // 8 MB — raw image; bigger should be resized client-side
const MAX_ATTACHMENTS = 5;

const ACCEPT =
  "text/*,application/pdf,image/*," +
  ".pdf,.txt,.md,.csv,.json,.yaml,.yml,.toml,.xml,.log,.html,.css,.scss," +
  ".js,.jsx,.ts,.tsx,.py,.go,.rs,.rb,.java,.c,.cpp,.h,.hpp,.cs,.kt,.swift," +
  ".sh,.bash,.zsh,.sql,.env,.ini,.conf,.dockerfile,.makefile," +
  ".png,.jpg,.jpeg,.webp,.gif," +
  ".nii,.nii.gz";

function formatBytes(n: number): string {
  if (n < 1000) return `${n} B`;
  if (n < 1_000_000) return `${Math.round(n / 1000)} KB`;
  return `${(n / 1_000_000).toFixed(1)} MB`;
}

type FileCategory =
  | "text"
  | "pdf"
  | "image"
  | "nifti"
  | "office"
  | "archive"
  | "media"
  | "binary"
  | "unknown";

const TEXT_EXTS = new Set([
  "txt", "md", "csv", "json", "yaml", "yml", "toml", "xml", "log",
  "html", "css", "scss", "js", "jsx", "ts", "tsx", "py", "go", "rs",
  "rb", "java", "c", "cpp", "h", "hpp", "cs", "kt", "swift",
  "sh", "bash", "zsh", "sql", "env", "ini", "conf",
]);
const OFFICE_EXTS = /^(docx?|xlsx?|pptx?|odt|ods|odp|pages|numbers|key)$/i;
const ARCHIVE_EXTS = /^(zip|tar|gz|tgz|rar|7z|bz2|xz|jar|war)$/i;
const BINARY_EXTS = /^(exe|dll|so|dylib|bin|app|deb|rpm|dmg|pkg|msi|class|o|a|wasm)$/i;

function categorize(f: File): FileCategory {
  const lower = f.name.toLowerCase();
  const ext = lower.includes(".") ? lower.slice(lower.lastIndexOf(".") + 1) : "";
  const mime = (f.type || "").toLowerCase();

  if (lower.endsWith(".nii.gz") || ext === "nii") return "nifti";
  if (mime === "application/pdf" || ext === "pdf") return "pdf";
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("audio/") || mime.startsWith("video/")) return "media";
  if (OFFICE_EXTS.test(ext)) return "office";
  if (ARCHIVE_EXTS.test(ext)) return "archive";
  if (BINARY_EXTS.test(ext)) return "binary";
  if (mime.startsWith("text/") || TEXT_EXTS.has(ext)) return "text";
  return "unknown";
}

function unsupportedMessage(name: string, cat: FileCategory): string | null {
  switch (cat) {
    case "office":
      return `${name} is an Office document — export to PDF first, or save as .txt.`;
    case "archive":
      return `${name} is an archive — extract it first and drop the files inside.`;
    case "media":
      return `${name} is a media file — not supported.`;
    case "binary":
      return `${name} looks like a binary — not supported.`;
    default:
      // image is handled separately because its support depends on the
      // currently-selected model's `vision_enabled`.
      return null;
  }
}

function readImageAsDataUrl(f: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error ?? new Error("FileReader error"));
    r.readAsDataURL(f);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image decode failed"));
    img.src = src;
  });
}

/** Downscale an image to a max edge length and re-encode. Vision models work
 *  great at 1024–1280 px and we save 5–10× on bytes shipped over the wire,
 *  the request body in Django, and the base64 explosion the model has to parse. */
const MAX_IMAGE_EDGE = 1280;
const JPEG_QUALITY = 0.85;

async function downscaleImage(
  file: File,
): Promise<{ dataUrl: string; size: number; mediaType: string }> {
  const original = await readImageAsDataUrl(file);
  const img = await loadImage(original);
  const longest = Math.max(img.width, img.height);

  // Already small enough — skip the canvas round-trip to avoid quality loss.
  if (longest <= MAX_IMAGE_EDGE) {
    return { dataUrl: original, size: file.size, mediaType: file.type || "image/png" };
  }

  const scale = MAX_IMAGE_EDGE / longest;
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 2d context unavailable");
  ctx.drawImage(img, 0, 0, w, h);

  // PNG/GIF preserve alpha; JPEG is much smaller for photos/screenshots.
  const keepAlpha = file.type === "image/png" || file.type === "image/gif";
  const outType = keepAlpha ? "image/png" : "image/jpeg";
  const dataUrl = canvas.toDataURL(outType, JPEG_QUALITY);
  // Size = decoded length of the base64 payload after the "," separator.
  const b64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const size = Math.floor((b64.length * 3) / 4);

  return { dataUrl, size, mediaType: outType };
}

/** SpeechRecognition (and webkit variant) minimal structural type. */
type SR = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult:
    | ((e: {
        resultIndex: number;
        results: ArrayLike<
          ArrayLike<{ transcript: string; confidence: number }> & {
            isFinal: boolean;
          }
        >;
      }) => void)
    | null;
  onerror: ((e: unknown) => void) | null;
  onend: (() => void) | null;
};

function getSpeechRecognitionCtor(): (new () => SR) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, unknown>;
  return ((w.SpeechRecognition ?? w.webkitSpeechRecognition) as new () => SR) ?? null;
}

export const MessageInput = forwardRef<MessageInputHandle, Props>(function MessageInput(
  { disabled, hasModel, allowImages, onSend },
  ref,
) {
  const [draft, setDraft] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [pendingPdfs, setPendingPdfs] = useState(0);
  const [recording, setRecording] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<SR | null>(null);

  useEffect(() => {
    setVoiceSupported(getSpeechRecognitionCtor() !== null);
    return () => {
      recognitionRef.current?.stop();
    };
  }, []);

  // -------- attachments --------

  /** Core add-files logic, used by both the paperclip picker and drag-and-drop. */
  async function addFiles(files: File[]) {
    if (files.length === 0) return;
    setAttachError(null);

    const accepted: Attachment[] = [];
    let pdfWork = 0;
    let lastError: string | null = null;

    for (const f of files) {
      if (attachments.length + accepted.length >= MAX_ATTACHMENTS) {
        lastError = `Up to ${MAX_ATTACHMENTS} files at a time.`;
        break;
      }

      const cat = categorize(f);

      // NIfTI scan: always accepted, routed to vessel segmentation.
      if (cat === "nifti") {
        accepted.push({ kind: "nifti", name: f.name, file: f, size: f.size });
        continue;
      }

      // Image: only accept if the currently-selected model supports vision.
      if (cat === "image") {
        if (!allowImages) {
          lastError = `${f.name} is an image — image analysis is not available right now.`;
          continue;
        }
        if (f.size > MAX_IMAGE_BYTES) {
          lastError = `${f.name} is ${formatBytes(f.size)}; max image size is ${formatBytes(MAX_IMAGE_BYTES)}.`;
          continue;
        }
        try {
          const { dataUrl, size } = await downscaleImage(f);
          accepted.push({ kind: "image", name: f.name, dataUrl, size });
        } catch {
          lastError = `Couldn't read ${f.name}.`;
        }
        continue;
      }

      const unsupported = unsupportedMessage(f.name, cat);
      if (unsupported) {
        lastError = unsupported;
        continue;
      }

      if (cat === "pdf") {
        if (f.size > MAX_PDF_BYTES) {
          lastError = `${f.name} is ${formatBytes(f.size)}; max PDF size is ${formatBytes(MAX_PDF_BYTES)}.`;
          continue;
        }
        pdfWork++;
        (async () => {
          try {
            const text = await extractPdfText(f);
            setAttachments((prev) => [
              ...prev,
              { kind: "text", name: f.name, content: text, size: f.size },
            ]);
          } catch (e) {
            setAttachError(
              `Couldn't read ${f.name} as PDF: ${e instanceof Error ? e.message : "unknown error"}.`,
            );
          } finally {
            setPendingPdfs((n) => Math.max(0, n - 1));
          }
        })();
        continue;
      }

      // text or unknown — try to read as text. For "unknown" the user might
      // know what they're doing (a config file with a weird extension); we
      // accept it and they'll see if the contents look right.
      if (f.size > MAX_TEXT_BYTES) {
        lastError = `${f.name} is ${formatBytes(f.size)}; max ${formatBytes(MAX_TEXT_BYTES)} per text file.`;
        continue;
      }
      try {
        const content = await f.text();
        accepted.push({ kind: "text", name: f.name, content, size: f.size });
      } catch {
        lastError = `Couldn't read ${f.name} as text.`;
      }
    }

    if (accepted.length > 0) {
      setAttachments((prev) => [...prev, ...accepted]);
    }
    if (pdfWork > 0) {
      setPendingPdfs((n) => n + pdfWork);
    }
    if (lastError) setAttachError(lastError);
  }

  useImperativeHandle(ref, () => ({ addFiles }), [attachments.length]);

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = "";
    addFiles(picked);
  }

  function removeAttachment(idx: number) {
    setAttachments((prev) => prev.filter((_, i) => i !== idx));
  }

  // -------- voice --------

  function toggleVoice() {
    if (recording) {
      recognitionRef.current?.stop();
      return;
    }
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) return;

    const r = new Ctor();
    r.continuous = false;
    r.interimResults = false;
    r.lang = navigator.language || "en-US";

    r.onresult = (e) => {
      let finalText = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i];
        if (result.isFinal) {
          finalText += result[0]?.transcript ?? "";
        }
      }
      if (finalText) {
        setDraft((prev) => {
          const sep = prev && !prev.endsWith(" ") && !prev.endsWith("\n") ? " " : "";
          return prev + sep + finalText.trim();
        });
      }
    };
    r.onerror = () => setRecording(false);
    r.onend = () => setRecording(false);

    recognitionRef.current = r;
    try {
      r.start();
      setRecording(true);
    } catch {
      setRecording(false);
    }
  }

  // -------- send --------

  function handleSend() {
    const text = draft.trim();
    if (!text && attachments.length === 0) return;
    if (disabled) return;
    if (pendingPdfs > 0) return; // wait for PDF extraction

    let finalText = text;
    const textAttachments = attachments.filter((a): a is TextAttachment => a.kind === "text");
    const imageAttachments = attachments.filter((a): a is ImageAttachment => a.kind === "image");
    const niftiAttachments = attachments.filter((a): a is NiftiAttachment => a.kind === "nifti");

    if (textAttachments.length > 0) {
      const blocks = textAttachments
        .map(
          (a) =>
            `### ${a.name}\n\`\`\`\n${a.content.replace(/```/g, "\\`\\`\\`")}\n\`\`\``,
        )
        .join("\n\n");
      finalText = blocks + (text ? `\n\n${text}` : "");
    }

    onSend(finalText, imageAttachments, niftiAttachments);
    setDraft("");
    setAttachments([]);
    setAttachError(null);
  }

  const canSend =
    !disabled &&
    pendingPdfs === 0 &&
    (draft.trim().length > 0 || attachments.length > 0);

  return (
    <footer className="border-t border-[var(--border)] bg-[var(--panel)]/50 p-4">
      <div className="mx-auto max-w-3xl">
        {(attachments.length > 0 || pendingPdfs > 0 || attachError) && (
          <div className="mb-2 flex flex-wrap items-center gap-2">
            {attachments.map((a, i) =>
              a.kind === "image" ? (
                <span
                  key={`${a.name}-${i}`}
                  className="inline-flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--panel)] py-1 pl-1 pr-2 text-xs text-white/90"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={a.dataUrl}
                    alt=""
                    className="h-8 w-8 shrink-0 rounded object-cover"
                  />
                  <span className="max-w-[140px] truncate">{a.name}</span>
                  <span className="text-[var(--muted)]">{formatBytes(a.size)}</span>
                  <button
                    type="button"
                    onClick={() => removeAttachment(i)}
                    className="-mr-0.5 rounded p-0.5 text-[var(--muted)] hover:bg-white/10 hover:text-white"
                    aria-label={`Remove image ${a.name}`}
                  >
                    ×
                  </button>
                </span>
              ) : a.kind === "nifti" ? (
                <span
                  key={`${a.name}-${i}`}
                  className="inline-flex items-center gap-1.5 rounded-md border border-cyan-500/40 bg-cyan-500/10 px-2 py-1 text-xs text-cyan-300"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2z"/><path d="M12 8v4l3 3"/>
                  </svg>
                  <span className="max-w-[140px] truncate">{a.name}</span>
                  <span className="text-cyan-500/60">{formatBytes(a.size)}</span>
                  <span className="rounded bg-cyan-500/20 px-1 text-[9px] uppercase tracking-wide">CTA</span>
                  <button
                    type="button"
                    onClick={() => removeAttachment(i)}
                    className="-mr-0.5 rounded p-0.5 text-cyan-500/60 hover:bg-white/10 hover:text-white"
                    aria-label={`Remove scan ${a.name}`}
                  >
                    ×
                  </button>
                </span>
              ) : (
                <span
                  key={`${a.name}-${i}`}
                  className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--panel)] px-2 py-1 text-xs text-white/90"
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                  <span className="max-w-[180px] truncate">{a.name}</span>
                  <span className="text-[var(--muted)]">{formatBytes(a.size)}</span>
                  <button
                    type="button"
                    onClick={() => removeAttachment(i)}
                    className="-mr-0.5 rounded p-0.5 text-[var(--muted)] hover:bg-white/10 hover:text-white"
                    aria-label={`Remove attachment ${a.name}`}
                  >
                    ×
                  </button>
                </span>
              ),
            )}
            {pendingPdfs > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--panel)] px-2 py-1 text-xs text-[var(--muted)]">
                <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--accent)]" />
                Extracting {pendingPdfs} PDF{pendingPdfs === 1 ? "" : "s"}…
              </span>
            )}
            {attachError && (
              <span className="text-xs text-amber-400">{attachError}</span>
            )}
          </div>
        )}

        <div className="flex items-end gap-2">
          {/* Attach */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled}
            aria-label="Attach a file"
            title="Attach a file (text, code, data, or PDF)"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--panel)] text-[var(--muted)] transition hover:bg-white/5 hover:text-white disabled:opacity-40"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 17.93 8.83l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
            </svg>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPT}
            multiple
            onChange={handleFileSelect}
            className="hidden"
          />

          <textarea
            className="min-h-12 flex-1 resize-none rounded-xl border border-[var(--border)] bg-[var(--panel)] px-4 py-3 text-sm text-white transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--ring-offset)]"
            aria-label="Message"
            placeholder={
              hasModel
                ? "Ask anything, drop a CT image (BiomedParse) or a .nii.gz CTA scan (vessel segmentation)…"
                : "Download a model first"
            }
            value={draft}
            disabled={disabled}
            rows={2}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
          />

          {/* Voice — hidden if browser has no SpeechRecognition */}
          {voiceSupported && (
            <button
              type="button"
              onClick={toggleVoice}
              disabled={disabled}
              aria-label={recording ? "Stop recording" : "Start voice input"}
              aria-pressed={recording}
              title={recording ? "Stop recording" : "Speak instead of typing"}
              className={
                "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition disabled:opacity-40 " +
                (recording
                  ? "border-red-500/50 bg-red-500/15 text-red-300 animate-pulse"
                  : "border-[var(--border)] bg-[var(--panel)] text-[var(--muted)] hover:bg-white/5 hover:text-white")
              }
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <rect width="6" height="13" x="9" y="2" rx="3" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" x2="12" y1="19" y2="22" />
              </svg>
            </button>
          )}

          <Button
            onClick={handleSend}
            disabled={!canSend}
            className="h-11 shrink-0 rounded-xl bg-[var(--accent)] px-5 hover:brightness-110"
          >
            {disabled
              ? "Thinking..."
              : pendingPdfs > 0
                ? "Reading PDF…"
                : "Send"}
          </Button>
        </div>
      </div>
    </footer>
  );
});
