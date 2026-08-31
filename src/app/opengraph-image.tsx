/**
 * The link preview card.
 *
 * Rendered at 1200x630, the size every scraper crops toward. Built from
 * src/lib/mark.ts through next/og for the same reason as apple-icon.tsx: the
 * artwork stays in one place and no binary can go stale behind it.
 *
 * The mark's own SVG paints a #050505 square behind itself, and the canvas
 * here is the same colour, so the two merge and the F reads as if it were
 * drawn directly on the card. That is why no transparent variant is needed.
 *
 * Satori constraints, same as the touch icon: the mark goes in as a base64
 * data URI on an <img> because raw <svg> children are unreliable, and every
 * wrapper carries an explicit display:flex. Spacing uses margin rather than
 * gap, and dimmed text uses a literal colour rather than opacity, both to
 * stay on the most conservative part of Satori's CSS support.
 */
import { ImageResponse } from "next/og";
import { iconSvg, MARK_BG, MARK_FG } from "@/lib/mark";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt =
  "Focii \u2014 generative soundscapes for Focus, Relax, Sleep and Pump.";

/* A braced string literal, not a JSX text node: escapes are only interpreted
 * inside string literals, and as bare JSX text this would print the
 * backslashes verbatim. */
const TAGLINE = "Focus \u00b7 Relax \u00b7 Sleep \u00b7 Pump";

export default function OpengraphImage() {
  /* The path data is ASCII, so Buffer round-trips it safely. */
  const dataUri = `data:image/svg+xml;base64,${Buffer.from(iconSvg()).toString(
    "base64",
  )}`;

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: "100%",
          height: "100%",
          background: MARK_BG,
          color: MARK_FG,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={dataUri}
          width={320}
          height={320}
          alt=""
          style={{ marginRight: 48 }}
        />

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 132, letterSpacing: -3 }}>
            Focii
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 34,
              marginTop: 12,
              /* Literal rather than opacity: fewer moving parts in Satori. */
              color: "#9a9490",
            }}
          >
            {TAGLINE}
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
