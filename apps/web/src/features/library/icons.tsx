import type { ContentKind } from "@thoth/core";
import type { ReactNode } from "react";

/** Hearth outline icons: 16px grid, 1.6 stroke, round caps, currentColor. */
type IconProps = { className?: string };

function Svg({
  size = 16,
  className,
  children,
}: IconProps & { size?: number; children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {children}
    </svg>
  );
}

export function UploadIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M8 10.5V2.5M5 5.5l3-3 3 3M2.5 10.5v2a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-2" />
    </Svg>
  );
}

export function LinkIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M6.5 9.5l3-3M7 4.5l1-1a2.8 2.8 0 0 1 4 4l-1 1M9 11.5l-1 1a2.8 2.8 0 0 1-4-4l1-1" />
    </Svg>
  );
}

export function TextIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M3 4h10M3 7h10M3 10h7M3 13h5" />
    </Svg>
  );
}

export function PdfIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M9.5 1.5H4.5a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1v-9z" />
      <path d="M9.5 1.5v3h3M5.5 8.5h5M5.5 11h3" />
    </Svg>
  );
}

export function VideoIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="1.5" y="3.5" width="13" height="9" rx="2" />
      <path d="M6.75 6v4l3.5-2z" />
    </Svg>
  );
}

export function GlobeIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="8" cy="8" r="6.5" />
      <path d="M1.5 8h13M8 1.5c1.8 1.8 2.6 4 2.6 6.5S9.8 12.7 8 14.5C6.2 12.7 5.4 10.5 5.4 8S6.2 3.3 8 1.5" />
    </Svg>
  );
}

export function ArrowUpIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M8 13V3M4 7l4-4 4 4" />
    </Svg>
  );
}

export function CheckIcon(p: IconProps) {
  return (
    <Svg size={12} {...p}>
      <path d="M3 8.5l3 3 7-7" />
    </Svg>
  );
}

export function AlertIcon(p: IconProps) {
  return (
    <Svg size={12} {...p}>
      <circle cx="8" cy="8" r="6.5" />
      <path d="M8 4.75v3.75M8 11.25v.01" />
    </Svg>
  );
}

export function ClockIcon(p: IconProps) {
  return (
    <Svg size={12} {...p}>
      <circle cx="8" cy="8" r="6.5" />
      <path d="M8 4.5V8l2.5 1.5" />
    </Svg>
  );
}

export function SpinnerIcon(p: IconProps) {
  return (
    <Svg size={12} {...p}>
      <path d="M14.5 8A6.5 6.5 0 1 1 8 1.5" />
    </Svg>
  );
}

export function KindIcon({ kind, className }: { kind: ContentKind; className?: string }) {
  const props = className ? { className } : {};
  switch (kind) {
    case "pdf":
      return <PdfIcon {...props} />;
    case "youtube":
      return <VideoIcon {...props} />;
    case "webpage":
      return <GlobeIcon {...props} />;
    case "text":
      return <TextIcon {...props} />;
  }
}

export const kindLabels: Record<ContentKind, string> = {
  pdf: "PDF",
  youtube: "YouTube",
  webpage: "Web page",
  text: "Text",
};
