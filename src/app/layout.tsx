import type { Metadata, Viewport } from "next";
import "./globals.css";

const DESCRIPTION =
  "Multiple modes of focus \u2014 generative soundscapes for Focus, Relax, Sleep and Pump.";

/**
 * Absolute origin for generated metadata URLs.
 *
 * metadataBase is not optional once opengraph-image.tsx exists: Next has to
 * turn the generated image into an absolute URL, and with no base it falls
 * back to localhost, silently shipping unreachable image URLs to production.
 *
 * VERCEL_PROJECT_PRODUCTION_URL is set by Vercel during the build and holds
 * the bare host with no scheme, so nothing is hardcoded here and no manual
 * configuration is required. Off Vercel -- CI, local dev -- it is unset and
 * localhost is the right answer anyway.
 */
const siteOrigin = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteOrigin),
  title: "Focii",
  description: DESCRIPTION,
  applicationName: "Focii",
  openGraph: {
    type: "website",
    siteName: "Focii",
    title: "Focii",
    description: DESCRIPTION,
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: "Focii",
    description: DESCRIPTION,
  },
};

export const viewport: Viewport = {
  themeColor: "#050505",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
