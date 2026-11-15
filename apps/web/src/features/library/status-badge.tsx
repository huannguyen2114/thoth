import type { ContentStatus } from "@thoth/core";
import { AlertIcon, CheckIcon, ClockIcon, SpinnerIcon } from "./icons";

/** Hearth badge: status variants always pair an icon with a word. */
export function StatusBadge({ status }: { status: ContentStatus }) {
  switch (status) {
    case "pending":
      return (
        <span className="badge badge--neutral shrink-0">
          <ClockIcon /> Queued
        </span>
      );
    case "processing":
      return (
        <span className="badge badge--info shrink-0">
          <SpinnerIcon className="motion-safe:animate-spin" /> Processing
        </span>
      );
    case "ready":
      return (
        <span className="badge badge--success shrink-0">
          <CheckIcon /> Ready
        </span>
      );
    case "failed":
      return (
        <span className="badge badge--danger shrink-0">
          <AlertIcon /> Failed
        </span>
      );
  }
}
