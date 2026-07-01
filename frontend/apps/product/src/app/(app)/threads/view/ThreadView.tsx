"use client";

import type { ThreadMessage } from "@local-llm/api-client";
import { useRef, useState } from "react";
import { api } from "../../../../lib/api";
import { notifyThreadsChanged } from "../../../../lib/use-threads";
import { ChatPane } from "../../../../components/ChatPane";

export type AvailableModel = {
  slug: string;
  visionEnabled: boolean;
};

type Props = {
  threadId: string;
  initialModelSlug: string;
  initialSystemPrompt: string;
  availableModels: AvailableModel[];
  initialMessages: ThreadMessage[];
};

// LLM-derived titles take ~2-5s to land after the response finishes streaming. We
// nudge the sidebar to refetch at two horizons so it picks up the refined title even
// if the model is slow.
const TITLE_REFRESH_FIRST_MS = 5000;
const TITLE_REFRESH_FOLLOWUP_MS = 12000;

export function ThreadView({
  threadId,
  initialModelSlug,
  initialSystemPrompt,
  availableModels,
  initialMessages,
}: Props) {
  const [modelSlug, setModelSlug] = useState(initialModelSlug);
  const [systemPrompt, setSystemPrompt] = useState(initialSystemPrompt);
  const refreshTimers = useRef<Array<ReturnType<typeof setTimeout>>>([]);

  async function saveSystemPrompt(next: string) {
    const prev = systemPrompt;
    setSystemPrompt(next);
    try {
      const updated = await api.threads.update(threadId, { system_prompt: next });
      setSystemPrompt(updated.system_prompt ?? next);
    } catch (e) {
      setSystemPrompt(prev);
      throw e;
    }
  }

  function changeModel(next: string) {
    setModelSlug(next);
    api.threads.update(threadId, { model_slug: next }).catch(() => {
      /* ignore */
    });
  }

  function onMessageComplete() {
    refreshTimers.current.forEach(clearTimeout);
    refreshTimers.current = [
      setTimeout(() => notifyThreadsChanged(), TITLE_REFRESH_FIRST_MS),
      setTimeout(() => notifyThreadsChanged(), TITLE_REFRESH_FOLLOWUP_MS),
    ];
  }

  return (
    <ChatPane
      threadId={threadId}
      initialMessages={initialMessages}
      modelSlug={modelSlug}
      availableModels={availableModels}
      onModelChange={changeModel}
      systemPrompt={systemPrompt}
      onSystemPromptSave={saveSystemPrompt}
      onMessageComplete={onMessageComplete}
    />
  );
}
