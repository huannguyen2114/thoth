/** Annotation icons: 16px grid, 1.6 stroke, currentColor (Hearth iconography). */
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

export const SelectIcon = () => (
  <Icon>
    <path d="M4 2.5v10l3-2.5 2 4 1.6-.8-2-4H12.5z" />
  </Icon>
);
export const PenIcon = () => (
  <Icon>
    <path d="M10.5 2.5l3 3-8 8H2.5v-3z" />
    <path d="M9 4l3 3" />
  </Icon>
);
export const RectIcon = () => (
  <Icon>
    <rect x="2.5" y="3.5" width="11" height="9" rx="1" />
  </Icon>
);
export const EllipseIcon = () => (
  <Icon>
    <ellipse cx="8" cy="8" rx="5.5" ry="4.5" />
  </Icon>
);
export const ArrowIcon = () => (
  <Icon>
    <path d="M3 13L13 3M7 3h6v6" />
  </Icon>
);
export const UndoIcon = () => (
  <Icon>
    <path d="M5.5 3L2.5 6l3 3" />
    <path d="M2.5 6h7a4 4 0 010 8H7" />
  </Icon>
);
export const RedoIcon = () => (
  <Icon>
    <path d="M10.5 3l3 3-3 3" />
    <path d="M13.5 6h-7a4 4 0 000 8H9" />
  </Icon>
);
export const ListIcon = () => (
  <Icon>
    <path d="M6 4h7.5M6 8h7.5M6 12h7.5M2.5 4h.5M2.5 8h.5M2.5 12h.5" />
  </Icon>
);
export const DownloadIcon = () => (
  <Icon>
    <path d="M8 2.5v8M4.5 7.5L8 11l3.5-3.5M2.5 13.5h11" />
  </Icon>
);
export const CommentIcon = () => (
  <Icon>
    <path d="M2.5 3.5h11v7.5H7l-3 2.5V11H2.5z" />
  </Icon>
);
export const NoteIcon = () => (
  <Icon>
    <path d="M3.5 2.5h6l3 3v8h-9z" />
    <path d="M9.5 2.5v3h3M5.5 8.5h5M5.5 11h3" />
  </Icon>
);
export const CardIcon = () => (
  <Icon>
    <rect x="2" y="4" width="10" height="8" rx="1.5" />
    <path d="M4.5 2h8a1.5 1.5 0 011.5 1.5V10" />
  </Icon>
);
export const TrashIcon = () => (
  <Icon>
    <path d="M2.5 4.5h11M6.5 4.5V3h3v1.5M4 4.5l.7 9h6.6l.7-9" />
  </Icon>
);
export const LinkIcon = () => (
  <Icon>
    <path d="M6.5 9.5l3-3" />
    <path d="M7 4.5l1.2-1.2a2.8 2.8 0 014 4L11 8.5M9 11.5l-1.2 1.2a2.8 2.8 0 01-4-4L5 7.5" />
  </Icon>
);
export const CloseIcon = () => (
  <Icon>
    <path d="M4 4l8 8M12 4l-8 8" />
  </Icon>
);
