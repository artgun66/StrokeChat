import type { ApiClient } from "./client";

export type ModelFile = {
  id: string;
  catalog_slug: string;
  local_path: string;
  sha256: string;
  size_bytes: number;
  status: "downloading" | "ready" | "failed";
  error: string;
  created_at: string;
  updated_at: string;
};

type Paginated<T> = { count: number; next: string | null; previous: string | null; results: T[] };

export function modelsApi(client: ApiClient) {
  return {
    list: () => client.get<Paginated<ModelFile>>("/api/models/"),
  };
}
