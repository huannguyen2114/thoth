import type { AccentColor, SpaceIcon as SpaceIconName } from "@thoth/core";
import type { ReactNode } from "react";
import "./accents.css";

/** Outline icons on a 16px grid, 1.6 stroke, currentColor (Hearth iconography), one per `spaceIcons`. */
const paths: Record<SpaceIconName | "folder", ReactNode> = {
  folder: (
    <path d="M2 4.5A1.5 1.5 0 0 1 3.5 3h2.6l1.4 1.5h5A1.5 1.5 0 0 1 14 6v5.5a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 11.5v-7Z" />
  ),
  book: (
    <>
      <path d="M2.5 3.5c1.8-.7 3.6-.6 5.5.6v9c-1.9-1.2-3.7-1.3-5.5-.6v-9Z" />
      <path d="M13.5 3.5c-1.8-.7-3.6-.6-5.5.6v9c1.9-1.2 3.7-1.3 5.5-.6v-9Z" />
    </>
  ),
  flask: (
    <>
      <path d="M6 2h4M6.5 2v4L3 12.5A1 1 0 0 0 3.9 14h8.2a1 1 0 0 0 .9-1.5L9.5 6V2" />
      <path d="M4.8 10h6.4" />
    </>
  ),
  calculator: (
    <>
      <rect x="3" y="2" width="10" height="12" rx="1.5" />
      <path d="M5.5 4.5h5M5.5 8h.01M8 8h.01M10.5 8h.01M5.5 11h.01M8 11h.01M10.5 11h.01" />
    </>
  ),
  globe: (
    <>
      <circle cx="8" cy="8" r="6" />
      <path d="M2 8h12M8 2c1.7 1.7 2.5 3.7 2.5 6S9.7 12.3 8 14C6.3 12.3 5.5 10.3 5.5 8S6.3 3.7 8 2Z" />
    </>
  ),
  code: <path d="M5.5 4.5 2 8l3.5 3.5M10.5 4.5 14 8l-3.5 3.5M9 3l-2 10" />,
  music: (
    <>
      <path d="M6 12V3.5l7-1.5V10" />
      <circle cx="4.5" cy="12" r="1.5" />
      <circle cx="11.5" cy="10" r="1.5" />
    </>
  ),
  palette: (
    <>
      <path d="M8 2a6 6 0 1 0 0 12c.9 0 1.3-.6 1.1-1.3-.3-1 .4-1.7 1.4-1.7H12a2 2 0 0 0 2-2A6 6 0 0 0 8 2Z" />
      <path d="M5 7.5h.01M7 5h.01M10 5.5h.01" />
    </>
  ),
  briefcase: (
    <>
      <rect x="2" y="5" width="12" height="8.5" rx="1.5" />
      <path d="M6 5V3.5A1 1 0 0 1 7 2.5h2a1 1 0 0 1 1 1V5M2 9h12" />
    </>
  ),
  heart: <path d="M8 13.5S2 10 2 6a3 3 0 0 1 6-1 3 3 0 0 1 6 1c0 4-6 7.5-6 7.5Z" />,
  star: <path d="m8 2 1.8 3.8 4.2.5-3.1 2.9.8 4.1L8 11.3 4.3 13.3l.8-4.1L2 6.3l4.2-.5L8 2Z" />,
};

/** A space's icon in its accent colour (or the folder in muted ink when none is chosen). */
export function SpaceIcon({
  icon,
  color,
  size = 16,
}: {
  icon: SpaceIconName | null;
  color: AccentColor | null;
  size?: 16 | 20 | 24;
}) {
  return (
    <span data-accent={color ?? "gray"} className="accent-fg inline-flex shrink-0">
      <svg
        width={size}
        height={size}
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {paths[icon ?? "folder"]}
      </svg>
    </span>
  );
}

export const spaceIconLabels: Record<SpaceIconName, string> = {
  book: "Book",
  flask: "Science",
  calculator: "Maths",
  globe: "Languages and world",
  code: "Code",
  music: "Music",
  palette: "Art",
  briefcase: "Work",
  heart: "Health",
  star: "Favourite",
};
