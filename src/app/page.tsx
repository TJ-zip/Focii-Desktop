"use client";

import { useState } from "react";

type Mode = "focus" | "relax" | "sleep" | "pump";

const MODES: { id: Mode; label: string; blurb: string }[] = [
  {
    id: "focus",
    label: "Focus",
    blurb:
      "Session structure: 3-min Initiation (plays once) \u2192 12-min Transition \u2192 75-min Deep Focus \u2192 loops 12 \u2192 75 \u2026 with 8\u201315 s crossfades.",
  },
  {
    id: "relax",
    label: "Relax",
    blurb: "Ethereal pads, slow spatial movement, no beat.",
  },
  {
    id: "sleep",
    label: "Sleep",
    blurb: "Dark drones, brown/pink noise, minimal motion.",
  },
  {
    id: "pump",
    label: "Pump",
    blurb: "Driving percussion and bass momentum. Energetic, not aggressive.",
  },
];

export default function Home() {
  const [mode, setMode] = useState<Mode>("focus");
  const active = MODES.find((m) => m.id === mode)!;

  return (
    <main>
      <span className="wordmark">Soundscape</span>
      <div className="orb" aria-hidden="true" />
      <div className="modes" role="group" aria-label="Soundscape mode">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            className="mode"
            aria-pressed={m.id === mode}
            onClick={() => setMode(m.id)}
          >
            {m.label}
          </button>
        ))}
      </div>
      <p className="session">
        <strong>{active.label}</strong>
        <br />
        {active.blurb}
        <br />
        Audio engine arrives next — files will stream from Vercel Blob and
        cache on-device for offline, lifelong use.
      </p>
    </main>
  );
}
