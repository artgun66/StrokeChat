// Browser-side API client. Hits the backend via NEXT_PUBLIC_API_URL.
"use client";

import {
  ApiClient,
  catalogApi,
  downloadsApi,
  modelsApi,
  threadsApi,
  streamChatCompletions,
} from "@local-llm/api-client";

export const apiBaseUrl =
  process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

const client = new ApiClient({ baseUrl: apiBaseUrl });

export const api = {
  catalog: catalogApi(client),
  downloads: downloadsApi(client),
  models: modelsApi(client),
  threads: threadsApi(client),
  streamChat: (body: Parameters<typeof streamChatCompletions>[1]) =>
    streamChatCompletions(apiBaseUrl, body),
};
