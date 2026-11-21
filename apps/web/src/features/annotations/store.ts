"use client";

import type { Backlinks, NewAnnotationInput } from "@thoth/core";
import { useEffect, useMemo, useSyncExternalStore } from "react";
import {
  type AnnotationDto,
  backlinksAction,
  createAnnotationAction,
  deleteAnnotationAction,
  loadAnnotationsAction,
  updateAnnotationAction,
} from "./actions";

/**
 * The annotations and backlinks of one content, shared by every panel that shows them (the PDF,
 * the text, the transcript, the Annotations list). One store per content id, kept for the life
 * of the page, so panels that open and close share state without a provider.
 * Changes are optimistic and roll back with an error message (doc 11 rule 5).
 */
export interface AnnotationsState {
  status: "loading" | "ready" | "error";
  items: AnnotationDto[];
  backlinks: Backlinks | null;
  /** The content's title, for link chip labels. */
  title: string;
  /** The last failed change, shown as a callout until dismissed. */
  error: string | null;
}

type Listener = () => void;

const TEMP = "temp-";

class AnnotationStore {
  state: AnnotationsState = {
    status: "loading",
    items: [],
    backlinks: null,
    title: "Source",
    error: null,
  };
  private listeners = new Set<Listener>();
  private loading: Promise<void> | null = null;

  constructor(readonly contentId: string) {}

  subscribe = (l: Listener) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };
  get = () => this.state;

  private set(patch: Partial<AnnotationsState>) {
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l();
  }

  load(force = false): Promise<void> {
    if (this.loading && !force) return this.loading;
    this.loading = loadAnnotationsAction(this.contentId)
      .then(({ items, backlinks, title }) => this.set({ status: "ready", items, backlinks, title }))
      .catch(() => this.set({ status: this.state.status === "ready" ? "ready" : "error" }));
    return this.loading;
  }

  async refreshBacklinks() {
    try {
      this.set({ backlinks: await backlinksAction(this.contentId) });
    } catch {}
  }

  async create(input: NewAnnotationInput): Promise<AnnotationDto | null> {
    const now = Date.now();
    const temp: AnnotationDto = {
      id: `${TEMP}${now}${Math.random().toString(36).slice(2, 6)}` as AnnotationDto["id"],
      contentId: this.contentId as AnnotationDto["contentId"],
      kind: input.kind,
      anchor: input.anchor as AnnotationDto["anchor"],
      color: input.color ?? "yellow",
      comment: input.comment ?? null,
      payload: (input.payload ?? null) as AnnotationDto["payload"],
      createdAt: now,
      updatedAt: now,
    };
    this.set({ items: [...this.state.items, temp] });
    try {
      const r = await createAnnotationAction(this.contentId, input);
      if (!r.ok) {
        this.set({ items: this.state.items.filter((a) => a.id !== temp.id), error: r.error });
        return null;
      }
      this.set({ items: this.state.items.map((a) => (a.id === temp.id ? r.value : a)) });
      return r.value;
    } catch {
      this.set({
        items: this.state.items.filter((a) => a.id !== temp.id),
        error: "Could not reach the server. The annotation was not saved.",
      });
      return null;
    }
  }

  async update(
    id: string,
    patch: Partial<Pick<AnnotationDto, "color" | "comment" | "payload">>,
  ): Promise<boolean> {
    const before = this.state.items;
    this.set({ items: before.map((a) => (a.id === id ? { ...a, ...patch } : a)) });
    try {
      const r = await updateAnnotationAction(id, patch);
      if (r.ok) {
        this.set({ items: this.state.items.map((a) => (a.id === id ? r.value : a)) });
        return true;
      }
      this.set({ items: before, error: r.error });
    } catch {
      this.set({ items: before, error: "Could not reach the server. The change was not saved." });
    }
    return false;
  }

  async remove(id: string): Promise<AnnotationDto | null> {
    const gone = this.state.items.find((a) => a.id === id) ?? null;
    if (!gone) return null;
    this.set({ items: this.state.items.filter((a) => a.id !== id) });
    try {
      const r = await deleteAnnotationAction(id);
      if (r.ok) return gone;
      this.set({ items: [...this.state.items, gone], error: r.error });
    } catch {
      this.set({
        items: [...this.state.items, gone],
        error: "Could not reach the server. The annotation was not deleted.",
      });
    }
    return null;
  }

  dismissError() {
    this.set({ error: null });
  }
}

const stores = new Map<string, AnnotationStore>();

export function annotationStore(contentId: string): AnnotationStore {
  let s = stores.get(contentId);
  if (!s) {
    s = new AnnotationStore(contentId);
    stores.set(contentId, s);
  }
  return s;
}

const SERVER_STATE: AnnotationsState = {
  status: "loading",
  items: [],
  backlinks: null,
  title: "Source",
  error: null,
};

/** The content's annotations and backlinks, loaded on first use. */
export function useAnnotations(contentId: string) {
  const store = annotationStore(contentId);
  const state = useSyncExternalStore(store.subscribe, store.get, () => SERVER_STATE);
  useEffect(() => {
    void store.load();
  }, [store]);
  return useMemo(
    () => ({
      ...state,
      create: (i: NewAnnotationInput) => store.create(i),
      update: (id: string, p: Partial<Pick<AnnotationDto, "color" | "comment" | "payload">>) =>
        store.update(id, p),
      remove: (id: string) => store.remove(id),
      refreshBacklinks: () => store.refreshBacklinks(),
      dismissError: () => store.dismissError(),
    }),
    [state, store],
  );
}

export const isTempId = (id: string) => id.startsWith(TEMP);

// ---------- Flash requests ----------
// "Jump to this annotation and flash it", from the Annotations list or a link chip. A viewer that
// shows the annotation listens; one asked before it mounted gets the latest request on mount.

type FlashListener = (id: string) => boolean;
const flashListeners = new Set<FlashListener>();
let pendingFlash: string | null = null;

export function requestAnnotationFlash(id: string) {
  for (const l of flashListeners) if (l(id)) return;
  pendingFlash = id;
}

/** Called by a viewer: return true when it showed the annotation. */
export function onAnnotationFlash(listener: FlashListener) {
  flashListeners.add(listener);
  if (pendingFlash && listener(pendingFlash)) pendingFlash = null;
  return () => {
    flashListeners.delete(listener);
  };
}

/** Retries a pending flash, for a viewer whose pages load after it subscribed. */
export function retryPendingFlash() {
  const id = pendingFlash;
  if (!id) return;
  for (const l of flashListeners) {
    if (l(id)) {
      pendingFlash = null;
      return;
    }
  }
}
