# PROJECT STATUS — soundscape

## Product objective
Personal Endel-inspired generative soundscape app. Four modes: Focus, Relax, Sleep, Pump. Finite loop-safe generative files instead of a real-time adaptive stream. Lifelong, platform-independent: PWA + offline-cached audio + regenerable-from-code masters. No subscription, no time limit.

## Current architecture
- **Next.js 16.3.0 (App Router) + TypeScript** app at repo root, deployable on Vercel (framework preset: Next.js, defaults).
- **Visualizer: zero-dependency Canvas 2D engine** (`src/components/Visualizer.tsx`) replicating the Endel Focus aesthetic from the user's screen-recording reference: near-black field, faint blueprint grid, breathing glyphs (plus-crosses, hollow squares, tick pairs, flare streaks, dust points) spawning center-biased on grid intersections, occasional roaming grid frame, vignette. Mode-aware palette/tempo. Decision: Canvas 2D instead of Three.js/R3F — the reference visual is flat 2D; canvas gives identical look, no new deps, better mobile perf. Three.js remains an option for future 3D.
- Audio generator: `generator/gen_soundscapes.py` (pure numpy + stdlib wave, deterministic seeds, loop-safe crossfaded tails).
- CI: `.github/workflows/validate.yml` (lint/typecheck/test skip-if-absent, mandatory build) + `ci-report.yml` (runs scripts listed in `ci-request.txt`, publishes `ci-reports/latest.md`, commits lockfile back).
- Planned: Vercel Blob audio hosting, dual-<audio> crossfade session player, PWA + Cache Storage for offline.

## Technology stack
Next.js 16.3.0, React 19, TypeScript 5.6, plain CSS + Canvas 2D (no Tailwind, no three.js). Python/numpy for audio synthesis. Node 22 in CI.

## Working features
- Endel-style generative visualizer, full-screen behind UI, per-mode character (focus/relax/sleep/pump), prefers-reduced-motion static fallback, DPR-aware, resize-safe.
- 4 circular mode buttons (squares/squircles banned in UI chrome; the square *glyphs inside the visualizer* are part of the requested Endel reference aesthetic, per user's screen recording).
- v1.1 audio samples delivered via chat (WAV <10 MB each): sleep 109s, relax 109s, pump 74s. **Sleep is LOCKED (seed 41) — user: "OUTSTANDING".**

## Feedback captured
- Sleep v1.1: outstanding — do not change.
- Relax v1.1: failed — user couldn't relax. Await reference tracks.
- Pump v1.1: nice but mediocre — likely flat energy curve. Await reference tracks.
- Focus v1: too ethereal, plucks distracting; wants directional/spatial bass. v2 pending.
- Visualizer reference: user's screen recording of Endel Focus (grid + glowing minimal glyphs). Implemented in PR #5.

## Current task
User is testing the visualizer (PR #5 preview). Next: user feedback on visuals, then audio engine + reference-track profiling for Relax/Pump/Focus v2.

## Pending tasks
1. User visual feedback → iterate visualizer.
2. Verify user's Vercel deployment succeeds.
3. Receive + profile reference tracks; regenerate Relax/Pump/Focus v2.
4. Audio engine in app: dual-<audio> crossfade player, 3→12→75→12→75 focus session.
5. Vercel Blob store setup (guide: docs/VERCEL_BLOB_GUIDE.md) + audio-manifest.json.
6. PWA: manifest, service worker, Cache Storage offline audio.
7. Long-form renders (12/75/90-min) via chunked synthesis.

## Known issues
- Sandbox: no ffmpeg/FLAC encoder, no pip installs, no network egress; binaries can't be pushed to GitHub. WAV used for delivery; FLAC mastering deferred.

## Required environment variables
- BLOB_READ_WRITE_TOKEN (future; auto-injected by Vercel when Blob store connected; never committed).

## Deployment information
Vercel: import repo, framework preset **Next.js**, default build (`next build`). No env vars needed yet.

## Important architectural decisions
- Sleep generator seed 41 locked.
- Loop-safe tails; dual-player 8–15 s crossfades; 3-min Initiation plays once per session.
- FLAC master / WAV fallback; MP3 rejected (loop gap).
- Vercel-independent: PWA, offline cache, no Vercel-only APIs in app code; Blob is distribution only.
- UI chrome: black/red, circles only — squares/squircles banned. Visualizer glyphs follow the Endel reference (grid, squares as *content*, not UI).
- Visualizer: Canvas 2D, zero deps (Three.js deferred).

## Last completed change
PR #5: Endel-style generative grid visualizer (Canvas 2D), full-screen behind circular mode UI, reduced-motion fallback.
