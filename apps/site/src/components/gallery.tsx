"use client";

import { type ShotId, site } from "@content/site";
import { useRef, useState } from "react";
import { Shot } from "./shot";

/** "Straight from the app": every feature's screenshot; a click opens it large. */
export function Gallery() {
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState<{ id: ShotId; title: string } | null>(null);
  const items = site.features.map((f) => ({ id: f.shot, title: f.kicker }));
  return (
    <>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((it) => (
          <li key={it.id}>
            <button
              type="button"
              className="group flex w-full cursor-zoom-in flex-col gap-2 text-left"
              onClick={() => {
                setOpen(it);
                dialog.current?.showModal();
              }}
            >
              <Shot
                id={it.id}
                alt={`${it.title} in Thoth`}
                className="shadow-hearth-sm transition-transform duration-150 group-hover:-translate-y-0.5 motion-reduce:transition-none"
              />
              <span className="type-label text-ink-muted">{it.title}</span>
            </button>
          </li>
        ))}
      </ul>
      <dialog
        ref={dialog}
        aria-label={open ? `${open.title} screenshot` : "Screenshot"}
        className="m-auto w-full max-w-7xl rounded-lg bg-transparent p-0 backdrop:bg-scrim"
        onClick={(e) => e.target === e.currentTarget && dialog.current?.close()}
        onKeyDown={(e) => e.key === "Escape" && dialog.current?.close()}
        onClose={() => setOpen(null)}
      >
        {open && <Shot id={open.id} alt={`${open.title} in Thoth, enlarged`} priority />}
      </dialog>
    </>
  );
}
