"use client";

import { detectLinkKind, youtubePlaylistId, youtubeVideoId } from "@thoth/core";
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
import {
  type AddContentState,
  type AddPlaylistState,
  addLinkAction,
  addPlaylistAction,
  addTextAction,
} from "./actions";
import {
  AlertIcon,
  ArrowUpIcon,
  CheckIcon,
  GlobeIcon,
  LinkIcon,
  SpinnerIcon,
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
const initialPlaylist: AddPlaylistState = { error: null, addedAt: null, notice: null };

/**
 * "What should we learn?" composer: a link (YouTube video or playlist, or a web page, detected
 * as you type), PDF uploads (several files or a whole folder), or pasted text. With `spaceId`
 * (the space page) everything lands in that space (doc 22).
 */
export function AddContentComposer({ spaceId }: { spaceId?: string } = {}) {
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
    <div className="flex w-full flex-col gap-4 text-left">
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
        {tab === "link" && <LinkForm spaceId={spaceId} />}
        {tab === "upload" && <UploadForm spaceId={spaceId} />}
        {tab === "paste" && <PasteForm spaceId={spaceId} />}
      </div>
    </div>
  );
}

const SpaceField = ({ spaceId }: { spaceId: string | undefined }) =>
  spaceId ? <input type="hidden" name="spaceId" value={spaceId} /> : null;

function LinkForm({ spaceId }: { spaceId: string | undefined }) {
  const [state, action, pending] = useActionState(addLinkAction, initial);
  const [listState, listAction, listPending] = useActionState(addPlaylistAction, initialPlaylist);
  const [url, setUrl] = useState("");
  const [wholeList, setWholeList] = useState(true);
  const kind = detectLinkKind(url);
  const listId = youtubePlaylistId(url);
  const onlyList = listId !== null && youtubeVideoId(url) === null;
  const asPlaylist = listId !== null && (onlyList || wholeList);
  const busy = pending || listPending;

  useEffect(() => {
    if (state.addedAt || listState.addedAt) setUrl("");
  }, [state.addedAt, listState.addedAt]);

  return (
    <form action={asPlaylist ? listAction : action} className="flex flex-col gap-2">
      <SpaceField spaceId={spaceId} />
      <div className="composer max-w-none">
        <input
          name="url"
          type="url"
          inputMode="url"
          className="composer__input"
          placeholder="Paste a YouTube, playlist or web page link"
          aria-label="YouTube or web page link"
          aria-describedby="link-help"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          required
        />
        <button
          type="submit"
          className="composer__send"
          aria-label={asPlaylist ? "Add playlist" : "Add link"}
          disabled={busy || url.trim() === ""}
        >
          <ArrowUpIcon />
        </button>
      </div>
      {listId && !onlyList && (
        <label className="check">
          <input
            type="checkbox"
            checked={wholeList}
            onChange={(e) => setWholeList(e.target.checked)}
          />
          <span>Add every video in the playlist</span>
        </label>
      )}
      <p
        id="link-help"
        className="flex items-center gap-1 type-caption text-ink-muted"
        aria-live="polite"
      >
        {busy ? (
          asPlaylist ? (
            "Reading the playlist…"
          ) : (
            "Adding…"
          )
        ) : asPlaylist ? (
          <>
            <VideoIcon /> YouTube playlist. We will add each video, using its captions.
          </>
        ) : kind === "youtube" ? (
          <>
            <VideoIcon /> YouTube video. We will use its captions.
          </>
        ) : kind === "webpage" ? (
          <>
            <GlobeIcon /> Web page. We will keep the article text.
          </>
        ) : (
          "YouTube videos, playlists and web pages work. Articles behind a login may not."
        )}
      </p>
      {listState.notice && !listState.error && (
        <p className="type-caption text-ink-muted" role="status">
          {listState.notice}
        </p>
      )}
      <FormError message={asPlaylist ? listState.error : state.error} />
    </form>
  );
}

