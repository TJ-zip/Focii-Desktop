# soundscape-v1-temp

Temporary file-sharing/documentation repo for a personal **Endel-inspired soundscape app** project. This README is the **handoff document** so any new chat/session can continue without losing context. Full context was recovered from the previous chat transcript (PDF).

> Note: the v1 FLAC audio files were shared as chat attachments, **not committed to this repo** (this environment has no network egress; the GitHub tools handle text only, so large binaries can't be pushed). This repo holds documentation only.

---

## 1. Project concept

A personal generative-soundscape app inspired by Endel (researched: Endel Pacific engine, pentatonic-scale palette, layered adaptive sound). Four modes, rendered as finite loop-safe files instead of a real-time stream:

| Mode | v1 character | v1 delivered | User feedback so far |
|-------|--------------|--------------|----------------------|
| Focus | Pentatonic layers + string plucks | Full 5-min FLAC | "More ethereal/relaxing than focus; string plucks were distracting. Overall very nice. Loop was nice." Wants more directional/spatial bass feel like Endel. |
| Sleep | Dark drones + colored noise | Full 5-min FLAC (`sleep_5min_v1.flac`, 9.1 MB) | Pending |
| Pump | Kick + hats + bassline loop | Part 1 only (`pump_5min_v1_part1.flac`, 10.9 MB, first 100 s, standalone valid FLAC) | Pending |
| Relax | Long pad swells, no beat, pink-noise bed | Part 1 only (`relax_5min_v1_part1.flac`, 10.1 MB, first 100 s) | Pending |

Parts 2–3 of Pump/Relax (~10–11 MB each) can be regenerated/split the same way if needed. Audio files themselves did NOT survive the chat transition — they must be regenerated (generation is deterministic-capable and cheap).

## 2. v2 sound direction (agreed, pending final lock after full listening notes)

- **Focus**: less ethereal; remove prominent string plucks; steady understated rhythmic pulse (~60–70 BPM) + subdued bass movement; melodies extremely sparse and blurred into texture; stereo movement via slow binaural panning, phase differences, delays, filtered bass harmonics — directional but not distracting.
- **Relax**: preserve the ethereal character (user liked it in the Focus v1); slow spatial movement, warm pads, no obvious beat.
- **Sleep**: darker, softer; mostly brown/pink noise and low drones; minimal directional motion (headphone comfort).
- **Pump**: driving percussion, bass rhythm, forward momentum; energetic not aggressive; no distracting lead melody.

## 3. Focus-session structure (agreed)

1. **3-minute Initiation** — always identical; conditioning cue (bell-ring psychology); plays only once per session.
2. **12-minute Transition** — blends seamlessly from Initiation into sustained focus.
3. **75-minute Deep Focus** — continues seamlessly; after it ends, loop back to the **12-minute Transition** (never the 3-minute file).

Sequence: **3 → 12 → 75 → 12 → 75 → …** Use ~8–15-second overlapping crossfades between files (two overlapped players), not exact file-boundary looping. 90-minute blocks = peak focus rationale.

## 4. Interface plan (agreed)

- **TypeScript + Three.js**, likely lightweight React/Vite app; deploy to Vercel.
- Near-black background, restrained deep-red forms/glow. **No squares or squircles anywhere** (user banned them project-wide).
- One continuously evolving central visual — slow, organic, dimensional, responsive to current phase; subtle audio-reactivity from broad energy bands only.
- Reduced-motion support + simple non-WebGL fallback.
- Controls: start session, pause, phase indicator, elapsed/remaining time, volume, spatial-intensity control, mode selection. No dashboards, no bright UI.
- Visual reference: **https://teja-for-ted-x-ecru.vercel.app/** (black/red, restrained animation — inspiration, not copying). Its source repo was not discoverable by name; **user must share the GitHub repo URL** before implementation to inspect the Three.js visuals.

## 5. Audio format & hosting decisions

- **FLAC as lossless master** (user wears wired headphones). WAV/other acceptable if better suited; agent may decide.
- MP3 avoided for looping (encoder padding gap/click). OGG/FLAC/WAV loop gaplessly.
- Web player: stream separate files, overlap two players for crossfades; never load a 90-min session into RAM.
- Long FLACs exceed comfortable GitHub limits → keep code in GitHub; large audio via GitHub Releases (uploaded from the user's machine), Vercel Blob, or Dropbox public links (user suggested; not yet decided), or deterministic on-demand generation.
- Chat delivery limit observed: keep per-attachment files under ~10 MB (split losslessly into standalone valid FLAC parts of ~100 s).
- Future goal: 90-minute files (user asked for these eventually; hours-long generation is feasible via chunked synthesis).

## 6. How to continue in a new chat

1. Read this README and `PROJECT_STATUS.md`.
2. Get the user's per-mode listening notes (Focus feedback already captured above).
3. Lock the v2 sound plan; regenerate v2 audio (the v1 files were lost with the old session — regenerate if reference is needed).
4. Get the Teja TEDx GitHub repo URL from the user; then design the Three.js interface.
5. Build the app in a proper (new) repo, targeting Vercel; decide audio hosting.

## 7. Repo contents

- `README.md` — this handoff document.
- `PROJECT_STATUS.md` — persistent project memory.
