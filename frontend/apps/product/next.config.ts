import type { NextConfig } from "next";
import path from "node:path";

// Desktop builds run as a Next.js standalone server (launched by the Tauri supervisor) on a
// free port. The browser calls the Django backend DIRECTLY at its fixed loopback port
// (NEXT_PUBLIC_API_URL baked at build time); the backend's CORS_ALLOW_ALL_ORIGINS permits
// the frontend origin. No server-side proxy — direct CORS is simpler and avoids Next's
// rewrite mangling DRF's trailing slashes. The backend port is fixed (the supervisor pins
// 8000 with conflict detection) precisely because it is baked into the browser bundle here.
const config: NextConfig = {
  output: "standalone",
  // pnpm monorepo: trace workspace deps from the repo root so the standalone bundle is complete.
  outputFileTracingRoot: path.join(__dirname, "../../"),
  transpilePackages: ["@local-llm/ui", "@local-llm/auth", "@local-llm/api-client"],
  reactStrictMode: true,
};

export default config;
