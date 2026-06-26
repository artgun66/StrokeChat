import type { NextConfig } from "next";

const config: NextConfig = {
  transpilePackages: ["@local-llm/ui", "@local-llm/auth", "@local-llm/api-client"],
  reactStrictMode: true,
};

export default config;
