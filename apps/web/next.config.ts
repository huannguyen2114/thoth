import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Workspace packages ship TypeScript source; Next compiles them.
  transpilePackages: ["@thoth/core", "@thoth/db", "@thoth/llm", "@thoth/ui"],
  // Native SQLite driver and the Agent SDK (spawns the Claude Code CLI) stay outside the bundle.
  serverExternalPackages: ["@libsql/client", "libsql", "@anthropic-ai/claude-agent-sdk"],
  turbopack: {
    rules: {
      "*.css": { loaders: ["@tailwindcss/turbopack"], as: "*.css" },
    },
  },
};

export default nextConfig;
