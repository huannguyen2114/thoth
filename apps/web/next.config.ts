import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The desktop app (doc 19) bundles the self-contained server; `pnpm dev` and `build` are unchanged.
  ...(process.env.THOTH_STANDALONE === "1" ? { output: "standalone" as const } : {}),
  cacheComponents: true,
  partialPrefetching: true,
  // Workspace packages ship TypeScript source; Next compiles them.
  transpilePackages: [
    "@thoth/core",
    "@thoth/db",
    "@thoth/embeddings",
    "@thoth/ingest",
    "@thoth/llm",
    "@thoth/ui",
  ],
  // Native SQLite driver, the Agent SDK (spawns the Claude Code CLI), pdfjs (loads its worker
  // from its own folder) and jsdom (reads its own files at runtime) stay outside the bundle.
  serverExternalPackages: [
    "@libsql/client",
    "libsql",
    "@anthropic-ai/claude-agent-sdk",
    "pdfjs-dist",
    "jsdom",
    // Transformers.js loads ONNX Runtime, a native addon (ADR-0029).
    "@huggingface/transformers",
    "onnxruntime-node",
  ],
  turbopack: {
    rules: {
      "*.css": { loaders: ["@tailwindcss/turbopack"], as: "*.css" },
    },
  },
};

export default nextConfig;
