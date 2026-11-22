import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ImageResponse } from "next/og";

const SIZES = ["192", "512"] as const;

export function generateStaticParams() {
  return SIZES.map((size) => ({ size }));
}

/** Thoth's icon (design/brand/thoth-icon.svg) as a PNG for the PWA manifest. */
const ICON = `data:image/svg+xml;base64,${readFileSync(
  resolve(process.cwd(), "../../design/brand/thoth-icon.svg"),
).toString("base64")}`;

export async function GET(_req: Request, ctx: RouteContext<"/pwa-icon/[size]">) {
  const { size } = await ctx.params;
  const px = size === "512" ? 512 : 192;
  // Full-bleed for "maskable": the tile's own corners would be cut again by the OS mask.
  return new ImageResponse(
    // biome-ignore lint/performance/noImgElement: ImageResponse renders plain img, not next/image
    <img src={ICON} width={px} height={px} alt="" />,
    { width: px, height: px },
  );
}
