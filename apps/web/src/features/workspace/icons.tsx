/** Workspace icons: 16px grid, 1.6 stroke, currentColor (Hearth iconography). */
import type { ReactNode } from "react";

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0"
    >
      {children}
    </svg>
  );
}

export const SourceIcon = () => (
  <Icon>
    <rect x="2" y="3" width="12" height="9" rx="1.5" />
    <path d="M6.5 6v3l2.5-1.5z" />
  </Icon>
);
export const ChaptersIcon = () => (
  <Icon>
    <path d="M3 4h1M3 8h1M3 12h1M6.5 4H13M6.5 8H13M6.5 12H13" />
  </Icon>
);
export const TranscriptIcon = () => (
  <Icon>
    <path d="M3 4h10M3 7h10M3 10h7M3 13h5" />
  </Icon>
);
export const ChatIcon = () => (
  <Icon>
    <path d="M3 4.5A1.5 1.5 0 0 1 4.5 3h7A1.5 1.5 0 0 1 13 4.5v5a1.5 1.5 0 0 1-1.5 1.5H7l-3 2.5V11A1.5 1.5 0 0 1 3 9.5z" />
  </Icon>
);
export const SummaryIcon = () => (
  <Icon>
    <path d="M4 2.5h5.5L12 5v8.5H4z" />
    <path d="M6 7.5h4M6 10h4" />
  </Icon>
);
export const NotesIcon = () => (
  <Icon>
    <path d="M10.5 2.5 13.5 5.5 6 13H3v-3z" />
    <path d="m9 4 3 3" />
  </Icon>
);
export const QuizIcon = () => (
  <Icon>
    <circle cx="8" cy="8" r="5.5" />
    <path d="M6.5 6.5a1.5 1.5 0 1 1 2 1.4c-.4.2-.5.5-.5.9v.2M8 11h0" />
  </Icon>
);
export const FlashcardsIcon = () => (
  <Icon>
    <rect x="2.5" y="4" width="9" height="9.5" rx="1.5" />
    <path d="M5 2.5h7a1.5 1.5 0 0 1 1.5 1.5v7.5" />
  </Icon>
);
export const LayoutIcon = () => (
  <Icon>
    <rect x="2" y="2.5" width="12" height="11" rx="1.5" />
    <path d="M7 2.5v11M7 8h7" />
  </Icon>
);
export const PlusIcon = () => (
  <Icon>
    <path d="M8 3v10M3 8h10" />
  </Icon>
);
export const CheckIcon = () => (
  <Icon>
    <path d="m3.5 8.5 3 3 6-7" />
  </Icon>
);
export const ResetIcon = () => (
  <Icon>
    <path d="M3 8a5 5 0 1 0 1.5-3.5M3 2.5V5h2.5" />
  </Icon>
);
export const MaximizeIcon = () => (
  <Icon>
    <path d="M9.5 2.5h4v4M6.5 13.5h-4v-4M13.5 2.5 9 7M2.5 13.5 7 9" />
  </Icon>
);
export const RestoreIcon = () => (
  <Icon>
    <path d="M13.5 6.5h-4v-4M2.5 9.5h4v4M9.5 6.5 14 2M6.5 9.5 2 14" />
  </Icon>
);
export const ChevronIcon = () => (
  <Icon>
    <path d="m4.5 6 3.5 3.5L11.5 6" />
  </Icon>
);
