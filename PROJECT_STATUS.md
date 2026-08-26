# PROJECT STATUS — soundscape

## Product objective
Personal Endel-inspired generative soundscape app. Four modes: Focus, Relax, Sleep, Pump. Lifelong, platform-independent: PWA + offline-cached audio + regenerable-from-code masters. No subscription, no time limit.

## Current architecture
- **Next.js 16.3.0 (App Router) + TypeScript** app at repo root, deployable on Vercel (framework preset: Next.js, defaults).
- **Visualizer: zero-dependency Canvas 2D engine** (`src/components/Visualizer.tsx`) replicating the Endel Focus aesthetic from the user's screen-recording reference: near-black field, faint blueprint grid, breathing glyphs (plus-crosses, hollow squares, tick pairs, flare streaks, dust points) spawning center-biased on grid intersections, occasional roaming grid frame, vignette. Mode-aware palette/tempo. Decision: Canvas 2D instead of Three.js/R3F — the reference visual is flat 2D; canvas gives identical look, no new deps, better mobile perf.
- **Mode selector: horizontally scrollable snap bar** (replaced the 4 circular buttons). Scroll/swipe/wheel/click/keyboard; the label nearest centre becomes active. Circular red dot marks the selection point. Item centres measured via `getBoundingClientRect` relative to the track — NOT `offsetLeft`, which was measured against a positioned ancestor and skewed selection one item left. Wheel steps one mode per gesture (non-passive listener, accumulation threshold 24, cooldown 280 ms). `prefers-reduced-motion` honoured.
- Audio generators: `generator/gen_soundscapes.py` (v1, all modes) and `generator/gen_focus_v2_trained.py` (**Focus v2, trained**, seed 207).
- CI: `.github/workflows/validate.yml` (lint/typecheck/test skip-if-absent, mandatory build) + `ci-report.yml` (runs scripts listed in `ci-request.txt`, publishes `ci-reports/latest.md`, commits lockfile back).
- Planned: object-storage audio hosting, dual-`<audio>` crossfade session player, PWA + Cache Storage for offline.

## Technology stack
Next.js 16.3.0, React 19, TypeScript 5.6, plain CSS + Canvas 2D (no Tailwind, no three.js). Python/numpy for audio synthesis. Node 22 in CI.

## Working features
- Endel-style generative visualizer — **user verdict: "FANTABULOUS"** (PR #5 merged). Per-mode tuning v2 (PR #6 merged): focus faster (7.5 s breath, denser spawns), sleep slower (30 s breath, sparse long-lived glyphs — user loved the dimming), pump with brighter grid lines (alpha 0.13) + brightness 1.25. Reduced-motion static fallback, DPR-aware, resize-safe.
- Page scrolls again on short viewports: only the canvas is `position: fixed`; wordmark and HUD sit in normal flow (PR #6).
- Scrollable mode bar (no buttons, no squares/squircles): scroll-snap, centre-select aligned to the red dot, mouse-wheel mode stepping, gradient edge fades, hidden scrollbar, keyboard accessible.
- v1.1 audio samples delivered via chat (WAV <10 MB each): sleep 109 s, relax 109 s, pump 74 s. **Sleep is LOCKED (seed 41) — user: "OUTSTANDING".**
- **Focus v2 "trained" (seed 207)** — parameters measured from the user's Endel Focus recording (minutes 1–8 analysed, not the full 20): pulse 60.1 BPM, zero sharp transients (all soft envelopes), dynamics flattened to measured ratio 1.21, 25.9 s swell cycle, directional bass. Rendered sample verified at 60.1 BPM. Profile: `generator/endel_focus_profile.json`.

## Feedback captured
- Visualizer v1: FANTABULOUS. Requested faster focus, slower sleep, brighter pump lines — done in PR #6. Sleep light-dimming explicitly praised.
- Sleep audio v1.1: outstanding — do not change.
- Relax audio v1.1: failed — user couldn't relax. Await reference tracks.
- Pump audio v1.1: nice but mediocre — likely flat energy curve. Await reference tracks.
- Focus audio v1: too ethereal, plucks distracting; wants directional/spatial bass → **v2 trained render delivered, awaiting listen**. Bitstream analysis confirmed the Endel reference has zero sharp attacks, validating the pluck complaint.
- Mode bar (2026-08-20 screen recording): active mode was the label LEFT of the red dot, and the bar was click-only → both fixed (dot alignment + wheel scrolling).

## Current task
Land the rebased mode-bar work (PR #7 conflicted with PR #6 and was rebased onto `main`), then build the generative audio engine.

## Pending tasks
1. Generative audio engine (real-time, in-app).
2. **Session engine: the 3→12→75→12→75 structure (3-min Initiation once, then 12-min ↔ 75-min loop) applies to ALL FOUR MODES, not just Focus** (user decision 2026-08-18). Dual-`<audio>` crossfade player, 8–15 s crossfades.
3. Receive + profile reference tracks; regenerate Relax/Pump.
4. Object-storage setup + `audio-manifest.json` (storage-agnostic).
5. PWA: manifest, service worker, Cache Storage offline audio.
6. Long-form renders per mode (3/12/75-min) via chunked synthesis.

## Known issues
- Authoring sandbox: no ffmpeg/FLAC encoder, no pip installs, no network egress; binaries can't be pushed to GitHub. WAV used for delivery; FLAC mastering deferred. All build/lint/type claims must come from a GitHub Actions run.
- Endel reference is AAC in MP4; without a decoder, analysis is bitstream-level (bit allocation, `global_gain`, window flags). This yields tempo/attack/dynamics/cycle features but not spectral timbre. Timbre matching would need a decode-capable environment.

## Required environment variables
- None currently required to build or deploy.
- Future object storage (names only, never values): `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `NEXT_PUBLIC_AUDIO_BASE_URL`.

## Deployment information
Vercel: connected to repo (preset Next.js, defaults); preview deployments active on PRs. No env vars needed yet.

## Important architectural decisions
- Sleep generator seed 41 locked. Focus v2 trained seed 207 (canonical until user feedback).
- Trained-parameter approach: measure reference recordings via bitstream analysis, synthesise original audio from measured parameters. No Endel audio is ever reproduced or committed.
- **3→12→75 session structure applies to all modes** (Initiation plays once per session; 12 and 75 alternate forever). Loop-safe tails; dual-player 8–15 s crossfades.
- FLAC master / WAV fallback; MP3 rejected (loop gap).
- Vercel-independent: PWA, offline cache, no Vercel-only APIs in app code; object storage is distribution only.
- UI chrome: black/red, circles only — squares/squircles banned. Visualizer glyphs follow the Endel reference (grid, squares as *content*, not UI). Mode selector is a scrollable bar, not buttons (user request 2026-08-19); selection point = red centre dot (user request 2026-08-20).
- Visualizer: Canvas 2D, zero deps (Three.js deferred).

## Last completed change
PR #6 merged (visualizer tuning + page-scroll fix). PR #7 rebased onto the result as `feature/mode-scroll-bar-rebased` because both PRs rewrote `globals.css`.
