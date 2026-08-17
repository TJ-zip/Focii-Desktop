# PROJECT STATUS — soundscape-v1-temp

## Product objective
Personal Endel-inspired generative soundscape app. Four modes: Focus, Sleep, Relax, Pump. Finite loop-safe generative files (pentatonic layered synthesis) instead of a real-time adaptive stream. No subscription, no time limit.

## Current architecture
None yet — audio-prototyping phase. This repo is temporary docs/file-sharing. No application code exists. Planned app: TypeScript + Three.js (React/Vite), deployed on Vercel.

## Technology stack
- Audio generation: Python (numpy/scipy) synthesis → WAV → ffmpeg → FLAC. Lossless FLAC master; ~100 s standalone lossless splits for chat delivery (<~10 MB each).
- Planned UI: Three.js + TypeScript, black background with deep-red glow, **no squares/squircles**, reduced-motion support, non-WebGL fallback.

## Working features
- v1 audio (5-min per mode) was generated and delivered via chat attachments in the previous session: Focus (full), Sleep (full, 9.1 MB), Pump (part 1, 10.9 MB), Relax (part 1, 10.1 MB). **Files did not survive the session change — regenerate when needed.**

## Current task
Collect the user's per-mode listening notes, then lock the v2 sound plan and finish planning (no coding until planning is locked).

## Feedback captured so far
- Focus v1: more ethereal/relaxing than focus; string plucks distracting; loop nice; wants directional bass/spatial movement like Endel. Sleep/Pump/Relax notes pending.

## Pending tasks
1. Remaining listening notes (Sleep, Pump, Relax).
2. Lock v2 sound plan (draft per-mode direction already agreed — see README §2).
3. Lock 3 → 12 → 75 → 12 → 75 focus-session structure implementation details (8–15 s crossfades, dual overlapped players; 3-min Initiation plays once only).
4. Obtain Teja TEDx GitHub repo URL (visual ref: https://teja-for-ted-x-ecru.vercel.app/).
5. Decide large-audio hosting: GitHub Releases (user-uploaded) vs Vercel Blob vs Dropbox public links vs deterministic on-demand generation.
6. Build the app repo; deploy to Vercel.
7. Eventually: 90-minute Deep Focus files (chunked synthesis).

## Known issues
- Sandbox has no network egress; GitHub MCP tools are text-only → large binaries cannot be pushed from the agent environment. Chat attachments limited to ~10 MB reliably.
- Audio files are not stored anywhere durable yet.

## Required environment variables
None.

## Deployment information
None yet — future app targets Vercel.

## Important architectural decisions
- FLAC lossless master; MP3 rejected for looping (gap/click from encoder padding).
- Loop-safe design: file endings crossfade into their own openings; session player overlaps two audio elements with 8–15 s crossfades.
- 3-min Initiation file is a fixed conditioning cue (identical every session, plays once).
- UI: Three.js, black/red, no squares/squircles, restrained continuous animation.

## Last completed change
Enriched handoff docs with full context recovered from the previous-chat PDF transcript (v2 sound direction, session structure, interface plan, hosting constraints, Focus feedback).
