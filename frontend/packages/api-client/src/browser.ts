// Browser-side singleton. Reads NEXT_PUBLIC_API_URL.
import { ApiClient } from "./client";

const baseUrl =
  (typeof process !== "undefined" && process.env.NEXT_PUBLIC_API_URL) ||
  "http://localhost:8000";

export const browserClient = new ApiClient({ baseUrl });
