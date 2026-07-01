"use client";

import { NewThreadButton } from "../../../components/NewThreadButton";
import { ThreadsSidebar } from "../../../components/ThreadsSidebar";

export default function ThreadsIndex() {
  return (
    <div className="flex h-full">
      <ThreadsSidebar />
      <main className="flex flex-1 items-center justify-center p-6 md:p-10">
        <div className="max-w-sm rounded-2xl border border-[var(--border)]/90 bg-gradient-to-b from-[var(--panel-elevated)]/90 to-[var(--panel)] p-8 text-center shadow-lg shadow-black/15">
          <p className="text-sm font-medium text-[var(--text)]">Pick a thread or start fresh</p>
          <p className="mt-2 text-balance text-sm leading-relaxed text-[var(--muted)]">
            Your history stays in this app, we&apos;re not shipping it to a
            random region with great coffee.
          </p>
          <NewThreadButton className="mt-6 inline-flex items-center justify-center rounded-xl bg-gradient-to-b from-[var(--accent)] to-[#2a4160] px-5 py-2.5 text-sm font-semibold text-white shadow-md ring-1 ring-white/10 transition hover:brightness-110 disabled:opacity-50" />
        </div>
      </main>
    </div>
  );
}
