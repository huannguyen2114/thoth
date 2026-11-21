"use client";

import {
  type LlmKeyEnvVar,
  type LlmPresetId,
  type LlmProfile,
  llmPresetIds,
  llmPresets,
  type ProviderKeyStatus,
} from "@thoth/core";
import { Button, CancelButton, Dialog } from "@thoth/ui";
import { useState } from "react";
import {
  deleteKeyAction,
  deleteProfileAction,
  saveKeyAction,
  saveProfileAction,
  type TestResult,
  testProfileAction,
} from "./actions";

/** What the page passes down for each profile. Never a key, only its status. */
export interface ProfileView extends LlmProfile {
  keyStatus: ProviderKeyStatus;
  envVar: LlmKeyEnvVar | null;
  builtIn: boolean;
}

const builtInHelp: Record<string, string> = {
  "claude-subscription": "Runs Claude Code on this computer with your Claude plan. No key needed.",
  "anthropic-api": "Bills your Anthropic API account.",
};

/** Saved providers: the two built-in Claude ones, then any OpenAI-compatible ones. */
export function ProvidersSection({
  profiles,
  keychain,
}: {
  profiles: ProfileView[];
  keychain: boolean;
}) {
  const [editing, setEditing] = useState<ProfileView | "new" | null>(null);
  const [keyFor, setKeyFor] = useState<ProfileView | null>(null);
  const [deleting, setDeleting] = useState<ProfileView | null>(null);

  return (
    <section className="flex flex-col gap-4" aria-labelledby="providers-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 id="providers-title" className="type-heading-3 text-ink">
            Providers
          </h2>
          <p className="type-caption text-ink-muted">
            Claude, or any OpenAI-compatible server: Ollama, LM Studio, OpenRouter, OpenAI.
          </p>
        </div>
        <Button onClick={() => setEditing("new")}>Add provider</Button>
      </div>

      {!keychain && (
        <div className="callout callout--warning max-w-none" role="status">
          <p className="callout__text">
            This computer has no OS keychain Thoth can use, so keys cannot be saved here. Set{" "}
            <code>ANTHROPIC_API_KEY</code>, <code>OPENAI_API_KEY</code> or{" "}
            <code>OPENROUTER_API_KEY</code> in <code>apps/web/.env.local</code> instead.
          </p>
        </div>
      )}

      <ul className="flex flex-col divide-y divide-border-subtle rounded-lg border border-border-subtle bg-surface-200">
        {profiles.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="flex flex-wrap items-center gap-2">
                <span className="type-label text-ink">{p.name}</span>
                <KeyBadge profile={p} />
              </span>
              <span className="type-caption truncate text-ink-muted">
                {p.builtIn
                  ? builtInHelp[p.id]
                  : `${p.baseUrl} · ${p.models.length} ${p.models.length === 1 ? "model" : "models"} · ${p.caps.jsonSchema ? "JSON schema" : "JSON mode"}`}
              </span>
            </div>
            <div className="flex gap-2">
              {p.kind === "anthropic-api" && (
                <Button size="sm" onClick={() => setKeyFor(p)} disabled={!keychain}>
                  {p.keyStatus === "saved" ? "Change key" : "Add key"}
                </Button>
              )}
              {!p.builtIn && (
                <>
                  <Button size="sm" onClick={() => setEditing(p)}>
                    Edit
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setDeleting(p)}>
                    Delete
                  </Button>
                </>
              )}
            </div>
          </li>
        ))}
      </ul>

      {editing && (
        <ProfileDialog
          profile={editing === "new" ? null : editing}
          keychain={keychain}
          onClose={() => setEditing(null)}
        />
      )}
      {keyFor && <KeyDialog profile={keyFor} onClose={() => setKeyFor(null)} />}
      {deleting && <DeleteDialog profile={deleting} onClose={() => setDeleting(null)} />}
    </section>
  );
}

function KeyBadge({ profile }: { profile: ProfileView }) {
  switch (profile.keyStatus) {
    case "env":
      return (
        <span className="badge badge--success">
          <CheckGlyph /> From environment
        </span>
      );
    case "saved":
      return (
        <span className="badge badge--success">
          <CheckGlyph /> Key saved
        </span>
      );
    case "none":
      return isLocal(profile.baseUrl) ? (
        <span className="badge badge--neutral">Local</span>
      ) : profile.kind === "anthropic-api" ? (
        <span className="badge badge--warning">
          <AlertGlyph /> No key
        </span>
      ) : (
        <span className="badge badge--neutral">No key</span>
      );
    case "not-needed":
      return null;
  }
}

function isLocal(baseUrl: string | null) {
  if (!baseUrl) return false;
  try {
    return ["localhost", "127.0.0.1", "[::1]"].includes(new URL(baseUrl).hostname);
  } catch {
    return false;
  }
}

function presetFor(baseUrl: string | null): LlmPresetId {
  return (
    llmPresetIds.find((id) => id !== "custom" && llmPresets[id].baseUrl === baseUrl) ?? "custom"
  );
}

