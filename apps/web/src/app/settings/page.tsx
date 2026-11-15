import { getLlmSettings } from "@thoth/core";
import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { ConnectionCheck } from "@/features/settings/connection-check";
import { LlmSettingsForm } from "@/features/settings/llm-settings-form";
import { getContainer } from "@/server/container";
import { AppShell } from "../_components/app-shell";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <AppShell>
      <div className="mx-auto flex max-w-2xl flex-col gap-12">
        <header className="flex flex-col gap-2">
          <h1 className="type-display-lg text-ink">Settings</h1>
          <p className="text-ink-muted">Choose how Thoth talks to Claude.</p>
        </header>
        <Suspense fallback={<div className="h-96 animate-pulse rounded-lg bg-surface-300" />}>
          <SettingsForm />
        </Suspense>
        <ConnectionCheck />
      </div>
    </AppShell>
  );
}

async function SettingsForm() {
  await connection();
  const c = await getContainer();
  const initial = await getLlmSettings({ settings: c.settings });
  return <LlmSettingsForm initial={initial} hasApiKey={c.hasAnthropicApiKey} />;
}
