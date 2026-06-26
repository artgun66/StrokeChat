import type { ApiClient } from "./client";

export type DownloadJob = {
  id: string;
  catalog_slug: string;
  status: "pending" | "running" | "succeeded" | "failed";
  bytes_downloaded: number;
  bytes_total: number;
  progress_pct: number;
  error: string;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
};

type Paginated<T> = { count: number; next: string | null; previous: string | null; results: T[] };

export function downloadsApi(client: ApiClient) {
  const baseUrl = (client as unknown as { baseUrl: string }).baseUrl ?? "";
  return {
    list: () => client.get<Paginated<DownloadJob>>("/api/downloads/"),
    get: (id: string) => client.get<DownloadJob>(`/api/downloads/${id}/`),
    create: async (catalog_slug: string): Promise<DownloadJob> => {
      const res = await fetch(`${baseUrl}/api/downloads/`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ catalog_slug }),
      });
      if (!res.ok) {
        throw new Error(`POST /api/downloads/ failed: ${res.status} ${await res.text()}`);
      }
      return (await res.json()) as DownloadJob;
    },
  };
}
