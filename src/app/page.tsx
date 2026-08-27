"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Visualizer, { type VisualMode } from "../components/Visualizer";
import CommandCenter from "../components/CommandCenter";
import { SoundscapeEngine } from "../audio/engine";
import { sectionAt } from "../audio/presets";

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

/** Set once the user has successfully started a session on this device. */
const STARTED_KEY = "soundscape.hasStarted";

function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(sec).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/**
 * True when the key event originated in something the user is typing into.
 * Space and P must never be stolen from a text field. There are no text
 * fields today, but a global keydown handler that does not check this is a
 * bug waiting for the first <input> anyone adds.
 */
function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el.tagName !== "string") return false;
  const tag = el.tagName.toUpperCase();
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    el.isContentEditable === true
  );
}

export default function Home() {
  const [mode, setMode] = useState<Mode>("focus");
  const modeRef = useRef<Mode>("focus");
  const trackRef = useRef<HTMLDivElement | null>(null);
  const scrollTimer = useRef<number | null>(null);
  const animUntil = useRef(0); // ignore nearest-center while a programmatic smooth scroll runs
  const wheelAccum = useRef(0);
  const wheelLock = useRef(0);
  const active = MODES.find((m) => m.id === mode)!;

  const engineRef = useRef<SoundscapeEngine | null>(null);
  const startingRef = useRef(false);
  /**
   * Session offset to resume from, in seconds. Pause writes the engine's
   * elapsed time here; the next start passes it back as `phase`, so pausing
   * holds your place in the Initiation -> Transition -> Deep structure
   * instead of dropping you back at the beginning.
   */
  const phaseRef = useRef(0);
  /**
   * One seed for the life of the tab, so a pause/resume produces a
   * continuation of the same session rather than a different one.
   */
  const seedRef = useRef<number | null>(null);

  const [playing, setPlaying] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [hasStarted, setHasStarted] = useState(true); // assume yes until localStorage says otherwise
  const [session, setSession] = useState({ name: "", elapsed: 0 });

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  // Read on the client only: touching localStorage during render would差 the
  // server and client markup apart and produce a hydration mismatch.
  useEffect(() => {
    try {
      setHasStarted(window.localStorage.getItem(STARTED_KEY) === "1");
    } catch {
      setHasStarted(true); // private mode / storage blocked: just stay quiet
    }
  }, []);

  // The engine crossfades between modes without restarting the session clock,
  // so changing mode mid-session keeps the Initiation -> Deep progression.
  useEffect(() => {
    const engine = engineRef.current;
    if (engine && engine.running) engine.setMode(mode);
  }, [mode]);

  const startAudio = useCallback(async () => {
    if (startingRef.current) return;
    const engine = engineRef.current;
    if (engine && engine.running) return; // Space is "begin", not "toggle"
    startingRef.current = true;
    try {
      if (seedRef.current === null) {
        seedRef.current = Math.floor(Math.random() * 1e9);
      }
      // Constructed here, inside the key/click handler: browsers only allow an
      // AudioContext to start from a user gesture.
      const next = new SoundscapeEngine({
        phase: phaseRef.current,
        seed: seedRef.current,
      });
      await next.start(modeRef.current);
      engineRef.current = next;
      setPlaying(true);
      setHasStarted(true);
      try {
        window.localStorage.setItem(STARTED_KEY, "1");
      } catch {
        // storage unavailable; the hint simply shows again next visit
      }
    } catch {
      setPlaying(false);
    } finally {
      startingRef.current = false;
    }
  }, []);

  const pauseAudio = useCallback(() => {
    const engine = engineRef.current;
    if (!engine || !engine.running) return;
    const at = engine.elapsed;
    phaseRef.current = at;
    engine.stop(); // fades over EDGE_FADE, then tears the graph down
    engineRef.current = null;
    setPlaying(false);
    setSession({ name: sectionAt(at).name, elapsed: at });
  }, []);

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

  const scrollTo = useCallback((id: Mode) => {
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
  }, []);

  const stepMode = useCallback(
    (dir: 1 | -1) => {
      const i = MODES.findIndex((m) => m.id === modeRef.current);
      const next = MODES[Math.min(Math.max(i + dir, 0), MODES.length - 1)].id;
      if (next !== modeRef.current) scrollTo(next);
    },
    [scrollTo]
  );

  // --- the single global key handler -------------------------------------
  //
  // Bound to `window`, not to a control. That is the whole point: the app has
  // no transport button any more, so no key behaviour may depend on what
  // happens to hold focus.
  //
  // `e.code` throughout, never `e.key`. `code` is the physical key, so P is
  // still P on a Dvorak or AZERTY layout, and Space is unaffected by the
  // shift state.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Leave browser and OS chords alone.
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;

      if (e.code === "Escape") {
        if (commandOpen) {
          e.preventDefault();
          setCommandOpen(false);
        }
        return;
      }

      if (e.shiftKey && e.code === "KeyC") {
        e.preventDefault();
        setCommandOpen((o) => !o);
        return;
      }

      // While the dialog is up it owns the keyboard, apart from the two keys
      // handled above.
      if (commandOpen) return;

      if (e.code === "Space") {
        e.preventDefault(); // stop the page scrolling
        if (e.repeat) return;
        void startAudio();
        return;
      }

      if (e.code === "KeyP" && !e.shiftKey) {
        e.preventDefault();
        pauseAudio();
        return;
      }

      if (e.code === "ArrowRight" || e.code === "ArrowDown") {
        e.preventDefault();
        stepMode(1);
      } else if (e.code === "ArrowLeft" || e.code === "ArrowUp") {
        e.preventDefault();
        stepMode(-1);
      } else if (e.code === "Home") {
        e.preventDefault();
        scrollTo(MODES[0].id);
      } else if (e.code === "End") {
        e.preventDefault();
        scrollTo(MODES[MODES.length - 1].id);
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [commandOpen, pauseAudio, scrollTo, startAudio, stepMode]);

  // session readout
  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      const engine = engineRef.current;
      if (!engine || !engine.running) return;
      const e = engine.elapsed;
      setSession({ name: sectionAt(e).name, elapsed: e });
    }, 1000);
    return () => window.clearInterval(id);
  }, [playing]);

  // stop audio when the page unmounts
  useEffect(() => {
    return () => {
      engineRef.current?.stop();
      engineRef.current = null;
    };
  }, []);

  // center the initial mode once mounted
  useEffect(() => {
    const track = trackRef.current;
    const el = track?.querySelector<HTMLElement>(`[data-mode="${mode}"]`);
    if (track && el)
      track.scrollLeft = centerOf(track, el) - track.clientWidth / 2;
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
      stepMode(dir);
    };
    track.addEventListener("wheel", onWheel, { passive: false });
    return () => track.removeEventListener("wheel", onWheel);
  }, [stepMode]);

  const paused = !playing && phaseRef.current > 0;

  return (
    <main>
      <Visualizer mode={mode} />
      <span className="wordmark">Soundscape</span>

      {/* Borderless, top-right. Hover or keyboard focus reveals the chord, so
          the shortcut is discoverable without the label shouting it. */}
      <div className="cmdcorner">
        <button
          type="button"
          className="cmdbtn"
          onClick={() => setCommandOpen((o) => !o)}
          aria-haspopup="dialog"
          aria-expanded={commandOpen}
        >
          Command
          <span className="cmdtip" aria-hidden="true">
            Shift + C
          </span>
        </button>
      </div>

      <CommandCenter open={commandOpen} onClose={() => setCommandOpen(false)} />

      <div className="hud">
        <p className="session">
          <strong>{active.label}</strong>
          <span className="blurb">{active.blurb}</span>
        </p>

        <p className="readout" aria-live="polite">
          {playing
            ? `${session.name} \u00b7 ${formatClock(session.elapsed)}`
            : paused
              ? `${session.name} \u00b7 ${formatClock(session.elapsed)} \u00b7 paused`
              : "\u00a0"}
        </p>

        {/* With the transport button gone, this is the only thing telling a
            first-time visitor how to begin. It never returns once they have. */}
        {!playing && !hasStarted && (
          <p className="firsthint">
            press <kbd>space</kbd> to begin
          </p>
        )}

        <div
          ref={trackRef}
          className="modebar"
          role="radiogroup"
          aria-label="Soundscape mode"
          tabIndex={0}
          onScroll={onScroll}
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
