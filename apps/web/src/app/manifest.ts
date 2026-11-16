import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Thoth",
    short_name: "Thoth",
    description: "Turn your lectures, PDFs and videos into notes, quizzes and flashcards.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    display_override: ["window-controls-overlay", "standalone"],
    background_color: "#faf7f2",
    theme_color: "#faf7f2",
    categories: ["education", "productivity"],
    shortcuts: [
      {
        name: "Review",
        short_name: "Review",
        url: "/review",
        icons: [{ src: "/pwa-icon/192", sizes: "192x192", type: "image/png" }],
      },
      {
        name: "Progress",
        short_name: "Progress",
        url: "/progress",
        icons: [{ src: "/pwa-icon/192", sizes: "192x192", type: "image/png" }],
      },
      {
        name: "Add content",
        short_name: "Add",
        url: "/",
        icons: [{ src: "/pwa-icon/192", sizes: "192x192", type: "image/png" }],
      },
    ],
    icons: [
      { src: "/pwa-icon/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/pwa-icon/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/pwa-icon/192", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/pwa-icon/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
