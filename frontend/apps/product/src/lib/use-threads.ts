"use client";

import type { Thread } from "@local-llm/api-client";
import { useCallback, useEffect, useState } from "react";
import { api } from "./api";

const THREADS_CHANGED_EVENT = "threads:changed";

/** Dispatch from anywhere (create / delete / title refinement) to make every mounted
 *  ThreadsSidebar refetch its list. In a static SPA there's no router.refresh() to lean
 *  on, so we coordinate via a window event. */
export function notifyThreadsChanged(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(THREADS_CHANGED_EVENT));
  }
}

/** Fetches the thread list on mount and whenever a `threads:changed` event fires. */
export function useThreads(): { threads: Thread[]; refetch: () => void } {
  const [threads, setThreads] = useState<Thread[]>([]);

  const refetch = useCallback(() => {
    api.threads
      .list()
      .then((res) => setThreads(res.results))
      .catch(() => {
        /* leave the last-known list in place on transient failures */
      });
  }, []);

  useEffect(() => {
    refetch();
    window.addEventListener(THREADS_CHANGED_EVENT, refetch);
    return () => window.removeEventListener(THREADS_CHANGED_EVENT, refetch);
  }, [refetch]);

  return { threads, refetch };
}
