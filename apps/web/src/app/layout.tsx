import type { Metadata, Viewport } from "next";
import { Geist, JetBrains_Mono, Newsreader } from "next/font/google";
import { ServiceWorkerRegister } from "./_components/service-worker-register";
import "./globals.css";

// Hearth type families. next/font keeps the real family names, which tokens.css references.
const sans = Geist({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-geist" });
const serif = Newsreader({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-newsreader",
});
const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["400"], variable: "--font-jetbrains" });

export const metadata: Metadata = {
  title: { default: "Thoth", template: "%s · Thoth" },
  description: "Turn your lectures, PDFs and videos into notes, quizzes and flashcards.",
  applicationName: "Thoth",
  appleWebApp: { capable: true, title: "Thoth", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf7f2" },
    { media: "(prefers-color-scheme: dark)", color: "#1e1b18" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${sans.variable} ${serif.variable} ${mono.variable} antialiased`}>
      <body className="min-h-dvh">
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
