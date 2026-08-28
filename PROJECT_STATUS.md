# PROJECT STATUS — soundscape

## Product objective
Personal Endel-inspired generative soundscape app. Four modes: Focus, Relax, Sleep, Pump. Lifelong, platform-independent: PWA + offline-cached audio + regenerable-from-code masters. No subscription, no time limit.

## Current architecture
- **Next.js 16.3.0 (App Router) + TypeScript** app at repo root, deployable on Vercel (framework preset: Next.js, defaults).
- **Real-time generative audio engine** (`src/audio/engine.ts`, `src/audio/presets.ts`) — merged in PR #9. Pure Web Audio synthesis: nothing is streamed, downloaded or stored, and a session never repeats. Lookahead scheduler (250 ms tick, 1.5 s horizon) against `ctx.currentTime`; a fresh oscillator per beat so every beat is phase-identical; all envelopes are `setValueCurveAtTime` curves (gaussian for pulses, raised-cosine for pads) so there is no instantaneous gain step anywhere. Per layer: sub drone at `root/2` plus a panned 1.5× harmonic (directional bass, fundamental stays centred), per-beat pulse, exponentially-spaced pads, looped decorrelated noise bed. Master through a `DynamicsCompressor` (threshold −24, ratio 3, attack 0.25 s, release 1.2 s) approximating the offline `dynFlatten` stage.
- **Layer gain staging (do not collapse these two nodes).** Each layer has `bus` (carries the swell modulation) and `out` (carries the fade). They must stay separate: connecting a modulation source to an AudioParam *sums* with that param's scheduled value, so routing the swell into the fade param meant a fading layer settled at ±0.1 instead of 0 and disposal truncated a live waveform. That was the audible click on mode change.
- **Settle tick** (`scheduleSettleTick`, merged in PR #10). A deliberate, non-pitched confirmation sounded `TICK_DELAY` = 4.0 s after a mode change — 1.5 s *after* the 2.5 s crossfade has completed, so it reads as "the mode has set", not as a switching artefact. Two bandpassed noise bursts 22 ms apart (1150 Hz Q 0.9 at 55 % = the lever, 2500 Hz Q 1.1 at 100 % = the contact) through a percussive `clickCurve()` envelope: 2.7 ms raised-cosine rise, `exp(-5.5j)` decay. Level `TICK_GAIN` = 0.07. Design constraints, learned the hard way: the source must be **noise, not a tone** (a short sine is a beep); there must be **two** bursts inside the 18–28 ms fusion window (the ear fuses them into one *textured* event — that texture is the whole difference between "mechanism" and "blip"); and the envelope must be **asymmetric** (nothing struck fades *in*). `TICK_DELAY` is deliberately **decoupled** from `MODE_FADE` — they were one constant, and lengthening the tick delay would otherwise have stretched a crossfade that already sounds right. The tick connects straight to `master`, so it survives layer disposal at 2.75 s. `onSettle?: (mode) => void` fires at the same instant via a mirrored timer; it is the hook the split timer uses to land the mode clock's roll-down on the tick.
- **A settle survives a pause** (`settleIn` on `EngineOptions`, `resumeSettleDelay()`, PR #15). A tick could previously only be scheduled by `setMode()`, so a pause taken mid-settle destroyed it permanently — the graph carrying the pending tick was torn down and nothing could reschedule it. `settleIn` lets a freshly-constructed engine be handed the remaining delay; `resumeSettleDelay()` clamps it so the tick is never buried inside the resume fade.
- **Keyboard-first control (PR B).** No transport button exists. A single global `window` keydown handler in `src/app/page.tsx` owns Space (begin), P (pause), ←/→/↑/↓/Home/End (mode), Shift+C (command centre), Shift+M (measurement) and Escape. It reads **`e.code`, never `e.key`** — `code` is the physical key, so P survives Dvorak/AZERTY and Space is shift-independent. It bails on `ctrlKey/metaKey/altKey` and on typing targets (`isTypingTarget()`), because a global Space handler without that guard is a latent bug the moment any text field appears. Space is **"begin", not "toggle"**: pressing it while running does nothing, deliberately — that dead press is what the hint sequence listens for.
- **Arrow keys arm before they act.** Scrolling or clicking the mode bar is an unambiguous gesture; an arrow key is one stray finger away while reading, and a stray mode change costs a 2.5 s crossfade and a settle tick. The first press therefore does not move — it arms, and the dot pulses so the press is visibly acknowledged rather than swallowed. A second press of the same key within `ARM_WINDOW` = 650 ms steps; once armed, single presses keep stepping and direction is free until `ARM_IDLE` = 2500 ms of quiet disarms it.
- **Visualizer: zero-dependency Canvas 2D engine** (`src/components/Visualizer.tsx`) replicating the Endel Focus aesthetic: near-black field, faint blueprint grid, breathing glyphs (plus-crosses, hollow squares, tick pairs, flare streaks, dust points) spawning center-biased on grid intersections, occasional roaming grid frame, vignette. Decision: Canvas 2D instead of Three.js/R3F — the reference visual is flat 2D; canvas gives identical look, no new deps, better mobile perf.
- **Visualizer tempo is derived from `PRESETS`, not chosen by eye (PR G, #17).** Focus and Pump state their periods in **beats of their own preset**: `FOCUS_BEAT = beat(PRESETS.focus.bpm, 1)` = 0.9983 s, `PUMP_BEAT = beat(PRESETS.pump.bpm, 0.5)` = 0.4918 s. Focus breath 7.5 s → **6 beats = 5.99 s**; Pump breath 5.5 s → **8 beats = 3.93 s**; spawn windows and `frameEvery` likewise. Beat counts are rounded **down**, not to nearest — nearest for Focus is 8 beats = 7.99 s, which is *slower*, the opposite of what was asked. `drift` and the per-glyph pulse in `drawGlyph` derive from `breath` and inherit the lock for free. Relax and Sleep are untouched: both have `bpm: 0`, no pulse layer, no grid to be off, and the two modes whose point is that nothing is counting must not feel counted. **This is a rate lock, not a phase lock** — see Known issues.
- **Mode selector: horizontally scrollable snap bar** (replaced the 4 circular buttons). Scroll/swipe/wheel/click/keyboard; the label nearest centre becomes active. Circular red dot marks the selection point. Item centres measured via `getBoundingClientRect` relative to the track — NOT `offsetLeft`, which was measured against a positioned ancestor and skewed selection one item left. Wheel steps one mode per gesture (non-passive listener, accumulation threshold 24, cooldown 280 ms). `prefers-reduced-motion` honoured.
- **Panels are mutually exclusive.** Command centre, measurement pane and Philosophy each close the others rather than stacking: two dialogs would mean two focus traps fighting and an Escape whose meaning depends on which one won. Philosophy is reached from *inside* the command centre and **replaces** it, so closing Philosophy returns there rather than dumping the reader onto a bare session.
- Offline audio generators: `generator/gen_soundscapes.py` (v1, all modes) and `generator/gen_focus_v2_trained.py` (**Focus v2, trained**, seed 207).
- CI: `.github/workflows/validate.yml` (lint/typecheck/test skip-if-absent, mandatory build) + `ci-report.yml` (runs scripts listed in `ci-request.txt`, publishes `ci-reports/latest.md`, commits lockfile back).
- Planned: PWA + Cache Storage for offline. Object storage is now **optional rather than load-bearing** — real-time synthesis means it is only needed for locked masters such as Sleep seed 41.

## Technology stack
Next.js 16.3.0, React 19, TypeScript 5.6, plain CSS + Canvas 2D + Web Audio (no Tailwind, no three.js, no audio libraries). Python/numpy for offline synthesis. Node 22 in CI.

## Working features
- **Real-time generative audio engine — browser playback confirmed by the author (2026-08-27).** Verified in Firefox on the preview deployment: session clock advances; the Initiation → Transition boundary fires at 180 s; the clock survives a mode change; Pump's beat rate is audibly ~2× Focus's; stable for 10+ minutes with no degradation; no console errors originating from application code.
- **Settle tick — character author-approved (2026-08-27):** "it reads as a mechanism now." Level then reduced to 70 % of the approved take (`TICK_GAIN` 0.1 → 0.07) at the author's request; **0.07 itself has not yet been heard.**
- **Keyboard control and the command centre** (PR #11) — no transport button; Shift+C opens the centre; the corner label reveals its chord on hover or focus.
- **The red dot answers back** (PR #12) — two dead Space presses within 1600 ms open a hint blob from the dot. Line one ("To pause, press P") answers forever, because a question asked again deserves answering again; the onboarding tail (lines two and three) retires once seen and is remembered in `soundscape.hintsSeen`.
- **Split timer** (PR #13, made suspendable in PR #15) — a mode change does not restart the session, so the clock splits: a red copy spends the session number back down to 0:00, landing exactly as the settle tick sounds; then it counts up through the settling window; then a "+" appears and the two fold together after 1700 ms. `splitId` only increases, so an interrupting mode change cannot be finished by the previous run's timers. **Author-confirmed working (2026-08-27).**
- **Session measurement** (PR #14) — Shift+M opens the pane; `src/lib/sessions.ts` records start, last-seen, seconds played and per-mode spans, nothing else. Recording is on unless the device opts out. Sessions under `MIN_RECORD_SECONDS` = 120 are not written (someone pressed Space and changed their mind); `MAX_SESSIONS` = 5000 bounds the store. Saved on pause, `visibilitychange`, `pagehide` and unmount, keyed on start time so repeated saves overwrite one row. RFC 4180 CSV export, long format (one row per mode per session), entirely client-side `Blob` — works on Vercel, on localhost and offline.
- **Philosophy page** (PR #15) — the classical-conditioning essay; the only long-form reading in the app and therefore the only place with a serif and a 1.9 line-height. The per-mode blurbs were removed with it: a caption explaining the mechanism keeps the mechanism in view, and one blurb stated the 3 → 12 → 75 progression as a property of Focus when it is the shape of every session in every mode.
- **Command recall flash** (PR #16) — someone who has seen the whole hint sequence and is still pressing Space is asking a question the dot can no longer answer. The Command tip now opens itself for `TIP_HOLD` = 2400 ms, `TIP_DELAY` = 1500 ms into the blob, so the app answers and then points. Styled identically to hover, so it reads as the same corner saying the same thing rather than a new kind of notification. Gated on `hintsSeenRef`, never fired for a first-timer whose sequence already ends on "Press Shift + C". **Author-confirmed working (2026-08-28).**
- **Visualizer tempo lock** (PR #17) — Focus and Pump quicker and beat-derived; Relax and Sleep unchanged. **Author-confirmed working (2026-08-28): "working and fully functional."**
- Endel-style generative visualizer — **user verdict: "FANTABULOUS"** (PR #5 merged). Per-mode tuning v2 (PR #6 merged): sleep slower (30 s breath, sparse long-lived glyphs — user loved the dimming), pump with brighter grid lines (alpha 0.13) + brightness 1.25. Reduced-motion static fallback, DPR-aware, resize-safe.
- Page scrolls again on short viewports: only the canvas is `position: fixed`; wordmark and HUD sit in normal flow (PR #6).
- Scrollable mode bar (no buttons, no squares/squircles): scroll-snap, centre-select aligned to the red dot, mouse-wheel mode stepping, gradient edge fades, hidden scrollbar, keyboard accessible.
- v1.1 audio samples delivered via chat (WAV <10 MB each): sleep 109 s, relax 109 s, pump 74 s. **Sleep is LOCKED (seed 41) — user: "OUTSTANDING".**
- **Focus v2 "trained" (seed 207)** — parameters measured from the user's Endel Focus recording (minutes 1–8 analysed, not the full 20): pulse 60.1 BPM, zero sharp transients (all soft envelopes), dynamics flattened to measured ratio 1.21, 25.9 s swell cycle, directional bass. Profile: `generator/endel_focus_profile.json`.

## Feedback captured
- **Generative engine playback: "FANTABULOUS", "I can't stop listening."** Ran 10+ minutes without problems.
- Click on mode change: the user *liked* it and read it as "the mode has shifted and is now set in stone", but wanted it **delayed**. Diagnosed as a truncation artefact → removed as a bug, re-added deliberately as the settle tick (PR #10). First redesign sounded like a "Blip"; second, as filtered noise at 4.0 s, was approved.
- Wants the play/pause button removed entirely in favour of keyboard control and a Command centre → done in PR #11.
- Visualizer v1: FANTABULOUS. Requested faster focus, slower sleep, brighter pump lines — done in PR #6. Sleep light-dimming explicitly praised. Then asked for Focus and Pump faster still and agreed to beat-syncing — done in PR #17.
- Split timer, measurement pane, Philosophy: "all is working." Recall flash: "everything works perfect." Visualizer tempo: "working and fully functional."
- Sleep audio v1.1: outstanding — do not change.
- Relax audio v1.1: failed — user couldn't relax. Await reference tracks.
- Pump audio v1.1: nice but mediocre — likely flat energy curve. Await reference tracks.
- Focus audio v1: too ethereal, plucks distracting; wants directional/spatial bass → addressed by the v2 trained parameters, now carried into the real-time engine.
- Mode bar (2026-08-20 screen recording): active mode was the label LEFT of the red dot, and the bar was click-only → both fixed (dot alignment + wheel scrolling).

## Current task
None in flight. The UI programme agreed 2026-08-27 is **complete** — all seven PRs plus one unplanned addition are merged and author-verified in the browser:

| PR | Contents | Status |
|---|---|---|
| A | Crossfade residual fix + deliberate settle tick | **merged** (#10, `0f4cc8c`) |
| B | Remove play button; global key bindings; Command button + centre (Shift+C) | **merged** (#11) |
| C | Hint state machine emanating from the red dot | **merged** (#12) |
| D | Two-clock model: session clock + red mode clock rolling to 0:00 | **merged** (#13) |
| E | Session measurement pane (Shift+M) + History, `localStorage`, CSV export | **merged** (#14) |
| F | Philosophy page; removes the per-mode blurbs; settle survives a pause | **merged** (#15, `6877f3e`) |
| — | Command recall flash (unplanned; follows from C) | **merged** (#16, `5968f07`) |
| G | Visualizer speed + beat-derived tempo | **merged** (#17) |

Next programme not yet chosen. See Pending tasks.

## Pending tasks
1. Receive + profile reference tracks; regenerate Relax/Pump.
2. **Rewrite `generator/engine_ref.py`.** It is referenced by PR #9's body and by `src/audio/presets.ts` line 5 but is absent from the repo — it lived only in a chat sandbox that was lost. Every measured figure in PR #9 (focus 60.11 BPM/+0.02%, pump 121.61/−0.32%, 0 sharp attacks, dyn_ratio 1.43/1.66/1.35/1.35) came from it and is currently **unreproducible**. A rewrite will produce slightly different numbers; that is expected and must be documented rather than reconciled. Fix the stale line-5 comment at the same time.
3. Confirm `TICK_GAIN` = 0.07 by ear. The approved take was 0.1; 0.07 has never been heard.
4. PWA: manifest, service worker, Cache Storage offline audio.
5. Object-storage setup + `audio-manifest.json` (storage-agnostic) — optional, for locked masters only.
6. Long-form renders per mode (3/12/75-min) via chunked synthesis.
7. Cross-browser verification: Chromium and WebKit. Everything confirmed so far is Firefox.

## Known issues
- `generator/engine_ref.py` missing — see pending task 2.
- **The visualizer is rate-locked, not phase-locked.** The canvas clock starts at page load, not at the bar, so the visual and musical cycles share a period at a fixed but arbitrary offset. This is safe *only* because every visual is a smooth sine — nothing on screen flashes, so there is no sharp attack that could be seen to land in the wrong place. A visible per-beat accent would need real phase-lock to the AudioContext clock, which means threading the engine's musical phase into the canvas and surviving the pause/rebuild cycle. Deliberately deferred; the Philosophy essay states the limit rather than overclaiming it.
- ~~Spacebar starts playback but cannot stop it.~~ **Resolved in PR B.** Root cause: `disabled={starting}` on the transport button blurred the focused element when React applied the attribute, so focus fell to `<body>` and never returned. The button no longer exists and keys are bound on `window`.
- **Pause is a structural resume, not a true pause.** `pauseAudio()` stores `engine.elapsed` and `startAudio()` passes it back as the engine's `phase`. The audio graph is torn down and rebuilt, so resuming costs the 1.2 s `EDGE_FADE` out/in and yields different pads. What is preserved is session position and the generative sequence (one `seedRef` per tab), not the exact sound.
- The `presets.ts` comment describing the Deep sine as a "~110 min ultradian" cycle is wrong; it spans the 4500 s (75 min) block.
- Focus sits at `dyn_ratio` 1.43 against Endel's measured 1.21. The only lever that closes the gap is cutting pulse gain, which would regress the "too ethereal" v1 complaint. **Deliberate deviation, documented rather than matched.**
- `FOCUS_BEATS`/`PUMP_BEATS` are duplicated between `Visualizer.tsx` and `Philosophy.tsx` — the essay needs the count, the canvas needs the product. Flagged in a comment on both sides rather than shared, because a constants module for two numbers used by two adjacent files is ceremony.
- Authoring sandbox: no ffmpeg/FLAC encoder, no pip installs, no network egress; binaries can't be pushed to GitHub. WAV used for delivery; FLAC mastering deferred. All build/lint/type claims must come from a GitHub Actions run.
- Endel reference is AAC in MP4; without a decoder, analysis is bitstream-level (bit allocation, `global_gain`, window flags). This yields tempo/attack/dynamics/cycle features but not spectral timbre.
- Browser coverage: playback confirmed in Firefox only. Chromium and WebKit unverified.

## Required environment variables
- None. The app makes no network calls at runtime and needs no configuration to build or deploy.
- `localStorage` keys in use (the complete list — clearing site data destroys exactly these):
  - `soundscape.hasStarted` — set once a session has successfully started on this device; suppresses the first-run "press space" hint.
  - `soundscape.hintsSeen` — set once the onboarding tail of the dot sequence has been seen or acted on. Line one is never gated by it.
  - `soundscape.sessions` — the session history, newest first, JSON.
  - `soundscape.recording` — the opt-out switch. Absent or anything other than `"0"` means recording.
- Session history is deliberately **not** a hosted database — a hosted dependency would contradict the lifelong/Vercel-independent goal for a feature that only stores "pump, 41 minutes". The trade is that history is per-origin and per-browser: it does not follow you to another machine.
- Future object storage (names only, never values): `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `NEXT_PUBLIC_AUDIO_BASE_URL`.

## Deployment information
Vercel: connected to repo (preset Next.js, defaults); preview deployments active on PRs. Team/org slug `code-lite`. No env vars needed.

## Important architectural decisions
- Sleep generator seed 41 locked. Focus v2 trained seed 207 (canonical until user feedback).
- Trained-parameter approach: measure reference recordings via bitstream analysis, synthesise original audio from measured parameters. No Endel audio is ever reproduced or committed.
- **3→12→75 session structure applies to all modes** (Initiation plays once per session; 12 and 75 alternate forever).
- **`quantizeRoot()` is load-bearing.** The sub drone must complete an *even* number of cycles per beat — even, so the 1.5× harmonic also lands whole — otherwise its phase drifts against the beat grid, reinforcing some beats and cancelling others. This measurably shifted Pump's tempo by −3.32%. Do not "simplify" the root to a round number.
- One purpose per AudioParam — see the layer gain staging note above.
- `TICK_DELAY` and `MODE_FADE` are separate constants on purpose. Do not re-merge them.
- Keyboard handling uses `e.code` (physical key), never `e.key`, and always guards typing targets.
- **Wall-clock time and audio time have separate jobs.** The session readout is taken from the engine, i.e. from the AudioContext's own clock, so a throttled interval costs a visual update rather than accumulated drift. Anything that must survive a pause — the split timer, session measurement — is anchored to `performance.now()` instead, because the audio clock does not exist while paused and restarts at zero on resume.
- Vercel-independent: PWA, offline cache, no Vercel-only APIs in app code; object storage is distribution only.
- UI chrome: black/red, circles only — squares/squircles banned. Visualizer glyphs follow the Endel reference (grid, squares as *content*, not UI). Mode selector is a scrollable bar, not buttons; selection point = red centre dot.
- Visualizer: Canvas 2D, zero deps (Three.js deferred).
- Session-recording is local-only and opt-out; it records session duration and per-mode duration, nothing else.

## Last completed change
PR #17 (`feature/visualizer-tempo`) — the visualizer's Focus and Pump tempi are now derived from `PRESETS` in beats rather than picked by eye, and the Philosophy essay's *The image* section computes its own figures from the same source so the prose cannot drift from the code. Author-verified in the browser on 2026-08-28 and merged into `main`. This status file was brought current in the same PR.