/** Add or edit an OpenAI-compatible provider. Presets pre-fill the form. */
function ProfileDialog({
  profile,
  keychain,
  onClose,
}: {
  profile: ProfileView | null;
  keychain: boolean;
  onClose: () => void;
}) {
  const [preset, setPreset] = useState<LlmPresetId>(
    profile ? presetFor(profile.baseUrl) : "ollama",
  );
  const [name, setName] = useState(profile?.name ?? llmPresets.ollama.name);
  const [baseUrl, setBaseUrl] = useState(profile?.baseUrl ?? llmPresets.ollama.baseUrl);
  const [apiKey, setApiKey] = useState("");
  const [models, setModels] = useState<string[]>(profile?.models ?? []);
  const [found, setFound] = useState<string[]>([]);
  const [newModel, setNewModel] = useState("");
  const [caps, setCaps] = useState(profile?.caps ?? { jsonSchema: false, tools: false });
  const [test, setTest] = useState<
    | { state: "idle" | "testing" }
    | { state: "ok"; result: TestResult }
    | { state: "error"; message: string }
  >({ state: "idle" });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const p = llmPresets[preset];
  const keyHint =
    profile?.keyStatus === "env"
      ? `Using ${profile.envVar} from the environment. A key typed here is saved but not used.`
      : profile?.keyStatus === "saved"
        ? "A key is saved. Leave this blank to keep it."
        : p.needsKey
          ? "Saved in your OS keychain, never in Thoth's database."
          : "Local servers usually need no key.";

  function pickPreset(id: LlmPresetId) {
    setPreset(id);
    const next = llmPresets[id];
    setName(next.name);
    setBaseUrl(next.baseUrl);
    setTest({ state: "idle" });
    setFound([]);
  }

  async function runTest() {
    setTest({ state: "testing" });
    const r = await testProfileAction({
      profileId: profile?.id,
      name,
      baseUrl,
      apiKey: apiKey || undefined,
      model: models[0],
    });
    if (!r.ok) return setTest({ state: "error", message: r.error });
    setTest({ state: "ok", result: r.value });
    setFound(r.value.models);
    setCaps((c) => ({ ...c, jsonSchema: r.value.jsonSchema }));
    if (models.length === 0 && r.value.model) setModels([r.value.model]);
  }

  function toggle(m: string) {
    setModels((ms) => (ms.includes(m) ? ms.filter((x) => x !== m) : [...ms, m]));
  }

  function addModel() {
    const m = newModel.trim();
    if (m && !models.includes(m)) setModels([...models, m]);
    setNewModel("");
  }

  async function save() {
    setSaving(true);
    setError(null);
    const r = await saveProfileAction({
      id: profile?.id,
      name,
      baseUrl,
      models: models.length > 0 ? models : [p.model],
      caps,
      apiKey: apiKey || undefined,
    });
    setSaving(false);
    if (!r.ok) return setError(r.error);
    onClose();
  }

  const listed = [...new Set([...models, ...found])];

  return (
    <Dialog
      title={profile ? `Edit ${profile.name}` : "Add a provider"}
      onClose={onClose}
      actions={
        <>
          <CancelButton onClick={onClose} />
          <Button variant="primary" onClick={save} disabled={saving}>
            {saving ? "Saving" : "Save provider"}
          </Button>
        </>
      }
    >
      <fieldset className="flex flex-col gap-2">
        <legend className="field__label mb-2">Preset</legend>
        <div className="flex flex-wrap gap-2">
          {llmPresetIds.map((id) => (
            <label
              key={id}
              className="cursor-default rounded-pill border border-border-control px-3 py-1 type-label text-ink has-[:checked]:border-accent has-[:checked]:bg-accent-tint has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus-ring"
            >
              <input
                type="radio"
                name="preset"
                value={id}
                checked={preset === id}
                onChange={() => pickPreset(id)}
                className="sr-only"
              />
              {llmPresets[id].name}
            </label>
          ))}
        </div>
        <span className="field__help">{p.help}</span>
      </fieldset>

      <div className="field max-w-none">
        <label className="field__label" htmlFor="profile-name">
          Name
        </label>
        <input
          id="profile-name"
          className="field__input"
          value={name}
          maxLength={60}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <div className="field max-w-none">
        <label className="field__label" htmlFor="profile-url">
          Base URL
        </label>
        <input
          id="profile-url"
          className="field__input"
          type="url"
          inputMode="url"
          spellCheck={false}
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
        />
        <span className="field__help">The address that ends in /v1.</span>
      </div>

      <div className="field max-w-none">
        <label className="field__label" htmlFor="profile-key">
          API key
        </label>
        <input
          id="profile-key"
          className="field__input"
          type="password"
          autoComplete="off"
          spellCheck={false}
          disabled={!keychain}
          placeholder={
            profile?.keyStatus === "saved"
              ? "Key saved"
              : p.needsKey
                ? "Paste your key"
                : "Optional"
          }
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          aria-describedby="profile-key-help"
        />
        <span id="profile-key-help" className="field__help">
          {keychain ? keyHint : "No keychain on this computer. Use the environment variables."}
        </span>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={runTest} disabled={test.state === "testing" || !baseUrl}>
            {test.state === "testing" ? "Testing" : "Test connection"}
          </Button>
          {profile?.keyStatus === "saved" && (
            <Button
              variant="ghost"
              onClick={async () => {
                const r = await deleteKeyAction(profile.id);
                if (!r.ok) setError(r.error);
                else onClose();
              }}
            >
              Remove saved key
            </Button>
          )}
        </div>
        {test.state === "ok" && (
          <div className="callout callout--success max-w-none" role="status">
            <p className="callout__text">
              <strong>Connected.</strong> {test.result.models.length}{" "}
              {test.result.models.length === 1 ? "model" : "models"} found.{" "}
              {test.result.jsonSchema
                ? `${test.result.model} supports JSON schema output.`
                : test.result.note}
            </p>
          </div>
        )}
        {test.state === "error" && (
          <div className="callout callout--danger max-w-none" role="alert">
            <p className="callout__text">
              <strong>Not connected.</strong> {test.message}
            </p>
          </div>
        )}
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="field__label mb-2">Models</legend>
        {listed.length > 0 ? (
          <div className="flex max-h-48 flex-col gap-1 overflow-y-auto rounded-md border border-border-subtle bg-surface-300 p-2">
            {listed.map((m) => (
              <label key={m} className="check min-w-0">
                <input type="checkbox" checked={models.includes(m)} onChange={() => toggle(m)} />
                <span className="truncate">{m}</span>
              </label>
            ))}
          </div>
        ) : (
          <span className="field__help">Test the connection to list the models, or add an id.</span>
        )}
        <div className="flex gap-2">
          <input
            aria-label="Model id"
            className="field__input min-w-0 flex-1"
            spellCheck={false}
            placeholder={p.model}
            value={newModel}
            onChange={(e) => setNewModel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addModel();
              }
            }}
          />
          <Button onClick={addModel} disabled={!newModel.trim()}>
            Add
          </Button>
        </div>
      </fieldset>

      {error && (
        <div className="callout callout--danger max-w-none" role="alert">
          <p className="callout__text">{error}</p>
        </div>
      )}
    </Dialog>
  );
}

