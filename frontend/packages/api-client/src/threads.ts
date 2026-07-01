import type { ApiClient } from "./client";

export type Thread = {
  id: string;
  title: string;
  model_slug: string;
  system_prompt: string;
  assistant: string | null;
  parameters: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type ThreadMessage = {
  id: string;
  thread: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  tokens_in: number;
  tokens_out: number;
  created_at: string;
};

type Paginated<T> = { count: number; next: string | null; previous: string | null; results: T[] };

export function threadsApi(client: ApiClient) {
  return {
    list: () => client.get<Paginated<Thread>>("/api/threads/"),
    get: (id: string) => client.get<Thread>(`/api/threads/${id}/`),
    create: (body: { title?: string; model_slug?: string; system_prompt?: string }) =>
      client.post<Thread>("/api/threads/", body),
    update: (id: string, body: Partial<Thread>) =>
      client.patch<Thread>(`/api/threads/${id}/`, body),
    delete: (id: string) => client.delete(`/api/threads/${id}/`),
    listMessages: (id: string) =>
      client.get<Paginated<ThreadMessage>>(`/api/threads/${id}/messages/`),
  };
}

export type ChatChunk = {
  id?: string;
  choices?: Array<{
    delta?: {
      content?: string;
      /** Some models (Gemma 4, o1-style) emit a private chain-of-thought stream
       *  here before the final answer. Surface in the UI as "thinking" — once
       *  `content` shows up, it's the user-visible answer. */
      reasoning_content?: string;
    };
    finish_reason?: string | null;
    index?: number;
  }>;
};

/**
 * Stream chat completions over SSE. Yields each parsed chunk JSON object until [DONE].
 * Errors are pushed as `{error: string}` chunks.
 */
/** Message content is either plain text or OpenAI-style multimodal parts (text +
 *  image_url), which the backend's chat-completions endpoint accepts for vision models. */
export type ChatMessageContent =
  | string
  | Array<
      | { type: "text"; text: string }
      | { type: "image_url"; image_url: { url: string } }
    >;

export async function* streamChatCompletions(
  baseUrl: string,
  body: {
    model: string;
    messages: Array<{ role: string; content: ChatMessageContent }>;
    thread_id?: string;
    [k: string]: unknown;
  },
): AsyncIterable<ChatChunk | { error: string }> {
  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/v1/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "text/event-stream" },
    body: JSON.stringify({ ...body, stream: true }),
  });
  if (!res.ok || !res.body) {
    yield { error: `HTTP ${res.status}: ${await res.text().catch(() => "")}` };
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE events are separated by blank lines.
    let idx;
    while ((idx = buffer.indexOf("\n\n")) !== -1) {
      const event = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      for (const line of event.split("\n")) {
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (data === "[DONE]") return;
        try {
          yield JSON.parse(data) as ChatChunk;
        } catch {
          yield { error: `bad SSE chunk: ${data.slice(0, 80)}` };
        }
      }
    }
  }
}
