# PROJECT STATUS — soundscape-v1-temp

## Product objective
Personal Endel-inspired generative soundscape app with four modes: Focus, Sleep, Pump, Relax.

## Current architecture
None yet — project is in the audio-prototyping (v1 listening) phase. This repo is a temporary file-sharing/documentation repo. No application code exists.

## Technology stack
- Audio: 5-minute FLAC prototypes per mode (lossless; large files split into standalone valid FLAC parts of ~100 s).
- Planned UI: **Three.js**, black background with red accent, no square/boxy shapes.

## Working features
- v1 audio delivered via chat attachments: Focus (full), Sleep (full), Pump (part 1), Relax (part 1: `relax_5min_v1_part1.flac`, 10.1 MB, first 100 s — long pad swells, no beat, pink-noise bed).
- Pump/Relax parts 2–3 staged, deliverable on request.

## Current task
User is listening to v1 tracks and will return with notes per mode.

## Pending tasks
1. Collect per-mode listening notes.
2. Lock the **v2 sound plan**.
3. Lock the **3 → 12 → 75 focus-session structure**.
4. Lock the **black/red no-squares Three.js interface** concept, then begin app implementation (likely a new app repo).

## Known issues
- Audio files are not stored in this repo (chat-attachment delivery only); repo is docs-only.

## Required environment variables
None.

## Deployment information
None — no deployable app yet. Future app should target Vercel.

## Important architectural decisions
- Large FLACs are split losslessly into standalone-playable parts (~100 s each).
- UI direction fixed early: Three.js, black/red, no squares.

## Last completed change
Added handoff README.md and this PROJECT_STATUS.md so a new chat session can resume seamlessly.
