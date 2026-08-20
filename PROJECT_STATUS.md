# PROJECT STATUS — soundscape

## Product objective
Personal Endel-inspired generative soundscape app. Four modes: Focus, Relax, Sleep, Pump. Finite loop-safe generative files instead of a real-time adaptive stream. Lifelong, platform-independent: PWA + offline-cached audio + regenerable-from-code masters. No subscription, no time limit.

## Current architecture
- **Next.js 16.3.0 (App Router) + TypeScript** app at repo root, deployable on Vercel (framework preset: Next.js, defaults).
- **Visualizer: zero-dependency Canvas 2D engine** (`src/components/Visualizer.tsx`) replicating the Endel Focus aesthetic from the user's screen-recording reference: near-black field, faint blueprint grid, breathing glyphs, vignette. Mode-aware palette/tempo.
- **Mode selector: horizontally scrollable snap bar** (replaced the 4 circular buttons). Scroll/swipe/wheel the bar; the label nearest center becomes active. Circular red center dot marks the selection point. Item centers measured via getBoundingClientRect relative to the track (NOT offsetLeft — offsetParent is the fixed .hud, which caused a left-shifted selection bug, fixed in PR #7). Mouse wheel steps one mode per gesture (non-passive listener, threshold 24, cooldown 280ms). Keyboard: arrows/Home/End on the radiogroup. prefers-reduced-motion honored.
- Audio generators: `generator/gen_soundscapes.py` (v1 all modes) and `generator/gen_focus_v2_trained.py` (**Focus v2, trained**, seed 207).
- CI: `.github/workflows/validate.yml` + `ci-report.yml` (as before).
- Planned: Vercel Blob audio hosting, dual-`<audio>` crossfade session player, PWA + Cache Storage for offline.

## Technology stack
Next.js 16.3.0, React 19, TypeScript 5.6, plain CSS + Canvas 2D (no Tailwind, no three.js). Python/numpy for audio synthesis. Node 22 in CI.

## Working features
- Endel-style generative visualizer, full-screen behind UI, per-mode character, reduced-motion static fallback, DPR-aware, resize-safe.
- Scrollable mode bar (no buttons, no squares/squircles): scroll-snap, center-select aligned to the red dot, mouse-wheel mode stepping, gradient edge fades, hidden scrollbar, keyboard accessible.
- v1.1 audio samples delivered via chat. **Sleep is LOCKED (seed 41) — user: "OUTSTANDING".**
- **Focus v2 "trained" (seed 207)** — parameters measured from the user's Endel Focus recording (minutes 1–8 analyzed, not the full 20): pulse 60.1 BPM, zero sharp transients (all soft envelopes), dynamics flattened to measured ratio 1.21, 25.9 s swell cycle, directional bass. Rendered sample verified at 60.1 BPM. Profile: `generator/endel_focus_profile.json`.

## Feedback captured
- Sleep v1.1: outstanding — do not change.
- Relax v1.1: failed — await reference tracks.
- Pump v1.1: nice but mediocre — await reference tracks.
- Focus v1: too ethereal, plucks distracting → **v2 trained render delivered, awaiting listen**. Bitstream analysis confirmed Endel Focus has zero sharp attacks, validating the pluck complaint.
- Visualizer: implemented from user's Endel screen recording (PR #5).
- Mode bar (2026-08-20 screen recording): active mode was the label LEFT of the red dot, and bar was click-only → both fixed in PR #7 (dot alignment + wheel scrolling).

## Current task
PR #7 (feature/mode-scroll-bar): mode-bar dot-alignment fix + wheel-to-shift-mode. CI green; awaiting user's visual check on the Vercel branch preview.

## Pending tasks
1. User feedback on Focus v2 trained sample → iterate.
2. Reference tracks for Relax/Pump → profile and regenerate.
3. Audio engine in app: dual-`<audio>` crossfade player, 3→12→75→12→75 focus session.
4. Vercel Blob store setup (docs/VERCEL_BLOB_GUIDE.md) + audio-manifest.json.
5. PWA: manifest, service worker, Cache Storage offline audio.
6. Long-form renders (12/75/90-min) via chunked synthesis.

## Known issues
- Sandbox: no ffmpeg/FLAC encoder, no pip installs, no network egress; binaries can't be pushed to GitHub. WAV used for delivery; FLAC mastering deferred.
- Endel reference is AAC in MP4; without a decoder, analysis is bitstream-level (bit allocation, global_gain, window flags). This yields tempo/attack/dynamics/cycle features but not spectral timbre. Timbre matching would need a decode-capable environment.

## Required environment variables
- BLOB_READ_WRITE_TOKEN (future; auto-injected by Vercel when Blob store connected; never committed).

## Deployment information
Vercel: import repo, framework preset **Next.js**, default build (`next build`). No env vars needed yet.

## Important architectural decisions
- Sleep generator seed 41 locked. Focus v2 trained seed 207 (canonical until user feedback).
- Trained-parameter approach: measure reference recordings via bitstream analysis, synthesize original audio from measured parameters. No Endel audio is ever reproduced or committed.
- Loop-safe tails; dual-player 8–15 s crossfades; 3-min Initiation plays once per session.
- FLAC master / WAV fallback; MP3 rejected (loop gap).
- Vercel-independent: PWA, offline cache, no Vercel-only APIs in app code.
- UI chrome: black/red, circles only — squares/squircles banned. Mode selector is a scrollable bar, not buttons (user request 2026-08-19). Selection point = red center dot; wheel/swipe/click/keyboard all supported (user request 2026-08-20).

## Last completed change
PR #7: mode-bar geometry fixed (getBoundingClientRect-based centering, 50% edge padding) so the active mode is the one over the red dot; mouse-wheel now shifts modes horizontally.
