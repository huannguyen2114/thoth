/** Outline icons on a 16px grid, 1.6 stroke, currentColor (Hearth iconography). */
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
export const MenuIcon = () => (
  <Icon>
    <path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11" />
  </Icon>
);
