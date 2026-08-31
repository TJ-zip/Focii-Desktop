#!/usr/bin/env node
/**
 * Verifies -- or with --write, regenerates -- every asset derived from the
 * Focii mark.
 *
 * Why this exists: a favicon has to be a static file at a fixed path, so
 * src/app/icon.svg cannot import src/lib/mark.ts. Same for the downloadable
 * brand assets. That leaves several copies of the same artwork with nothing
 * keeping them honest. This script is that something.
 *
 * Two independent checks:
 *
 *   1. The path data in mark.ts must hash to PATH_SHA256 below. Those hashes
 *      were taken from the original artwork. This catches corruption of the
 *      source itself -- the case where every derived file dutifully agrees
 *      with a mark.ts that is already wrong.
 *
 *   2. Every derived file must equal what this script generates from mark.ts.
 *      This catches drift in the copies.
 *
 * mark.ts is read as text and the strings pulled out with a regex rather than
 * imported. Importing TypeScript from a bare node script means a loader, a
 * build step, or tsx as a dependency; none of that is worth it to read three
 * string literals, and a regex cannot execute anything the file might do.
 *
 * Usage:
 *   node scripts/check-brand-assets.mjs           check, exit 1 on mismatch
 *   node scripts/check-brand-assets.mjs --write    regenerate
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const WRITE = process.argv.includes("--write");

/* sha256 of each contour, in order, taken from the original artwork. */
const PATH_SHA256 = [
  "fe84674548aed3551bb3530f352d203b8317fad2eec457c7796ff8431439391c",
  "0714b50d3569fd0c3b873d72f4d8e4f053c7df156a80f8d738df3955d9b6d6fa",
  "94beda740882a53a0a4d501037624b9be5eb151466cbae25de1522f776807f86",
];

/* Geometry, mirrored from mark.ts. Kept as literals so that a change to
 * mark.ts without a corresponding regeneration shows up as a diff rather
 * than being silently absorbed. */
const VIEW_W = 888;
const VIEW_H = 750;
const SIZE = 512;
const SCALE = 0.494583;
const TX = 39.3484;
const TY = 67.9569;
const STROKE = 15.164;
const BG = "#050505";
const FG = "#e8e4e0";
const RED = "#b1121b";

const BANNER =
  "<!-- Generated from src/lib/mark.ts by scripts/check-brand-assets.mjs.\n" +
  "     Do not edit by hand; run `node scripts/check-brand-assets.mjs --write`. -->\n";

function readPaths() {
  const src = readFileSync(join(ROOT, "src/lib/mark.ts"), "utf8");
  const block = src.match(/export const MARK_PATHS = \[([\s\S]*?)\n\];/);
  if (!block) {
    throw new Error("could not locate MARK_PATHS in src/lib/mark.ts");
  }
  const paths = [...block[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  if (paths.length !== PATH_SHA256.length) {
    throw new Error(
      `expected ${PATH_SHA256.length} contours, found ${paths.length}`,
    );
  }
  return paths;
}

function markSvg(paths) {
  const body = paths.map((d) => `<path d="${d}"/>`).join("\n  ");
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEW_W} ${VIEW_H}" ` +
    `width="${VIEW_W}" height="${VIEW_H}" role="img" aria-label="Focii">\n` +
    BANNER +
    `  <g fill="currentColor" fill-rule="nonzero">\n` +
    `  ${body}\n` +
    `  </g>\n` +
    `</svg>\n`
  );
}

function iconSvg(paths, fg, bg) {
  const body = paths.map((d) => `<path d="${d}"/>`).join("\n    ");
  const rect = bg
    ? `  <rect width="${SIZE}" height="${SIZE}" fill="${bg}"/>\n`
    : "";
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}" ` +
    `width="${SIZE}" height="${SIZE}" role="img" aria-label="Focii">\n` +
    BANNER +
    rect +
    `  <g transform="translate(${TX} ${TY}) scale(${SCALE})" fill="${fg}" ` +
    `fill-rule="nonzero" stroke="${fg}" stroke-width="${STROKE}" ` +
    `stroke-linejoin="round" stroke-linecap="round">\n` +
    `    ${body}\n` +
    `  </g>\n` +
    `</svg>\n`
  );
}

const paths = readPaths();

/* Check 1: the source artwork itself. */
let failures = 0;
paths.forEach((d, i) => {
  const got = createHash("sha256").update(d).digest("hex");
  if (got !== PATH_SHA256[i]) {
    console.error(
      `mark.ts contour ${i} does not match the original artwork\n` +
        `  expected sha256 ${PATH_SHA256[i]}\n` +
        `  got      sha256 ${got}\n` +
        `  length ${d.length}`,
    );
    failures += 1;
  }
});
if (failures > 0) {
  console.error(
    "\nThe path data in src/lib/mark.ts is not the Focii mark. Restore it " +
      "rather than updating the hashes, unless the artwork genuinely changed.",
  );
  process.exit(1);
}

/* Check 2: everything derived from it. */
const expected = {
  "public/brand/focii-mark.svg": markSvg(paths),
  "public/brand/focii-icon.svg": iconSvg(paths, FG, BG),
  "public/brand/focii-icon-red.svg": iconSvg(paths, RED, BG),
  "public/brand/focii-icon-transparent.svg": iconSvg(paths, FG, null),
  "src/app/icon.svg": iconSvg(paths, FG, BG),
};

for (const [rel, want] of Object.entries(expected)) {
  const abs = join(ROOT, rel);
  if (WRITE) {
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, want);
    console.log(`wrote ${rel}`);
    continue;
  }
  if (!existsSync(abs)) {
    console.error(`missing ${rel} -- run with --write`);
    failures += 1;
    continue;
  }
  if (readFileSync(abs, "utf8") !== want) {
    console.error(`${rel} differs from what mark.ts generates`);
    failures += 1;
  }
}

if (failures > 0) {
  console.error(
    `\n${failures} brand asset(s) out of date. ` +
      "Run: node scripts/check-brand-assets.mjs --write",
  );
  process.exit(1);
}

console.log(
  WRITE
    ? "brand assets regenerated"
    : `brand assets verified (${Object.keys(expected).length} files, 3 contours)`,
);
