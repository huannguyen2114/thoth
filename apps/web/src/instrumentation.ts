/**
 * Runs once when the Next.js server starts. Starts the ingest job runner in the Node.js
 * runtime only (it needs SQLite, the filesystem and child processes), and never during
 * `next build`, whose workers also load this file.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const { startJobRunner } = await import("./server/jobs/runner");
  startJobRunner();
}
