import { AppFrame } from "@/app/_components/app-shell";

/**
 * Every page with the sidebar lives in this route group (ADR-0048). The frame is rendered here,
 * once, so moving between pages keeps the sidebar mounted. Unlock, offline and dev pages sit
 * outside the group and get no frame.
 */
export default function ShellLayout({ children }: LayoutProps<"/">) {
  return <AppFrame>{children}</AppFrame>;
}
