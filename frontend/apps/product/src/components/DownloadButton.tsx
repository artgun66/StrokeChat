"use client";

import { Button } from "@local-llm/ui";
import type { DownloadJob } from "@local-llm/api-client";
import { useEffect, useState } from "react";
import { api } from "../lib/api";

type Props = {
  catalogSlug: string;
  alreadyReady?: boolean;
  /** Tighter control for table/dense layouts */
  compact?: boolean;
};

export function DownloadButton({
  catalogSlug,
  alreadyReady,
  compact = false,
}: Props) {
  const t = (normal: string, small: string) => (compact ? small : normal);
  const [job, setJob] = useState<DownloadJob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmRedownload, setConfirmRedownload] = useState(false);

  // Poll while a job is active.
  useEffect(() => {
    if (!job || job.status === "succeeded" || job.status === "failed") return;
    const id = setInterval(async () => {
      try {
        const fresh = await api.downloads.get(job.id);
        setJob(fresh);
      } catch (e) {
        setError(e instanceof Error ? e.message : "poll failed");
      }
    }, 1500);
    return () => clearInterval(id);
  }, [job]);

  async function start() {
    setError(null);
    try {
      const fresh = await api.downloads.create(catalogSlug);
      setJob(fresh);
    } catch (e) {
      setError(e instanceof Error ? e.message : "request failed");
    }
  }

  if (!job && alreadyReady && !confirmRedownload) {
    return (
      <div className={"flex items-center justify-end " + (compact ? "gap-1" : "gap-2")}>
        <span className={t("text-sm", "text-xs") + " text-[var(--success)]"}>Ready</span>
        <button
          type="button"
          className={
            (compact ? "text-[10px] " : "text-xs ") +
            "text-[var(--link)] underline decoration-[var(--link)]/50 underline-offset-2 transition hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--ring-offset)]"
          }
          onClick={() => setConfirmRedownload(true)}
        >
          Re-download
        </button>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="flex flex-col items-end">
        <Button
          onClick={start}
          className={compact ? "!px-2.5 !py-1.5 !text-xs" : ""}
        >
          Download
        </Button>
        {error && (
          <p
            className={t("mt-1 text-xs", "mt-0.5 max-w-[8rem] text-left text-[10px]") + " text-[var(--error)]"}
            role="alert"
          >
            {error}
          </p>
        )}
      </div>
    );
  }

  if (job.status === "succeeded") {
    return (
      <span className={t("text-sm", "text-xs") + " text-[var(--success)]"}>Ready</span>
    );
  }

  if (job.status === "failed") {
    return (
      <div className={t("text-sm", "max-w-[10rem] text-xs") + " text-[var(--error)]"}>
        {job.error || "Failed"}{" "}
        <button
          type="button"
          className="text-[var(--link)] underline decoration-[var(--link)]/50 underline-offset-2 transition hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--ring-offset)]"
          onClick={() => setJob(null)}
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className={compact ? "min-w-24" : "min-w-32"}>
      <div
        className={
          (compact ? "h-1.5 " : "h-2 ") +
          "w-full overflow-hidden rounded bg-[var(--progress-track)]"
        }
        role="progressbar"
        aria-valuenow={Math.round(job.progress_pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Download progress"
      >
        <div
          className="h-full bg-[var(--progress-fill)] transition-[width]"
          style={{ width: `${Math.max(2, job.progress_pct)}%` }}
        />
      </div>
      <p
        className={
          (compact ? "mt-0.5 text-[10px] " : "mt-1 text-xs ") +
          "text-[var(--muted)]"
        }
      >
        {job.status} · {job.progress_pct.toFixed(1)}%
      </p>
    </div>
  );
}
