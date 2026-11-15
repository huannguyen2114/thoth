import { ImageResponse } from "next/og";

const SIZES = ["192", "512"] as const;

export function generateStaticParams() {
  return SIZES.map((size) => ({ size }));
}

/** Placeholder mark until a logo exists: serif "T" in ink on surface-100 (Hearth Logo rule). */
export async function GET(_req: Request, ctx: RouteContext<"/pwa-icon/[size]">) {
  const { size } = await ctx.params;
  const px = size === "512" ? 512 : 192;
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#faf7f2",
        color: "#2a2520",
        fontSize: px * 0.6,
        fontFamily: "Georgia, serif",
      }}
    >
      T
    </div>,
    { width: px, height: px },
  );
}
