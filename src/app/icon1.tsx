/**
 * The raster favicon.
 *
 * src/app/icon.svg is the primary one and is resolution-independent, which is
 * what you want for a tab icon. But SVG favicons are not universally
 * supported -- Safari in particular does not render them -- and a browser
 * that cannot read the only favicon offered shows no icon at all. That is the
 * failure this file exists to prevent.
 *
 * Both are declared. Browsers pick the format they understand, and the SVG is
 * emitted first so the ones that can use it still do.
 *
 * The numeric suffix is load-bearing: Next's icon convention uses it to
 * declare additional icons. A file named icon.tsx would collide with
 * icon.svg, since both claim the same route.
 *
 * Generated rather than committed as a binary so the artwork stays in exactly
 * one place -- src/lib/mark.ts -- and no stale raster can drift away from it.
 *
 * 32x32 because browsers upscale a small favicon more gracefully than this
 * mark survives being drawn small; the stroke weight in mark.ts was measured
 * against roughly this size.
 */
import { ImageResponse } from "next/og";
import { iconSvg, MARK_BG } from "@/lib/mark";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  /* The path data is ASCII, so Buffer round-trips it safely. */
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
