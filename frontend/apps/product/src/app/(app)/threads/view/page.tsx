"use client";

import type { Thread, ThreadMessage } from "@local-llm/api-client";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { api } from "../../../../lib/api";
import { ThreadsSidebar } from "../../../../components/ThreadsSidebar";
import { ThreadView, type AvailableModel } from "./ThreadView";

type Loaded = {
  thread: Thread;
  messages: ThreadMessage[];
  ready: AvailableModel[];
};

function ThreadViewRoute() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = searchParams.get("id");

  const [data, setData] = useState<Loaded | null>(null);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    if (!id) {
      router.replace("/threads");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const thread = await api.threads.get(id);
        const [msgs, modelsList, catalogList] = await Promise.all([
          api.threads.listMessages(id),
          api.models.list(),
          api.catalog.list(),
        ]);

        // Cross-reference downloaded models with the catalog so the chat UI knows
        // which selected model accepts images. Slugs not in the active catalog
        // (older deprecated downloads) default to vision_enabled=false.
        const visionBySlug = new Map<string, boolean>();
        for (const m of catalogList.results) visionBySlug.set(m.slug, !!m.vision_enabled);

        const ready: AvailableModel[] = modelsList.results
          .filter((m) => m.status === "ready")
          .map((m) => ({
            slug: m.catalog_slug,
            visionEnabled: visionBySlug.get(m.catalog_slug) ?? false,
          }));

        if (!cancelled) setData({ thread, messages: msgs.results, ready });
      } catch {
        if (!cancelled) {
          setErrored(true);
          router.replace("/threads");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, router]);

  if (errored) return null;

  if (!data) {
    return (
      <div className="flex h-full bg-[var(--bg)]">
        <ThreadsSidebar activeId={id ?? undefined} />
        <main className="flex flex-1 items-center justify-center p-6">
          <p className="text-sm text-[var(--muted)]">Loading conversation…</p>
        </main>
      </div>
    );
  }

  return (
    <div className="flex h-full bg-[var(--bg)]">
      <ThreadsSidebar activeId={data.thread.id} />
      <main className="flex-1">
        <ThreadView
          threadId={data.thread.id}
          initialModelSlug={data.thread.model_slug || data.ready[0]?.slug || ""}
          initialSystemPrompt={data.thread.system_prompt || ""}
          availableModels={data.ready}
          initialMessages={data.messages}
        />
      </main>
    </div>
  );
}

export default function ThreadViewPage() {
  // useSearchParams forces a client-side bailout under static export; Suspense is required.
  return (
    <Suspense fallback={null}>
      <ThreadViewRoute />
    </Suspense>
  );
}
