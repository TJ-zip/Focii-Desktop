# soundscape-v1-temp

Temporary file-sharing repo for a personal **Endel-inspired soundscape app** project (working name: Soundscape). This README is a **handoff document** so any new chat/session can continue without losing context.

> Note: the v1 FLAC audio files were shared as chat attachments, **not committed to this repo** (large binaries). This repo currently holds documentation only.

---

## 1. Project concept

A personal generative-soundscape app inspired by Endel, with **four modes**:

| Mode | Character | v1 audio delivered |
|-------|-----------|--------------------|
| Focus | (v1 full 5-min track delivered) | Full track |
| Sleep | (v1 full 5-min track delivered) | Full track |
| Pump | (v1 track, split due to size) | Part 1 only (first segment) |
| Relax | Long pad swells, **no beat**, pink-noise bed | Part 1 only (`relax_5min_v1_part1.flac`, 10.1 MB, first 100 seconds, standalone valid FLAC, lossless split) |

Parts 2 and 3 of Pump and Relax are staged and can be sent on request. Part 1 of each fully represents the mode's character.

## 2. Current status

- User has v1 audio from **all four modes** and is in a **listening/review phase**.
- Next step: user returns with **listening notes per mode**.

## 3. Decisions pending lock-in (after listening notes)

1. **v2 sound plan** — revised per-mode sound design based on the notes.
2. **Focus-session structure: 3 → 12 → 75** (focus session phasing/durations as discussed in chat).
3. **Interface: black/red, no-squares, Three.js** — dark UI, red accent, avoids square/boxy shapes, built with Three.js.

## 4. How to continue in a new chat

1. Read this README and `PROJECT_STATUS.md`.
2. Ask the user for their per-mode listening notes on the v1 tracks.
3. From the notes, draft and lock: the v2 sound plan, the 3→12→75 focus-session structure, and the black/red no-squares Three.js interface concept.
4. If the user asks for remaining audio, send Pump/Relax parts 2–3 (lossless FLAC splits, same method as part 1).

## 5. Repo contents

- `README.md` — this handoff document.
- `PROJECT_STATUS.md` — persistent project memory (status, tasks, decisions).
