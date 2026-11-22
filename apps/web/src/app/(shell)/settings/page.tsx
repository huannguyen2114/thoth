import { envKeyVarFor, getLlmSettings, getProviderKeyStatus, isBuiltInProfile } from "@thoth/core";
import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { AppPage } from "@/app/_components/app-shell";
import { GearIcon } from "@/app/_components/icons";
import { PageHeader } from "@/app/_components/page-header";
import { SearchIndexStatus } from "@/features/search-index/search-index-status";
import { ConnectionCheck } from "@/features/settings/connection-check";
import { type ProfileView, ProvidersSection } from "@/features/settings/providers";
import { TaskRouting } from "@/features/settings/task-routing";
import { getContainer } from "@/server/container";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <AppPage>
      <div className="mx-auto flex max-w-3xl flex-col gap-12">
        <PageHeader
          icon={<GearIcon />}
          tone="bg-neutral-tint text-ink-muted"
          title="Settings"
          sub="Choose which models Thoth uses, and for what."
        />
        <Suspense fallback={<div className="h-96 animate-pulse rounded-lg bg-surface-300" />}>
          <LlmSettings />
        </Suspense>
        <ConnectionCheck />
        <SearchIndexStatus />
      </div>
    </AppPage>
  );
}

async function LlmSettings() {
  await connection();
  const c = await getContainer();
  const settings = await getLlmSettings(c);
  // Only a status per key reaches the client, never the key.
  const profiles: ProfileView[] = await Promise.all(
    settings.profiles.map(async (p) => ({
      ...p,
      keyStatus: await getProviderKeyStatus({ ...c, envKeys: c.llmKeyEnv }, p),
      envVar: envKeyVarFor(p),
      builtIn: isBuiltInProfile(p.id),
    })),
  );
  return (
    <div className="flex flex-col gap-12">
      <ProvidersSection profiles={profiles} keychain={c.secrets.available} />
      {/* Keyed by the profiles so an edit that adds, removes or renames models resets the form. */}
      <TaskRouting
        key={JSON.stringify(settings.profiles.map((p) => [p.id, p.models]))}
        profiles={profiles}
        initial={settings.tasks}
      />
    </div>
  );
}
