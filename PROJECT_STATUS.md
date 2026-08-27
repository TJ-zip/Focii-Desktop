# PROJECT STATUS — soundscape

## Product objective
Personal Endel-inspired generative soundscape app. Four modes: Focus, Relax, Sleep, Pump. Lifelong, platform-independent: PWA + offline-cached audio + regenerable-from-code masters. No subscription, no time limit.

## Current architecture
- **Next.js 16.3.0 (App Router) + TypeScript** app at repo root, deployable on Vercel (framework preset: Next.js, defaults).
- **Real-time generative audio engine** (`src/audio/engine.ts`, `src/audio/presets.ts`) — merged in PR #9. Pure Web Audio synthesis: nothing is streamed, downloaded or stored, and a session never repeats. Lookahead scheduler (250 ms tick, 1.5 s horizon) against `ctx.currentTime`; a fresh oscillator per beat so every beat is phase-identical; all envelopes are `setValueCurveAtTime` curves (gaussian for pulses, raised-cosine for pads) so there is no instantaneous gain step anywhere. Per layer: sub drone at `root/2` plus a panned 1.5× harmonic (directional bass, fundamental stays centred), per-beat pulse, exponentially-spaced pads, looped decorrelated noise bed. Master through a `DynamicsCompressor` (threshold −24, ratio 3, attack 0.25 s, release 1.2 s) approximating the offline `dynFlatten` stage.
- **Layer gain staging (do not collapse these two nodes).** Each layer has `bus` (carries the swell modulation) and `out` (carries the fade). They must stay separate: connecting a modulation source to an AudioParam *sums* with that param's scheduled value, so routing the swell into the fade param meant a fading layer settled at ±0.1 instead of 0 and disposal truncated a live waveform. That was the audible click on mode change.
- **Visualizer: zero-dependency Canvas 2D engine** (`src/components/Visualizer.tsx`) replicating the Endel Focus aesthetic: near-black field, faint blueprint grid, breathing glyphs (plus-crosses, hollow squares, tick pairs, flare streaks, dust points) spawning center-biased on grid intersections, occasional roaming grid frame, vignette. Mode-aware palette/tempo. Decision: Canvas 2D instead of Three.js/R3F — the reference visual is flat 2D; canvas gives identical look, no new deps, better mobile perf. **Not currently synced to the audio clock** — it runs its own `requestAnimationFrame` timeline with no knowledge of BPM.
- **Mode selector: horizontally scrollable snap bar** (replaced the 4 circular buttons). Scroll/swipe/wheel/click/keyboard; the label nearest centre becomes active. Circular red dot marks the selection point. Item centres measured via `getBoundingClientRect` relative to the track — NOT `offsetLeft`, which was measured against a positioned ancestor and skewed selection one item left. Wheel steps one mode per gesture (non-passive listener, accumulation threshold 24, cooldown 280 ms). `prefers-reduced-motion` honoured.
- Offline audio generators: `generator/gen_soundscapes.py` (v1, all modes) and `generator/gen_focus_v2_trained.py` (**Focus v2, trained**, seed 207).
- CI: `.github/workflows/validate.yml` (lint/typecheck/test skip-if-absent, mandatory build) + `ci-report.yml` (runs scripts listed in `ci-request.txt`, publishes `ci-reports/latest.md`, commits lockfile back).
- Planned: PWA + Cache Storage for offline. Object storage is now **optional rather than load-bearing** — real-time synthesis means it is only needed for locked masters such as Sleep seed 41.

## Technology stack
Next.js 16.3.0, React 19, TypeScript 5.6, plain CSS + Canvas 2D + Web Audio (no Tailwind, no three.js, no audio libraries). Python/numpy for offline synthesis. Node 22 in CI.