type UploadStatus = "queued" | "uploading" | "done" | "failed";
interface UploadRow {
  key: string;
  name: string;
  status: UploadStatus;
  error?: string;
}

/** Files to upload from a drop or a picker: PDFs only, keeping folder order (doc 22). */
function pdfsOf(list: FileList | File[]): { pdfs: File[]; skipped: number } {
  const files = [...list];
  const pdfs = files
    .filter((f) => f.name.toLowerCase().endsWith(".pdf") || f.type === "application/pdf")
    .sort((a, b) =>
      (a.webkitRelativePath || a.name).localeCompare(b.webkitRelativePath || b.name, undefined, {
        numeric: true,
      }),
    );
  return { pdfs, skipped: files.length - pdfs.length };
}

/** Reads every file of a dropped folder (Chromium and Safari's entry API). */
async function filesFromDrop(e: DragEvent<HTMLDivElement>): Promise<File[]> {
  const items = [...e.dataTransfer.items];
  const entries = items
    .map((i) => (typeof i.webkitGetAsEntry === "function" ? i.webkitGetAsEntry() : null))
    .filter((x): x is FileSystemEntry => x !== null);
  if (entries.length === 0 || entries.every((x) => x.isFile)) return [...e.dataTransfer.files];
  const out: File[] = [];
  const walk = async (entry: FileSystemEntry): Promise<void> => {
    if (entry.isFile) {
      out.push(
        await new Promise<File>((res, rej) => (entry as FileSystemFileEntry).file(res, rej)),
      );
      return;
    }
    const reader = (entry as FileSystemDirectoryEntry).createReader();
    for (;;) {
      const batch = await new Promise<FileSystemEntry[]>((res, rej) =>
        reader.readEntries(res, rej),
      );
      if (batch.length === 0) break;
      for (const child of batch) await walk(child);
    }
  };
  for (const entry of entries) await walk(entry);
  return out;
}

const UPLOAD_CONCURRENCY = 2;