/** The built-in Anthropic API profile has no form; this saves or removes its key. */
function KeyDialog({ profile, onClose }: { profile: ProfileView; onClose: () => void }) {
  const [key, setKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    setPending(true);
    const r = await action();
    setPending(false);
    if (!r.ok) return setError(r.error ?? "Something went wrong.");
    onClose();
  }

  return (
    <Dialog
      title="Anthropic API key"
      onClose={onClose}
      actions={
        <>
          <CancelButton onClick={onClose} />
          {profile.keyStatus === "saved" && (
            <Button
              variant="danger"
              disabled={pending}
              onClick={() => run(() => deleteKeyAction(profile.id))}
            >
              Remove key
            </Button>
          )}
          <Button
            variant="primary"
            disabled={pending || !key.trim()}
            onClick={() => run(() => saveKeyAction(profile.id, key))}
          >
            {pending ? "Saving" : "Save key"}
          </Button>
        </>
      }
    >
      <div className="field max-w-none">
        <label className="field__label" htmlFor="anthropic-key">
          API key
        </label>
        <input
          id="anthropic-key"
          className="field__input"
          type="password"
          autoComplete="off"
          spellCheck={false}
          placeholder={profile.keyStatus === "saved" ? "Key saved" : "sk-ant-…"}
          value={key}
          onChange={(e) => setKey(e.target.value)}
        />
        <span className="field__help">
          {profile.keyStatus === "env"
            ? "ANTHROPIC_API_KEY is set in the environment and wins over a saved key."
            : "Saved in your OS keychain, never in Thoth's database."}
        </span>
      </div>
      {error && (
        <div className="callout callout--danger max-w-none" role="alert">
          <p className="callout__text">{error}</p>
        </div>
      )}
    </Dialog>
  );
}

function DeleteDialog({ profile, onClose }: { profile: ProfileView; onClose: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  return (
    <Dialog
      title={`Delete ${profile.name}?`}
      onClose={onClose}
      actions={
        <>
          <CancelButton onClick={onClose} />
          <Button
            variant="danger"
            disabled={pending}
            onClick={async () => {
              setPending(true);
              const r = await deleteProfileAction(profile.id);
              setPending(false);
              if (!r.ok) return setError(r.error);
              onClose();
            }}
          >
            {pending ? "Deleting" : "Delete provider"}
          </Button>
        </>
      }
    >
      <p className="text-ink-muted">
        Thoth forgets this provider and removes its saved key from the keychain.
      </p>
      {error && (
        <div className="callout callout--danger max-w-none" role="alert">
          <p className="callout__text">{error}</p>
        </div>
      )}
    </Dialog>
  );
}

const CheckGlyph = () => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M3 8.5l3 3 7-7" />
  </svg>
);

const AlertGlyph = () => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M8 4.5v4M8 11.5h.01" />
    <circle cx="8" cy="8" r="6.5" />
  </svg>
);
