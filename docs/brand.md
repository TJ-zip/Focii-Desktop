# Brand assets

The Focii mark is a stylised script capital F: three closed cubic-Bezier
contours, drawn as artwork rather than set in a font.

## Where it lives

`src/lib/mark.ts` is the only place the path data exists as source. Everything
else is derived from it.

| File | What it is |
| --- | --- |
| `src/lib/mark.ts` | The paths, the palette, the icon geometry. Source of truth. |
| `src/components/Wordmark.tsx` | The wordmark in the app chrome. Imports the paths. |
| `src/app/icon.svg` | Favicon. Served at `/icon.svg` by file convention. |
| `src/app/apple-icon.tsx` | iOS home-screen icon, rasterised at build by `next/og`. |
| `public/brand/focii-mark.svg` | The F alone, `currentColor`, transparent, artwork units. |
| `public/brand/focii-icon.svg` | Square icon, light mark on `#050505`. |
| `public/brand/focii-icon-red.svg` | Square icon, `#b1121b` mark on `#050505`. |
| `public/brand/focii-icon-transparent.svg` | Square icon, no ground. |

Anything under `public/brand/` is fetchable from a deployment, e.g.
`/brand/focii-icon.svg`.

Use `focii-mark.svg` when you want the mark to take its colour from context —
it paints in `currentColor`, so it inherits from the surrounding text and
needs no per-colour copy. Use one of the square icons where something wants a
self-contained, correctly padded avatar or tile.

## Regenerating

```
node scripts/check-brand-assets.mjs --write
```

Never edit the generated SVGs by hand. `scripts/check-brand-assets.mjs` runs
in CI without `--write` and fails the build if any of them stops matching
what `mark.ts` generates.

That script checks two separate things:

1. **The source is intact.** Each contour must hash to a pinned sha256 taken
   from the original artwork. This catches the case where every derived file
   agrees perfectly with a `mark.ts` that has itself been corrupted.
2. **The copies match.** It regenerates all five derived files and diffs them
   against what is committed.

If the artwork genuinely changes, update the hashes in that script — but only
then, and deliberately.

`scripts/check-icon-routes.mjs` runs after `next build` and asserts that
`/icon.svg` and `/apple-icon` actually exist in the output. Both are wired up
by Next's file conventions alone, with nothing in `layout.tsx` referring to
them, so without this check a rename or an upgrade could silently drop the
favicon and no build would complain.

## Why the icon is padded and thickened

Two numbers decide whether the mark reads as "Focii" at 28px or as a smudge.

**Padding 0.12.** Avatar slots crop to a circle, and the swash tips are the
first casualty. Ink lost to the inscribed circle, measured:

| padding | ink px | clipped | % lost |
| --- | --- | --- | --- |
| 0.17 | 17,989 | 0 | 0.00% |
| **0.12** | **23,040** | **0** | **0.00%** |
| 0.09 | 26,352 | 87 | 0.33% |
| 0.06 | 29,890 | 493 | 1.65% |
| 0.04 | 32,368 | 1,791 | 5.53% |
| 0.02 | 34,947 | 3,877 | 11.09% |

0.12 is the largest the mark can be while losing nothing. Tightening it to
0.09 to "use the space better" starts cutting the swash.

**Stroke 15.164 user units, applied on top of the fill.** The bare glyph is
about 1.09px wide at a 28px avatar, which visually disappears:

| dilation | stroke px @512 | px @28 |
| --- | --- | --- |
| none | 23 | 1.26 |
| 15 | 28 | 1.53 |
| **31** | **33** | **~1.8** |
| 35 | 35 | 1.91 |
| 45 | 39 | 2.13 — the loop's counter closes and the bar blobs into the stem |

~1.8px is the point where the strokes hold together but the counter stays
open.

**Centring.** The mark is centred on its *ink* bounding box —
x 44.67..831.43, y 54.70..705.71 — not on the 888x750 artwork box, which
carries dead space above and below the glyph. Centring on the artwork box
puts the F visibly high and to the left.

## Two things to know before changing it

The contours **must** be filled with the `nonzero` rule. They overlap where
the bar crosses the stem; `evenodd` punches a hole there instead of unioning
them.

The offline PNG renderer thickens with a square `MaxFilter`, while the SVG
does it with a round-joined stroke — a square structuring element versus a
disc. The SVG is therefore a shade lighter on diagonals. Both land at roughly
the same weight, and the difference is not visible at icon sizes, but they
are not pixel-identical and are not meant to be.

## Palette

Mirrored from `globals.css` so the icons need no stylesheet:

| Token | Value |
| --- | --- |
| `--bg` | `#050505` |
| `--red` | `#b1121b` |
| `--red-dim` | `#5c0a0f` |
| `--fg` | `#e8e4e0` |
| `--fg-dim` | `#7a7370` |
