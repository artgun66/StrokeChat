"use client";

import type { Thread } from "@local-llm/api-client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "../lib/api";
import { useThreads } from "../lib/use-threads";

type Props = {
  activeId?: string;
};

export function ThreadsSidebar({ activeId }: Props) {
  const router = useRouter();
  const { threads, refetch } = useThreads();
  const [busy, setBusy] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function newThread() {
    setBusy(true);
    try {
      const t = await api.threads.create({ title: "New thread" });
      window.location.href = `/threads/view?id=${t.id}`;
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
        refetch();
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
    <aside className="flex h-full w-72 shrink-0 flex-col border-r border-[var(--border)] bg-[var(--bg-elevated)]">
      <div className="border-b border-[var(--border)] p-3">
        <div className="mb-3 flex items-center justify-between px-1">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
            Conversations
          </p>
          <span className="rounded-full bg-[var(--panel-elevated)] px-2 py-0.5 text-xs font-medium text-[var(--muted)]">
            {threads.length}
          </span>
        </div>
        <button
          onClick={newThread}
          disabled={busy}
          className="w-full rounded-xl bg-[var(--accent)] px-3 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
        >
          {busy ? "Starting…" : "New chat"}
        </button>
      </div>
      <ul className="flex-1 space-y-1.5 overflow-y-auto p-2 text-sm">
        {threads.length === 0 ? (
          <li className="rounded-2xl border border-dashed border-[var(--border)] bg-white/50 px-3 py-4 text-xs leading-5 text-[var(--muted)]">
            No threads yet. Start a new chat to keep your stroke questions and scan context together.
          </li>
        ) : (
          threads.map((t) => {
            const isActive = t.id === activeId;
            const isDeleting = deletingId === t.id;
            return (
              <li key={t.id} className="group relative">
                <Link
                  href={`/threads/view?id=${t.id}`}
                  aria-current={isActive ? "page" : undefined}
                  className={
                    "block truncate rounded-2xl border py-2.5 pl-3 pr-9 transition " +
                    (isActive
                      ? "border-[var(--accent)]/30 bg-white font-semibold text-[var(--accent)] shadow-sm"
                      : "border-transparent text-[var(--muted)] hover:border-[var(--border)] hover:bg-white/80 hover:text-[var(--text)]")
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
                    "opacity-0 group-hover:opacity-100 focus:opacity-100 hover:bg-red-100 hover:text-red-600 disabled:opacity-50 " +
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
