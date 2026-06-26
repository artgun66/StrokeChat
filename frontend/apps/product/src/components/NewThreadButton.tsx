"use client";

import { useState } from "react";
import { api } from "../lib/api";

type Props = {
  className?: string;
  children?: React.ReactNode;
};

/** Reusable "+ New thread" trigger. Creates the thread, then full-page navigates
 *  to it (location.href is the simplest way to land on the new thread page with
 *  an SSR pass that fetches messages, models, and catalog without us replicating
 *  any of that logic on the client). */
export function NewThreadButton({ className, children }: Props) {
  const [busy, setBusy] = useState(false);

  async function go() {
    if (busy) return;
    setBusy(true);
    try {
      const t = await api.threads.create({ title: "New thread" });
      window.location.href = `/threads/${t.id}`;
    } catch (e) {
      window.alert(
        `Couldn't create thread: ${e instanceof Error ? e.message : "unknown error"}`,
      );
      setBusy(false);
    }
  }

  return (
    <button type="button" onClick={go} disabled={busy} className={className}>
      {busy ? "Starting…" : (children ?? "New chat")}
    </button>
  );
}
