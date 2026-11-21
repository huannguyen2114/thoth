/** The space page's tabs (doc 22). Plain data, so the server page and the client tabs share it. */
export const spaceTabs = [
  { id: "overview", label: "Overview" },
  { id: "chat", label: "Chat" },
  { id: "notes", label: "Notes" },
  { id: "board", label: "Board" },
  { id: "contents", label: "Contents" },
  { id: "exams", label: "Exams" },
] as const;
export type SpaceTab = (typeof spaceTabs)[number]["id"];

export const isSpaceTab = (v: unknown): v is SpaceTab => spaceTabs.some((t) => t.id === v);
