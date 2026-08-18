"use client";

import { useState } from "react";
import Visualizer, { type VisualMode } from "../components/Visualizer";

type Mode = VisualMode;

const MODES: { id: Mode; label: string; blurb: string }[] = [
  {
    id: "focus",
    label: "Focus",
    blurb:
      "3-min Initiation \u2192 12-min Transition \u2192 75-min Deep Focus \u2192 loops 12 \u2192 75 \u2026",
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
    blurb: "Driving percussion and bass momentum.",
  },
];

export default function Home() {
  const [mode, setMode] = useState<Mode>("focus");
  const active = MODES.find((m) => m.id === mode)!;

  return (
    <main>
      <Visualizer mode={mode} />
      <span className="wordmark">Soundscape</span>
      <div className="hud">
        <p className="session">
          <strong>{active.label}</strong>
          <span className="blurb">{active.blurb}</span>
        </p>
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
      </div>
    </main>
  );
}
