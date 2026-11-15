"use client";

import type { DueCard } from "@thoth/core";
import { Button } from "@thoth/ui";
import { useState } from "react";
import { deleteCardAction, editCardAction } from "./actions";

/** Cards of one set: read, edit in place, delete. */
export function CardList({ cards, onChanged }: { cards: DueCard[]; onChanged: () => void }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function save(id: DueCard["card"]["id"]) {
    const r = await editCardAction(id, front, back);
    if (!r.ok) return setError(r.error);
    setEditing(null);
    setError(null);
    onChanged();
  }
  async function remove(id: DueCard["card"]["id"]) {
    const r = await deleteCardAction(id);
    if (!r.ok) setError(r.error);
    onChanged();
  }

  return (
    <ul className="flex flex-col gap-2">
      {error && (
        <li className="callout callout--danger" role="alert">
          <p className="callout__text">{error}</p>
        </li>
      )}
      {cards.map(({ card }) => (
        <li
          key={card.id}
          className="flex flex-col gap-2 rounded-lg border border-border-subtle bg-surface-200 p-4"
        >
          {editing === card.id ? (
            <>
              <div className="field max-w-none">
                <label className="field__label" htmlFor={`front-${card.id}`}>
                  Front
                </label>
                <input
                  id={`front-${card.id}`}
                  className="field__input"
                  value={front}
                  onChange={(e) => setFront(e.target.value)}
                />
              </div>
              <div className="field max-w-none">
                <label className="field__label" htmlFor={`back-${card.id}`}>
                  Back
                </label>
                <textarea
                  id={`back-${card.id}`}
                  rows={3}
                  className="field__input h-auto w-full py-3"
                  value={back}
                  onChange={(e) => setBack(e.target.value)}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => setEditing(null)}>
                  Cancel
                </Button>
                <Button variant="secondary" size="sm" onClick={() => save(card.id)}>
                  Save card
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="type-body-strong text-ink">{card.front}</p>
              <p className="text-ink-muted">{card.back}</p>
              <div className="flex items-center justify-between gap-2">
                <span className="badge badge--neutral">{card.topic}</span>
                <span className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setEditing(card.id);
                      setFront(card.front);
                      setBack(card.back);
                    }}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => remove(card.id)}
                    aria-label={`Delete card: ${card.front}`}
                  >
                    Delete
                  </Button>
                </span>
              </div>
            </>
          )}
        </li>
      ))}
    </ul>
  );
}
