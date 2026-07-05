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
import { getSessionKey } from "./session";

export const apiBaseUrl =
  process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

function makeClient() {
  const sk = getSessionKey();
  return new ApiClient({
    baseUrl: apiBaseUrl,
    defaultHeaders: sk ? { "X-Session-Key": sk } : {},
  });
}

export const api = {
  catalog: catalogApi(makeClient()),
  downloads: downloadsApi(makeClient()),
  models: modelsApi(makeClient()),
  threads: threadsApi(makeClient()),
  streamChat: (body: Parameters<typeof streamChatCompletions>[1]) => {
    const sk = getSessionKey();
    return streamChatCompletions(apiBaseUrl, body, sk ? { "X-Session-Key": sk } : {});
  },
};
