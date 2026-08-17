# PROJECT STATUS — soundscape

## Product objective
Personal Endel-inspired generative soundscape app. Four modes: Focus, Relax, Sleep, Pump. Finite loop-safe generative files instead of a real-time adaptive stream. Lifelong, platform-independent: PWA + offline-cached audio + regenerable-from-code masters. No subscription, no time limit.

## Current architecture
- **Next.js 16.3.0 (App Router) + TypeScript** app at repo root, deployable on Vercel (framework preset: Next.js, defaults).
- Audio generator: `generator/gen_soundscapes.py` (pure numpy + stdlib wave, deterministic seeds, loop-safe crossfaded tails).
- CI: `.github/workflows/validate.yml` (lint/typecheck/test skip-if-absent, mandatory build) + `ci-report.yml` (runs scripts listed in `ci-request.txt`, publishes `ci-reports/latest.md`, commits lockfile back).
- Planned: Three.js/R3F visuals (black/red, no squares/squircles), Vercel Blob audio hosting, PWA + Cache Storage for offline.

## Technology stack
Next.js 16.3.0, React 19, TypeScript 5.6, plain CSS (no Tailwind yet). Python/numpy for audio synthesis. Node 22 in CI.

## Working features
- App shell: breathing red orb, 4 circular mode buttons, focus-session structure readout. Static build passes (CI: typecheck PASS, build PASS — ci-reports/latest.md @ 7e740d2).
- v1.1 audio samples delivered via chat (WAV <10 MB each): sleep 109s, relax 109s, pump 74s. **Sleep is LOCKED (seed 41) — user: "OUTSTANDING".**

## Feedback captured
- Sleep v1.1: outstanding — do not change.
- Relax v1.1: failed — user couldn't relax. Await reference tracks.
- Pump v1.1: nice but mediocre — likely flat energy curve. Await reference tracks.
- Focus v1: too ethereal, plucks distracting; wants directional/spatial bass. v2 pending.

## Current task
User deploying repo to Vercel (preset: Next.js). User will supply reference audio samples per mode; agent will profile them programmatically (tempo, spectral balance, dynamics, stereo width) and regenerate Relax + Pump + Focus v2.

## Pending tasks
1. Verify user's Vercel deployment succeeds.
2. Receive + profile reference tracks; regenerate Relax/Pump/Focus v2.
3. Audio engine in app: dual-<audio> crossfade player, 3→12→75→12→75 focus session.
4. Vercel Blob store setup (guide: docs/VERCEL_BLOB_GUIDE.md) + audio-manifest.json.
5. Three.js/R3F visuals (ref: https://teja-for-ted-x-ecru.vercel.app/ — repo: TJ-zip/Teja-For-TedX — Next 16 + R3F + three 0.169 + Tailwind).
6. PWA: manifest, service worker, Cache Storage offline audio.
7. Long-form renders (12/75/90-min) via chunked synthesis.

## Known issues
- Sandbox: no ffmpeg/FLAC encoder, no pip installs, no network egress; binaries can't be pushed to GitHub. WAV used for delivery; FLAC mastering deferred.
- GitHub UI "unicorn" error seen by user on PR views (transient GitHub-side).

## Required environment variables
- BLOB_READ_WRITE_TOKEN (future; auto-injected by Vercel when Blob store connected; never committed).

## Deployment information
Vercel: import repo, framework preset **Next.js**, default build (`next build`). No env vars needed yet.

## Important architectural decisions
- Sleep generator seed 41 locked.
- Loop-safe tails; dual-player 8–15 s crossfades; 3-min Initiation plays once per session.
- FLAC master / WAV fallback; MP3 rejected (loop gap).
- Vercel-independent: PWA, offline cache, no Vercel-only APIs in app code; Blob is distribution only.
- UI: black/red, circles/organic shapes only — squares and squircles banned project-wide.

## Last completed change
PR #3 merged (681ec2f): Next.js app shell + validate/ci-report workflows; CI green (typecheck+build); lockfile generated and committed by CI.
