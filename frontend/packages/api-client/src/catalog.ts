import type { ApiClient } from "./client";

export type ModelTier = "tiny" | "small" | "medium" | "large" | "coding";

export type CatalogModel = {
  id: string;
  slug: string;
  display_name: string;
  family: string;
  tier: ModelTier;
  source_url: string;
  source_repo: string;
  source_revision: string;
  format: "gguf" | "safetensors" | "awq" | "gptq";
  compatible_engines: string[];
  sha256: string;
  size_bytes: number;
  license_spdx: string;
  license_url: string;
  allowed_use: "commercial" | "research-only" | "restricted";
  deprecated: boolean;
  successor_slug: string;
  vision_enabled: boolean;
  mmproj_url: string;
  mmproj_sha256: string;
  mmproj_size_bytes: number;
};

type Paginated<T> = { count: number; next: string | null; previous: string | null; results: T[] };

export function catalogApi(client: ApiClient) {
  return {
    list: () => client.get<Paginated<CatalogModel>>("/api/catalog/"),
    get: (slug: string) => client.get<CatalogModel>(`/api/catalog/${slug}/`),
  };
}