function UploadForm({ spaceId }: { spaceId: string | undefined }) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<UploadRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const busy = rows.some((r) => r.status === "queued" || r.status === "uploading");

  // `webkitdirectory` is not in React's input attributes; set it on the element.
  useEffect(() => {
    folderInput.current?.setAttribute("webkitdirectory", "");
  }, []);

  const patch = (key: string, p: Partial<UploadRow>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...p } : r)));

  async function uploadOne(file: File, key: string) {
    if (file.size > MAX_UPLOAD_BYTES) {
      patch(key, { status: "failed", error: `Over ${MAX_UPLOAD_LABEL}.` });
      return;
    }
    patch(key, { status: "uploading" });
    const body = new FormData();
    body.set("file", file);
    if (spaceId) body.set("spaceId", spaceId);
    try {
      const res = await fetch("/api/upload", { method: "POST", body });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.ok) patch(key, { status: "done" });
      else patch(key, { status: "failed", error: data.error ?? "Upload failed." });
    } catch {
      patch(key, { status: "failed", error: "Upload failed. Check that Thoth is running." });
    }
  }

  async function upload(list: FileList | File[] | null | undefined) {
    if (!list || list.length === 0) return;
    const { pdfs, skipped } = pdfsOf(list);
    if (pdfs.length === 0) {
      setError("No PDFs there. Choose .pdf files, or a folder that holds some.");
      return;
    }
    setError(skipped > 0 ? `${skipped} files that are not PDFs were skipped.` : null);
    const stamp = Date.now().toString(36);
    const fresh = pdfs.map((f, i) => ({
      key: `${stamp}-${i}`,
      name: f.webkitRelativePath || f.name,
      status: "queued" as const,
    }));
    setRows((rs) => [...rs.filter((r) => r.status !== "done"), ...fresh]);
    // Each file is a normal upload and a normal ingest; two at a time keeps the Mac responsive.
    let next = 0;
    const worker = async () => {
      while (next < pdfs.length) {
        const i = next++;
        const file = pdfs[i];
        const row = fresh[i];
        if (file && row) await uploadOne(file, row.key);
      }
    };
    await Promise.all(Array.from({ length: Math.min(UPLOAD_CONCURRENCY, pdfs.length) }, worker));
    if (fileInput.current) fileInput.current.value = "";
    if (folderInput.current) folderInput.current.value = "";
    router.refresh();
  }

  async function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    void upload(await filesFromDrop(e));
  }

  const done = rows.filter((r) => r.status === "done").length;

  return (
    <div className="flex flex-col gap-2">
      {/* biome-ignore lint/a11y/noStaticElementInteractions: drop target; the buttons inside are the accessible controls */}
      <div
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes("Files")) return;
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => void onDrop(e)}
        className={cx(
          "flex flex-col items-center gap-3 rounded-xl border border-dashed p-8 text-center",
          dragging ? "border-accent bg-accent-tint" : "border-border-control bg-surface-200",
        )}
      >
        <UploadIcon className="text-ink-muted" />
        <p className="type-body text-ink">
          {busy
            ? `Uploading ${done + 1} of ${rows.length}…`
            : "Drop PDFs or a folder here, or choose them."}
        </p>
        <input
          ref={fileInput}
          type="file"
          accept="application/pdf,.pdf"
          multiple
          className="sr-only"
          id="pdf-upload"
          aria-label="Choose PDFs"
          onChange={(e) => void upload(e.target.files)}
        />
        <input
          ref={folderInput}
          type="file"
          multiple
          className="sr-only"
          aria-label="Choose a folder of PDFs"
          onChange={(e) => void upload(e.target.files)}
        />
        <div className="flex flex-wrap justify-center gap-2">
          <Button variant="primary" disabled={busy} onClick={() => fileInput.current?.click()}>
            {busy ? "Uploading" : "Choose PDFs"}
          </Button>
          <Button variant="secondary" disabled={busy} onClick={() => folderInput.current?.click()}>
            Choose folder
          </Button>
        </div>
        <p className="type-caption text-ink-muted">
          Up to {MAX_UPLOAD_LABEL} each. Text PDFs only, not scans.
        </p>
      </div>
      {rows.length > 0 && (
        <ul
          aria-label="Uploads"
          className="flex flex-col divide-y divide-border-subtle rounded-lg border border-border-subtle bg-surface-200"
        >
          {rows.map((r) => (
            <li key={r.key} className="flex items-center gap-3 px-3 py-2">
              <span
                className={cx("shrink-0", r.status === "failed" ? "text-danger" : "text-ink-muted")}
                aria-hidden="true"
              >
                {r.status === "done" ? (
                  <CheckIcon />
                ) : r.status === "failed" ? (
                  <AlertIcon />
                ) : (
                  <SpinnerIcon className={r.status === "uploading" ? "animate-spin" : ""} />
                )}
              </span>
              <span className="min-w-0 flex-1 truncate text-ink">{r.name}</span>
              <span
                className={cx(
                  "type-caption shrink-0",
                  r.status === "failed" ? "text-danger" : "text-ink-muted",
                )}
              >
                {r.status === "done"
                  ? "Queued"
                  : r.status === "failed"
                    ? (r.error ?? "Failed")
                    : r.status === "uploading"
                      ? "Uploading"
                      : "Waiting"}
              </span>
            </li>
          ))}
        </ul>
      )}
      <FormError message={error} />
    </div>
  );
}

function PasteForm({ spaceId }: { spaceId: string | undefined }) {
  const [state, action, pending] = useActionState(addTextAction, initial);
  const [text, setText] = useState("");

  useEffect(() => {
    if (state.addedAt) setText("");
  }, [state.addedAt]);

  return (
    <form action={action} className={cx("field max-w-none", state.error && "field--error")}>
      <SpaceField spaceId={spaceId} />
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
