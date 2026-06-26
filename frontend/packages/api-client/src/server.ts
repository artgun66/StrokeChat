// Server-side (RSC / route handlers). Reads API_URL.
import { ApiClient } from "./client";

export function serverClient(): ApiClient {
  const baseUrl = process.env.API_URL ?? "http://backend:8000";
  return new ApiClient({ baseUrl });
}
