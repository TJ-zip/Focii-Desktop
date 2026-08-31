#!/usr/bin/env node
/**
 * Asserts that the icon routes actually exist in the build output.
 *
 * Next serves src/app/icon.svg and src/app/apple-icon.tsx by file convention:
 * no import, no registration, nothing in layout.tsx. That is convenient right
 * up until a rename, a moved directory or a framework upgrade quietly stops it
 * working -- and the failure mode is a missing favicon, which nobody notices
 * in review and which a green build does not catch.
 *
 * So the build gets asked directly. Run this after `next build`.
 *
 * Matching is done on substrings of the route manifest rather than exact keys,
 * because the manifest's shape is a Next internal and has changed between
 * versions. The substrings are specific enough to mean something and loose
 * enough to survive a minor upgrade. If the manifest is missing entirely the
 * script falls back to looking at the emitted server directory.
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const NEXT = join(ROOT, ".next");

/* Route fragment -> what it is, for the failure message. */
const EXPECTED = [
  ["icon.svg", "favicon (src/app/icon.svg)"],
  ["apple-icon", "iOS home-screen icon (src/app/apple-icon.tsx)"],
];

if (!existsSync(NEXT)) {
  console.error(".next not found -- run `npm run build` first");
  process.exit(1);
}

/* Gather every string that could name a route, from whichever sources exist. */
let haystack = "";
const manifests = [
  "app-path-routes-manifest.json",
  "routes-manifest.json",
  "prerender-manifest.json",
];
const seen = [];
for (const name of manifests) {
  const p = join(NEXT, name);
  if (existsSync(p)) {
    haystack += readFileSync(p, "utf8");
    seen.push(name);
  }
}

/* Fallback: the emitted app directory itself. */
const appDir = join(NEXT, "server", "app");
if (existsSync(appDir)) {
  const walk = (dir, depth = 0) => {
    if (depth > 4) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      haystack += `${entry.name}\n`;
      if (entry.isDirectory()) walk(join(dir, entry.name), depth + 1);
    }
  };
  walk(appDir);
  seen.push("server/app/");
}

if (seen.length === 0) {
  console.error("no route manifests or server output found under .next");
  process.exit(1);
}

let failures = 0;
for (const [fragment, label] of EXPECTED) {
  if (haystack.includes(fragment)) {
    console.log(`ok   ${label}`);
  } else {
    console.error(`MISSING  ${label} -- no route matching "${fragment}"`);
    failures += 1;
  }
}

console.log(`(searched: ${seen.join(", ")})`);

if (failures > 0) {
  console.error(
    `\n${failures} icon route(s) absent from the build. Next serves these by ` +
      "file convention, so check the filenames and their location in src/app/.",
  );
  process.exit(1);
}
