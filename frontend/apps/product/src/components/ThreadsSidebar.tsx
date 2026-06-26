"use client";

import type { Thread } from "@local-llm/api-client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "../lib/api";

type Props = {
  threads: Thread[];
  activeId?: string;
};

export function ThreadsSidebar({ threads, activeId }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function newThread() {
    setBusy(true);
    try {
      const t = await api.threads.create({ title: "New thread" });
      window.location.href = `/threads/${t.id}`;
    } finally {
      setBusy(false);
    }
  }

  async function deleteThread(t: Thread) {
    const label = t.title || "Untitled";
    if (
      !window.confirm(
        `Delete "${label}"? This conversation and all its messages will be gone.`,
      )
    )
      return;

    setDeletingId(t.id);
    try {
      await api.threads.delete(t.id);
      if (t.id === activeId) {
        // We're viewing the deleted one — bounce to the index.
        router.push("/threads");
      } else {
        // Stay where we are, just refresh the sidebar list.
        router.refresh();
      }
    } catch (e) {
      window.alert(
        `Couldn't delete: ${e instanceof Error ? e.message : "unknown error"}`,
      );
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <aside className="flex h-full w-72 shrink-0 flex-col border-r border-[var(--border)]/80 bg-gradient-to-b from-[var(--panel-elevated)]/40 to-[var(--panel)]/50">
      <div className="border-b border-[var(--border)]/80 p-3">
        <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
          Conversations
        </p>
        <button
          onClick={newThread}
          disabled={busy}
          className="w-full rounded-xl bg-gradient-to-b from-[var(--accent)] to-[#2a4160] px-3 py-2.5 text-sm font-semibold text-white shadow-md shadow-[#0d1520]/60 ring-1 ring-white/10 transition hover:brightness-110 disabled:opacity-50"
        >
          {busy ? "Starting…" : "New chat"}
        </button>
      </div>
      <ul className="flex-1 space-y-1 overflow-y-auto p-2 text-sm">
        {threads.length === 0 ? (
          <li className="px-2 py-3 text-xs text-[var(--muted)]">No threads yet.</li>
        ) : (
          threads.map((t) => {
            const isActive = t.id === activeId;
            const isDeleting = deletingId === t.id;
            return (
              <li key={t.id} className="group relative">
                <Link
                  href={`/threads/${t.id}`}
                  aria-current={isActive ? "page" : undefined}
                  className={
                    "block truncate rounded-lg border py-2 pl-3 pr-9 transition " +
                    (isActive
                      ? "border-[var(--accent)]/50 bg-[var(--accent-soft)] text-white"
                      : "border-transparent text-[var(--muted)] hover:border-[var(--border)] hover:bg-white/5 hover:text-white")
                  }
                >
                  {isDeleting ? "Deleting…" : t.title || "Untitled"}
                </Link>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    deleteThread(t);
                  }}
                  disabled={isDeleting}
                  aria-label={`Delete thread "${t.title || "Untitled"}"`}
                  title="Delete thread"
                  className={
                    "absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-[var(--muted)] transition " +
                    "opacity-0 group-hover:opacity-100 focus:opacity-100 hover:bg-red-500/15 hover:text-red-300 disabled:opacity-50 " +
                    (isActive ? "opacity-60" : "")
                  }
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                    <path d="M10 11v6" />
                    <path d="M14 11v6" />
                    <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
                  </svg>
                </button>
              </li>
            );
          })
        )}
      </ul>
    </aside>
  );
}
