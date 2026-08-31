/**
 * The iOS home-screen icon.
 *
 * iOS ignores SVG for apple-touch-icon, so unlike the favicon this one has to
 * be a raster. It is generated at build time from src/lib/mark.ts instead of
 * being committed as a PNG, so the artwork still lives in exactly one place
 * and a change to the mark cannot leave a stale binary behind.
 *
 * next/og ships with Next, so this costs no new dependency.
 *
 * Two Satori constraints shape the markup below, both of which produce build
 * failures rather than bad output, which is at least honest:
 *   - it does not reliably render raw <svg> children, so the mark is passed as
 *     a base64 data URI on an <img>, which is the documented route;
 *   - every wrapper needs an explicit display:flex.
 */
import { ImageResponse } from "next/og";
import { iconSvg, MARK_BG } from "@/lib/mark";

/* 180 is the size current iOS asks for; smaller devices downscale it. */
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  /* Latin-1 throughout -- the path data is ASCII -- so Buffer is safe here. */
  const dataUri = `data:image/svg+xml;base64,${Buffer.from(iconSvg()).toString(
    "base64",
  )}`;

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          width: "100%",
          height: "100%",
          background: MARK_BG,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={dataUri} width={size.width} height={size.height} alt="" />
      </div>
    ),
    { ...size },
  );
}
