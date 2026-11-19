"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { type Command, useCommands } from "@/app/_components/commands";
import { replanAllAction } from "./actions";
import { tzOffset } from "./format";

/**
 * Palette commands for the planner (mounted once in the sidebar, which is on every page):
 * "New study plan", "Open planner" and "Re-plan" (every plan with its goal still ahead).
 */
export function PlannerCommands() {
  const router = useRouter();
  const [note, setNote] = useState<string | null>(null);

  const commands = useMemo<Command[]>(
    () => [
      {
        id: "planner-new",
        label: "New study plan",
        group: "Planner",
        keywords: ["goal", "schedule", "exam"],
        run: () => router.push("/planner?new=1"),
      },
      {
        id: "planner-open",
        label: "Open planner",
        group: "Planner",
        keywords: ["today", "schedule"],
        run: () => router.push("/planner"),
      },
      {
        id: "planner-replan",
        label: "Re-plan",
        group: "Planner",
        keywords: ["reschedule", "missed", "catch up"],
        run: () => {
          void replanAllAction(tzOffset()).then((r) => {
            setNote(
              r.ok
                ? r.value.replanned === 0
                  ? "No active plans to re-plan."
                  : `Re-planned ${r.value.replanned} ${r.value.replanned === 1 ? "plan" : "plans"} from today.`
                : r.error,
            );
            router.refresh();
            setTimeout(() => setNote(null), 4000);
          });
        },
      },
    ],
    [router],
  );
  useCommands("planner", commands);

  if (!note) return null;
  return (
    <div
      role="status"
      className="fixed right-4 bottom-4 z-50 max-w-sm rounded-lg border border-border-control bg-surface-200 p-3 text-ink shadow-lg"
    >
      <p className="type-caption">{note}</p>
    </div>
  );
}
