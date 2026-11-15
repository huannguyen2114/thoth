"use client";

import { detectLinkKind } from "@thoth/core";
import { Button, cx } from "@thoth/ui";
import { useRouter } from "next/navigation";
import {
  type DragEvent,
  type KeyboardEvent,
  useActionState,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { type AddContentState, addLinkAction, addTextAction } from "./actions";
import {
  AlertIcon,
  ArrowUpIcon,
  GlobeIcon,
  LinkIcon,
  TextIcon,
  UploadIcon,
  VideoIcon,
} from "./icons";
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_LABEL } from "./limits";

const tabs = [
  { id: "link", label: "Link", Icon: LinkIcon },
  { id: "upload", label: "Upload", Icon: UploadIcon },
  { id: "paste", label: "Paste", Icon: TextIcon },
] as const;
type TabId = (typeof tabs)[number]["id"];

const initial: AddContentState = { error: null, addedAt: null };

/**
 * "What should we learn?" composer: a link (YouTube or web page, detected as you type),
 * a PDF upload, or pasted text. New items appear in Recents below.
 */
export function AddContentComposer() {
  const [tab, setTab] = useState<TabId>("link");
  const baseId = useId();
  const tabRefs = useRef<Record<TabId, HTMLButtonElement | null>>({
    link: null,
    upload: null,
    paste: null,
  });

  function onTabKey(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const i = tabs.findIndex((t) => t.id === tab);
    const next = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
    if (!next) return;
    e.preventDefault();
    setTab(next.id);
    tabRefs.current[next.id]?.focus();
  }

  return (
    <div className="flex w-full max-w-xl flex-col gap-4 text-left">
      <div role="tablist" aria-label="Add learning material" className="tabs" onKeyDown={onTabKey}>
        {tabs.map(({ id, label, Icon }) => (
          <button
            key={id}
            ref={(el) => {
              tabRefs.current[id] = el;
            }}
            type="button"
            role="tab"
            id={`${baseId}-tab-${id}`}
            aria-controls={`${baseId}-panel-${id}`}
            aria-selected={tab === id}
            tabIndex={tab === id ? 0 : -1}
            className="tab inline-flex items-center gap-2"
            onClick={() => setTab(id)}
          >
            <Icon /> {label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`${baseId}-panel-${tab}`} aria-labelledby={`${baseId}-tab-${tab}`}>
        {tab === "link" && <LinkForm />}
        {tab === "upload" && <UploadForm />}
        {tab === "paste" && <PasteForm />}
      </div>
    </div>
  );
}

function LinkForm() {
  const [state, action, pending] = useActionState(addLinkAction, initial);
  const [url, setUrl] = useState("");
  const kind = detectLinkKind(url);

  useEffect(() => {
    if (state.addedAt) setUrl("");
  }, [state.addedAt]);

  return (
    <form action={action} className="flex flex-col gap-2">
      <div className="composer max-w-none">
        <input
          name="url"
          type="url"
          inputMode="url"
          className="composer__input"
          placeholder="Paste a YouTube or web page link"
          aria-label="YouTube or web page link"
          aria-describedby="link-help"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          required
        />
        <button
          type="submit"
          className="composer__send"
          aria-label="Add link"
          disabled={pending || url.trim() === ""}
        >
          <ArrowUpIcon />
        </button>
      </div>
      <p
        id="link-help"
        className="flex items-center gap-1 type-caption text-ink-muted"
        aria-live="polite"
      >
        {pending ? (
          "Adding…"
        ) : kind === "youtube" ? (
          <>
            <VideoIcon /> YouTube video. We will use its captions.
          </>
        ) : kind === "webpage" ? (
          <>
            <GlobeIcon /> Web page. We will keep the article text.
          </>
        ) : (
          "YouTube videos and web pages work. Articles behind a login may not."
        )}
      </p>
      <FormError message={state.error} />
    </form>
  );
}

function UploadForm() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<{ busy: boolean; error: string | null; name?: string }>({
    busy: false,
    error: null,
  });
  const [dragging, setDragging] = useState(false);

  async function upload(file: File | undefined) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".pdf") && file.type !== "application/pdf") {
      setStatus({ busy: false, error: "This file is not a PDF. Choose a .pdf file." });
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setStatus({
        busy: false,
        error: `This file is over ${MAX_UPLOAD_LABEL}. Choose a smaller PDF, or split it first.`,
      });
      return;
    }
    setStatus({ busy: true, error: null, name: file.name });
    const body = new FormData();
    body.set("file", file);
    try {
      const res = await fetch("/api/upload", { method: "POST", body });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setStatus({ busy: false, error: data.error ?? "Upload failed. Try again." });
        return;
      }
      setStatus({ busy: false, error: null });
      router.refresh();
    } catch {
      setStatus({
        busy: false,
        error: "Upload failed. Check that Thoth is running, then try again.",
      });
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    void upload(e.dataTransfer.files[0]);
  }

  return (
    <div className="flex flex-col gap-2">
      {/* biome-ignore lint/a11y/noStaticElementInteractions: drop target; the button inside is the accessible control */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cx(
          "flex flex-col items-center gap-3 rounded-xl border border-dashed p-8 text-center",
          dragging ? "border-accent bg-accent-tint" : "border-border-control bg-surface-200",
        )}
      >
        <UploadIcon className="text-ink-muted" />
        <p className="type-body text-ink">
          {status.busy ? `Uploading ${status.name ?? "PDF"}…` : "Drop a PDF here, or choose one."}
        </p>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          className="sr-only"
          id="pdf-upload"
          onChange={(e) => void upload(e.target.files?.[0])}
        />
        <Button variant="primary" disabled={status.busy} onClick={() => inputRef.current?.click()}>
          {status.busy ? "Uploading" : "Choose PDF"}
        </Button>
        <p className="type-caption text-ink-muted">
          Up to {MAX_UPLOAD_LABEL}. Text PDFs only, not scans.
        </p>
      </div>
      <FormError message={status.error} />
    </div>
  );
}

function PasteForm() {
  const [state, action, pending] = useActionState(addTextAction, initial);
  const [text, setText] = useState("");

  useEffect(() => {
    if (state.addedAt) setText("");
  }, [state.addedAt]);

  return (
    <form action={action} className={cx("field max-w-none", state.error && "field--error")}>
      <label htmlFor="paste-text" className="field__label">
        Text to learn from
      </label>
      <textarea
        id="paste-text"
        name="text"
        rows={8}
        className="field__input h-auto min-h-40 resize-y py-3"
        placeholder="Paste notes, an article or a chapter. Blank lines separate paragraphs."
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="flex items-center justify-between gap-4">
        <p className="type-caption text-ink-muted">
          {text.length > 0
            ? `${text.length.toLocaleString("en")} characters`
            : "The first line becomes the title."}
        </p>
        <Button type="submit" variant="primary" disabled={pending || text.trim() === ""}>
          {pending ? "Adding" : "Add text"}
        </Button>
      </div>
      <FormError message={state.error} />
    </form>
  );
}

function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p className="flex items-center gap-1 type-caption text-danger" role="alert">
      <AlertIcon /> {message}
    </p>
  );
}
