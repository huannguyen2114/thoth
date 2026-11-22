/** Icons copied from apps/web/src/app/_components/icons.tsx so the demo looks like the app (16px, 1.6 stroke). */
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

export const PlusIcon = () => (
  <Icon>
    <path d="M8 3v10M3 8h10" />
  </Icon>
);
export const CardsIcon = () => (
  <Icon>
    <rect x="2.5" y="4" width="9" height="9.5" rx="1.5" />
    <path d="M5 2.5h7a1.5 1.5 0 0 1 1.5 1.5v7" />
  </Icon>
);
export const ChartIcon = () => (
  <Icon>
    <path d="M3 13V8M8 13V3M13 13V6" />
  </Icon>
);
export const FolderIcon = () => (
  <Icon>
    <path d="M2 4.5A1.5 1.5 0 0 1 3.5 3h2.6l1.4 1.5h5A1.5 1.5 0 0 1 14 6v5.5a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 11.5v-7Z" />
  </Icon>
);
export const GearIcon = () => (
  <Icon>
    <circle cx="8" cy="8" r="2.2" />
    <path d="M8 1.8v1.6M8 12.6v1.6M14.2 8h-1.6M3.4 8H1.8M12.4 3.6l-1.1 1.1M4.7 11.3l-1.1 1.1M12.4 12.4l-1.1-1.1M4.7 4.7 3.6 3.6" />
  </Icon>
);
export const SearchIcon = () => (
  <Icon>
    <circle cx="7" cy="7" r="4.5" />
    <path d="m10.5 10.5 3 3" />
  </Icon>
);
export const SidebarIcon = () => (
  <Icon>
    <rect x="2" y="2.5" width="12" height="11" rx="2" />
    <path d="M6 2.5v11" />
  </Icon>
);
export const SunIcon = () => (
  <Icon>
    <circle cx="8" cy="8" r="3" />
    <path d="M8 1.5v1.5M8 13v1.5M14.5 8H13M3 8H1.5M12.6 3.4l-1 1M4.4 11.6l-1 1M12.6 12.6l-1-1M4.4 4.4l-1-1" />
  </Icon>
);
export const MoonIcon = () => (
  <Icon>
    <path d="M13.5 9.5A5.5 5.5 0 0 1 6.5 2.5a5.5 5.5 0 1 0 7 7Z" />
  </Icon>
);
export const MonitorIcon = () => (
  <Icon>
    <rect x="2" y="3" width="12" height="8" rx="1.5" />
    <path d="M6 14h4M8 11v3" />
  </Icon>
);
export const XIcon = () => (
  <Icon>
    <path d="M4 4l8 8M12 4l-8 8" />
  </Icon>
);
export const ExpandIcon = () => (
  <Icon>
    <path d="M9.5 2.5h4v4M13.5 2.5 9 7M6.5 13.5h-4v-4M2.5 13.5 7 9" />
  </Icon>
);
export const LayoutIcon = () => (
  <Icon>
    <rect x="2.5" y="3" width="11" height="10" rx="1.5" />
    <path d="M2.5 6.5h11M7 6.5V13" />
  </Icon>
);
export const ChevronIcon = () => (
  <Icon>
    <path d="M4.5 6.5 8 10l3.5-3.5" />
  </Icon>
);
export const ArrowUpIcon = () => (
  <Icon>
    <path d="M8 13V3M4 7l4-4 4 4" />
  </Icon>
);
export const ClockIcon = () => (
  <Icon>
    <circle cx="8" cy="8" r="5.5" />
    <path d="M8 5v3l2 1.5" />
  </Icon>
);
export const CalendarIcon = () => (
  <Icon>
    <rect x="2.5" y="3.5" width="11" height="10" rx="1.5" />
    <path d="M2.5 7h11M5.5 2v3M10.5 2v3" />
  </Icon>
);
export const PointerIcon = () => (
  <Icon>
    <path d="M4 2.5l8 5-3.5 1L7 12z" />
  </Icon>
);
export const PenIcon = () => (
  <Icon>
    <path d="M10.5 3l2.5 2.5L6 12.5H3.5V10z" />
  </Icon>
);
export const RectIcon = () => (
  <Icon>
    <rect x="3" y="4" width="10" height="8" rx="1" />
  </Icon>
);
export const CircleIcon = () => (
  <Icon>
    <ellipse cx="8" cy="8" rx="5" ry="4" />
  </Icon>
);
export const CommentIcon = () => (
  <Icon>
    <path d="M3 4h10v6.5H7L4 13v-2.5H3z" />
  </Icon>
);
export const ListIcon = () => (
  <Icon>
    <path d="M6 4.5h7M6 8h7M6 11.5h7M3 4.5h.01M3 8h.01M3 11.5h.01" />
  </Icon>
);
export const DownloadIcon = () => (
  <Icon>
    <path d="M8 2.5v8M4.5 7 8 10.5 11.5 7M3 13.5h10" />
  </Icon>
);