## Working features
- **Real-time generative audio engine — browser playback confirmed by the author (2026-08-27).** Verified in Firefox on the preview deployment: session clock advances; the Initiation → Transition boundary fires at 180 s; the clock survives a mode change; Pump's beat rate is audibly ~2× Focus's; stable for 10+ minutes with no degradation; no console errors originating from application code.
- Endel-style generative visualizer — **user verdict: "FANTABULOUS"** (PR #5 merged). Per-mode tuning v2 (PR #6 merged): focus faster (7.5 s breath, denser spawns), sleep slower (30 s breath, sparse long-lived glyphs — user loved the dimming), pump with brighter grid lines (alpha 0.13) + brightness 1.25. Reduced-motion static fallback, DPR-aware, resize-safe.
- Page scrolls again on short viewports: only the canvas is `position: fixed`; wordmark and HUD sit in normal flow (PR #6).
- Scrollable mode bar (no buttons, no squares/squircles): scroll-snap, centre-select aligned to the red dot, mouse-wheel mode stepping, gradient edge fades, hidden scrollbar, keyboard accessible.
- v1.1 audio samples delivered via chat (WAV <10 MB each): sleep 109 s, relax 109 s, pump 74 s. **Sleep is LOCKED (seed 41) — user: "OUTSTANDING".**
- **Focus v2 "trained" (seed 207)** — parameters measured from the user's Endel Focus recording (minutes 1–8 analysed, not the full 20): pulse 60.1 BPM, zero sharp transients (all soft envelopes), dynamics flattened to measured ratio 1.21, 25.9 s swell cycle, directional bass. Profile: `generator/endel_focus_profile.json`.

## Feedback captured
- **Generative engine playback: "FANTABULOUS", "I can't stop listening."** Ran 10+ minutes without problems.
- Click on mode change: the user *likes* it and reads it as "the mode has shifted and is now set in stone", but wants it **delayed** rather than simultaneous with the switch. Diagnosed as a truncation artefact, so it is being removed as a bug and re-added deliberately at the end of the crossfade.
- Wants the play/pause button removed entirely in favour of keyboard control and a Command centre.
- Visualizer v1: FANTABULOUS. Requested faster focus, slower sleep, brighter pump lines — done in PR #6. Sleep light-dimming explicitly praised. Now wants Focus and Pump faster still, **and agreed to beat-syncing the visualizer to the audio.**
- Sleep audio v1.1: outstanding — do not change.
- Relax audio v1.1: failed — user couldn't relax. Await reference tracks.
- Pump audio v1.1: nice but mediocre — likely flat energy curve. Await reference tracks.
- Focus audio v1: too ethereal, plucks distracting; wants directional/spatial bass → addressed by the v2 trained parameters, now carried into the real-time engine.
- Mode bar (2026-08-20 screen recording): active mode was the label LEFT of the red dot, and the bar was click-only → both fixed (dot alignment + wheel scrolling).

## Current task
UI programme, agreed 2026-08-27. Small independently-revertable PRs, in order:

| PR | Contents | Status |
|---|---|---|
| A | Crossfade residual fix + deliberate settle tick | **in review** |
| B | Remove play button; global key bindings; Command button + centre (Shift+C) | next |
| C | Hint state machine emanating from the red dot | queued |
| D | Two-clock model: session clock + red mode clock rolling to 0:00, mode-arc re-ramp | queued |
| E | Session measurement pane (Shift+M) + History, `localStorage`, CSV export | queued |
| F | Philosophy page (classical conditioning framing) | last |
| G | Visualizer speed + beat-sync to the engine | queued |

## Pending tasks
1. Receive + profile reference tracks; regenerate Relax/Pump.
2. **Rewrite `generator/engine_ref.py`.** It is referenced by PR #9's body and by `src/audio/presets.ts` line 5 but is absent from the repo — it lived only in a chat sandbox that was lost. Every measured figure in PR #9 (focus 60.11 BPM/+0.02%, pump 121.61/−0.32%, 0 sharp attacks, dyn_ratio 1.43/1.66/1.35/1.35) came from it and is currently **unreproducible**. A rewrite will produce slightly different numbers; that is expected and must be documented rather than reconciled.
3. PWA: manifest, service worker, Cache Storage offline audio.
4. Object-storage setup + `audio-manifest.json` (storage-agnostic) — optional, for locked masters only.
5. Long-form renders per mode (3/12/75-min) via chunked synthesis.

## Known issues
- `generator/engine_ref.py` missing — see pending task 2.
- **Spacebar starts playback but cannot stop it.** `disabled={starting}` on the transport button blurs the focused element when React applies the attribute, so focus never returns to the button. Dissolves by construction in PR B, which binds keys on `window` instead.
- The `presets.ts` comment describing the Deep sine as a "~110 min ultradian" cycle is wrong; it spans the 4500 s (75 min) block.
- Focus sits at `dyn_ratio` 1.43 against Endel's measured 1.21. The only lever that closes the gap is cutting pulse gain, which would regress the "too ethereal" v1 complaint. **Deliberate deviation, documented rather than matched.**
- Authoring sandbox: no ffmpeg/FLAC encoder, no pip installs, no network egress; binaries can't be pushed to GitHub. WAV used for delivery; FLAC mastering deferred. All build/lint/type claims must come from a GitHub Actions run.
- Endel reference is AAC in MP4; without a decoder, analysis is bitstream-level (bit allocation, `global_gain`, window flags). This yields tempo/attack/dynamics/cycle features but not spectral timbre.
- Browser coverage: playback confirmed in Firefox only. Chromium and WebKit unverified.

## Required environment variables
- None. The app makes no network calls at runtime and needs no configuration to build or deploy.
- Session history (PR E) will use `localStorage`, deliberately **not** a hosted database — a hosted dependency would contradict the lifelong/Vercel-independent goal for a feature that only stores "pump, 41 minutes". CSV export is a client-side `Blob` download, so it works on Vercel, on localhost and offline.
- Future object storage (names only, never values): `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `NEXT_PUBLIC_AUDIO_BASE_URL`.

## Deployment information
Vercel: connected to repo (preset Next.js, defaults); preview deployments active on PRs. Team/org slug `code-lite`. No env vars needed.

## Important architectural decisions
- Sleep generator seed 41 locked. Focus v2 trained seed 207 (canonical until user feedback).
- Trained-parameter approach: measure reference recordings via bitstream analysis, synthesise original audio from measured parameters. No Endel audio is ever reproduced or committed.
- **3→12→75 session structure applies to all modes** (Initiation plays once per session; 12 and 75 alternate forever).
- **`quantizeRoot()` is load-bearing.** The sub drone must complete an *even* number of cycles per beat — even, so the 1.5× harmonic also lands whole — otherwise its phase drifts against the beat grid, reinforcing some beats and cancelling others. This measurably shifted Pump's tempo by −3.32%. Do not "simplify" the root to a round number.
- One purpose per AudioParam — see the layer gain staging note above.
- Vercel-independent: PWA, offline cache, no Vercel-only APIs in app code; object storage is distribution only.
- UI chrome: black/red, circles only — squares/squircles banned. Visualizer glyphs follow the Endel reference (grid, squares as *content*, not UI). Mode selector is a scrollable bar, not buttons; selection point = red centre dot.
- Visualizer: Canvas 2D, zero deps (Three.js deferred).
- Session-recording is local-only and opt-out; it records session duration and per-mode duration, nothing else.

## Last completed change
PR #9 merged into `main` as `afe7e77` — real-time generative audio engine, author-verified in the browser. PR A (`fix/crossfade-residual-and-settle-tick`) opened immediately after to fix the crossfade residual and re-add the settle tick deliberately.
