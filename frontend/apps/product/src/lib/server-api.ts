// Server-side API client. Used in RSCs; reads API_URL (in-cluster).
import {
  ApiClient,
  catalogApi,
  modelsApi,
  threadsApi,
} from "@local-llm/api-client";

export function serverApi() {
  const baseUrl = process.env.API_URL ?? "http://backend:8000";
  const client = new ApiClient({ baseUrl });
  return {
    catalog: catalogApi(client),
    models: modelsApi(client),
    threads: threadsApi(client),
  };
}
