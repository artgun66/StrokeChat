"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  value: string;
  onSave: (next: string) => Promise<void>;
};

const PLACEHOLDER =
  "How should the AI behave? e.g. \"You are a careful code reviewer. Always respond with the corrected code first, then up to three short bullet points.\"";

const PREVIEW_CHARS = 120;
const MAX_CHARS = 4000; // mirror backend Thread.SYSTEM_PROMPT_MAX_CHARS

/**
 * "Custom instructions" inline editor for a thread's system_prompt.
 *
 * UX choices for non-technical users:
 *   - Always visible, no nested settings or modals.
 *   - Empty state shows a friendly call-to-action.
 *   - Filled state collapses to a one-line preview with an "Edit" link.
 *   - Editing is a plain textarea; Save commits, Cancel reverts.
 *   - No auto-save on blur — explicit Save avoids surprises if a user clicks away mid-thought.
 */
export function CustomInstructions({ value, onSave }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing) textareaRef.current?.focus();
  }, [editing]);

  // Keep draft in sync if the parent prop changes (e.g. another tab edited the thread).
  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  async function save() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await onSave(draft.trim());
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "couldn't save");
    } finally {
      setBusy(false);
    }
  }

  function cancel() {
    setDraft(value);
    setEditing(false);
    setError(null);
  }

  // ---------- editing view ----------
  if (editing) {
    return (
      <section className="border-b border-[var(--border)] bg-[var(--panel)]/30 px-6 py-3">
        <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.2em] text-[var(--muted)]">
          Custom instructions
        </p>
        <textarea
          ref={textareaRef}
          value={draft}
          disabled={busy}
          maxLength={MAX_CHARS}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              cancel();
            } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              save();
            }
          }}
          placeholder={PLACEHOLDER}
          rows={4}
          className="w-full resize-y rounded-xl border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--muted)] focus:border-[var(--accent)] focus:outline-none"
        />
        <div className="mt-2 flex items-center justify-between gap-3">
          <p className="text-[11px] text-[var(--muted)]">
            Sent to the AI as a system message before every reply. ⌘/Ctrl+Enter
            saves, Esc cancels.
          </p>
          <div className="flex items-center gap-2">
            <span
              className={
                "text-[11px] tabular-nums " +
                (draft.length > MAX_CHARS - 200
                  ? "text-amber-600"
                  : "text-[var(--muted)]")
              }
            >
              {draft.length.toLocaleString()} / {MAX_CHARS.toLocaleString()}
            </span>
            <button
              type="button"
              onClick={cancel}
              disabled={busy}
              className="rounded-md border border-[var(--border)] px-3 py-1 text-xs text-[var(--muted)] hover:bg-slate-100 hover:text-[var(--text)] disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              disabled={busy || draft.length > MAX_CHARS}
              className="rounded-md bg-[var(--accent)] px-3 py-1 text-xs font-medium text-white hover:brightness-110 disabled:opacity-50"
            >
              {busy ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
        {error && <p className="mt-1 text-[11px] text-red-600">{error}</p>}
      </section>
    );
  }

  // ---------- empty / collapsed views ----------
  if (!value.trim()) {
    return (
      <section className="border-b border-[var(--border)] bg-[var(--panel)]/30 px-6 py-2.5">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-xs text-[var(--muted)] hover:text-[var(--text)]"
        >
          + Add custom instructions for the AI in this thread
        </button>
      </section>
    );
  }

  const preview =
    value.length > PREVIEW_CHARS ? value.slice(0, PREVIEW_CHARS).trim() + "…" : value;

  return (
    <section className="flex items-center justify-between gap-4 border-b border-[var(--border)] bg-[var(--panel)]/30 px-6 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-[var(--muted)]">
          Custom instructions
        </p>
        <p className="mt-0.5 truncate text-xs text-[var(--text)]">{preview}</p>
      </div>
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="shrink-0 text-xs text-[var(--muted)] underline-offset-4 hover:text-[var(--text)] hover:underline"
      >
        Edit
      </button>
    </section>
  );
}
