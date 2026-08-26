"use client";

import { useEffect, useRef, useState } from "react";
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
  const modeRef = useRef<Mode>("focus");
  const trackRef = useRef<HTMLDivElement | null>(null);
  const scrollTimer = useRef<number | null>(null);
  const animUntil = useRef(0); // ignore nearest-center while a programmatic smooth scroll runs
  const wheelAccum = useRef(0);
  const wheelLock = useRef(0);
  const active = MODES.find((m) => m.id === mode)!;

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  // Center of an item in the track's CONTENT coordinates.
  // Measured with bounding rects, so it does not depend on which ancestor
  // happens to be the offsetParent. The original offsetLeft-based math was
  // relative to a positioned ancestor and skewed selection one item left.
  // Because this is ancestry-independent it stayed correct when PR #6 moved
  // .hud out of position:fixed into normal flow.
  const centerOf = (track: HTMLElement, el: HTMLElement) => {
    const t = track.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    return r.left - t.left + track.scrollLeft + r.width / 2;
  };

  const nearestMode = (): Mode => {
    const track = trackRef.current;
    if (!track) return modeRef.current;
    const center = track.scrollLeft + track.clientWidth / 2;
    let best: Mode = modeRef.current;
    let bestD = Number.POSITIVE_INFINITY;
    track.querySelectorAll<HTMLElement>("[data-mode]").forEach((el) => {
      const d = Math.abs(centerOf(track, el) - center);
      if (d < bestD) {
        bestD = d;
        best = el.dataset.mode as Mode;
      }
    });
    return best;
  };

  // while the user scrolls the bar, the item nearest the center becomes active
  const onScroll = () => {
    if (performance.now() < animUntil.current) return;
    if (scrollTimer.current !== null) window.clearTimeout(scrollTimer.current);
    scrollTimer.current = window.setTimeout(() => {
      const m = nearestMode();
      setMode((prev) => (prev === m ? prev : m));
    }, 80);
  };

  const scrollTo = (id: Mode) => {
    const track = trackRef.current;
    const el = track?.querySelector<HTMLElement>(`[data-mode="${id}"]`);
    if (!track || !el) return;
    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    animUntil.current = performance.now() + (reduce ? 0 : 600);
    track.scrollTo({
      left: centerOf(track, el) - track.clientWidth / 2,
      behavior: reduce ? "auto" : "smooth",
    });
    setMode(id);
  };

  // center the initial mode once mounted
  useEffect(() => {
    const track = trackRef.current;
    const el = track?.querySelector<HTMLElement>(`[data-mode="${mode}"]`);
    if (track && el) track.scrollLeft = centerOf(track, el) - track.clientWidth / 2;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // mouse wheel over the bar shifts one mode per gesture.
  // Native (non-passive) listener so vertical wheel can be intercepted;
  // horizontal trackpad deltas fall through to native scrolling.
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return; // trackpad swipe
      e.preventDefault();
      const now = performance.now();
      if (now < wheelLock.current) return;
      wheelAccum.current += e.deltaY;
      if (Math.abs(wheelAccum.current) < 24) return;
      const dir = wheelAccum.current > 0 ? 1 : -1;
      wheelAccum.current = 0;
      wheelLock.current = now + 280;
      const i = MODES.findIndex((m) => m.id === modeRef.current);
      const next = MODES[Math.min(Math.max(i + dir, 0), MODES.length - 1)].id;
      if (next !== modeRef.current) scrollTo(next);
    };
    track.addEventListener("wheel", onWheel, { passive: false });
    return () => track.removeEventListener("wheel", onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const i = MODES.findIndex((m) => m.id === mode);
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      scrollTo(MODES[Math.min(i + 1, MODES.length - 1)].id);
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      scrollTo(MODES[Math.max(i - 1, 0)].id);
    } else if (e.key === "Home") {
      e.preventDefault();
      scrollTo(MODES[0].id);
    } else if (e.key === "End") {
      e.preventDefault();
      scrollTo(MODES[MODES.length - 1].id);
    }
  };

  return (
    <main>
      <Visualizer mode={mode} />
      <span className="wordmark">Soundscape</span>
      <div className="hud">
        <p className="session">
          <strong>{active.label}</strong>
          <span className="blurb">{active.blurb}</span>
        </p>
        <div
          ref={trackRef}
          className="modebar"
          role="radiogroup"
          aria-label="Soundscape mode"
          tabIndex={0}
          onScroll={onScroll}
          onKeyDown={onKeyDown}
        >
          {MODES.map((m) => (
            <span
              key={m.id}
              data-mode={m.id}
              role="radio"
              aria-checked={m.id === mode}
              className="modeitem"
              onClick={() => scrollTo(m.id)}
            >
              {m.label}
            </span>
          ))}
        </div>
        <span className="modedot" aria-hidden="true" />
      </div>
    </main>
  );
}
