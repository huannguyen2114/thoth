import { site } from "@content/site";
import type { Metadata, Viewport } from "next";
import { Geist, JetBrains_Mono, Newsreader } from "next/font/google";
import "./globals.css";

// Hearth type families, self-hosted by next/font: the page makes no third-party requests.
const sans = Geist({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-geist" });
const serif = Newsreader({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-newsreader",
});
const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["400"], variable: "--font-jetbrains" });

const title = `${site.name}: ${site.tagline.replace(/\.$/, "")}`;

/** The public address. Set SITE_URL in the deploy when the Pages project gets another name or a domain. */
const SITE_URL = process.env.SITE_URL ?? "https://thoth.pages.dev";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title,
  description: site.description,
  applicationName: site.name,
  openGraph: {
    title,
    description: site.description,
    type: "website",
    images: [{ url: "/shots/workspace-light.png", width: 1440, height: 900 }],
  },
  twitter: { card: "summary_large_image", title, description: site.description },
};

export const viewport: Viewport = {
  colorScheme: "light dark",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${serif.variable} ${mono.variable} antialiased`}>
      <body className="min-h-dvh bg-surface-100 text-ink">{children}</body>
    </html>
  );
}
