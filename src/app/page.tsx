"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Visualizer, { type VisualMode } from "../components/Visualizer";
import CommandCenter from "../components/CommandCenter";
import MeasurePane from "../components/MeasurePane";
import ModeDot, { type ArmState, type HintScope } from "../components/ModeDot";
import SessionClock, { type Split } from "../components/SessionClock";
import { SoundscapeEngine, SETTLE_DELAY } from "../audio/engine";
import { SECTIONS, sectionAt } from "../audio/presets";
import {
  isRecording,
  saveSession,
  setRecording as setRecordingPref,
  MIN_RECORD_SECONDS,
  type LiveSession,
} from "../lib/sessions";

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
/**
 * Set once the onboarding tail of the hint sequence - lines two and three -
 * has been seen or acted on. Line one is never gated by this.
 */
const HINTS_KEY = "soundscape.hintsSeen";

/**
 * How long the red clock counts before the two clocks merge.
 *
 * Taken from the session structure rather than hardcoded: it is the same
 * window a fresh session spends in Initiation, so a mode change is measured
 * against the same yardstick as a beginning.
 */
const SETTLE_SECONDS = SECTIONS[0][1];

/** How long the "+" is held before the red clock folds away, in ms. */
const SUM_HOLD = 1700;

/**
 * Arrow-key arming.
 *
 * Scrolling and clicking the mode bar are unambiguous gestures: you had to
 * reach for the bar to perform them. An arrow key is not - it is one stray
 * finger away while reading, and a stray mode change costs a 2.5 s crossfade
 * and a settle tick. So the first arrow press does NOT move. It arms.
 *
 * ARM_WINDOW - the second press must land inside this to count as a
 * deliberate double. Long enough for an unhurried double tap, short enough
 * that two unrelated presses a second apart are not read as one intent.
 *
 * ARM_IDLE - once armed, single presses keep stepping. The arming decays this
 * long after the last press, so a navigation burst stays fluid but walking
 * away and coming back starts from safe again.
 */
const ARM_WINDOW = 650;
const ARM_IDLE = 2500;

/**
 * Space is "begin", not "toggle" - pressing it while already playing is
 * deliberately inert. That inertness is a signal: someone pressing it twice
 * in quick succession is asking a question. Two dead presses inside this
 * window is the threshold at which the dot answers.
 *
 * It answers EVERY time, for the life of the app. A question asked again
 * deserves answering again; only the unprompted follow-up lines retire.
 */
const DEAD_SPACE_WINDOW = 1600;
const DEAD_SPACE_TRIGGER = 2;

/**
 * The in-flight session.
 *
 * `since` is a performance.now() stamp for the span currently running, or
 * null while paused. `acc` holds completed seconds per mode. Time is taken
 * from performance.now() rather than the AudioContext clock because the
 * audio clock does not exist while paused and is rebuilt on resume, whereas
 * what is being measured is wall-clock listening.
 */
interface Tracker {
  startedAt: number;
  mode: Mode;
  since: number | null;
  acc: Record<string, number>;
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
  const [measureOpen, setMeasureOpen] = useState(false);
  const [hasStarted, setHasStarted] = useState(true); // assume yes until localStorage says otherwise
  const [session, setSession] = useState({ name: "", elapsed: 0 });

  // Measurement. The tracker is a ref because it is written from a keydown
  // handler, a visibilitychange listener and an unmount cleanup - none of
  // which can wait for a render. `live` is the rendered projection of it,
  // refreshed only while the pane is actually open.
  const tracker = useRef<Tracker | null>(null);
  const [live, setLive] = useState<LiveSession | null>(null);
  const [recording, setRecordingState] = useState(true);
  const recordingRef = useRef(true);

  /**
   * The split timer's stage machine.
   *
   * A mode change does not restart the session, so the clock cannot reset -
   * but something plainly happened, so it must not sit there either. It
   * splits in two for one settling window and then merges back:
   *
   *   rolling  -> the red copy spends the session number back down to 0:00,
   *               landing exactly as the settle tick sounds
   *   settling -> it counts up through the settling window
   *   summing  -> "+" appears and the two clocks fold together
   *
   * `splitId` only ever increases, so a mode change that interrupts a split
   * in progress cannot be finished by the previous run's timers.
   */
  const [split, setSplit] = useState<Split | null>(null);
  const splitId = useRef(0);

  // Arrow arming. The ref carries the logic (it must be readable from inside
  // a keydown handler without re-binding the listener); the state exists only
  // so the red dot can show what the keyboard is currently willing to do.
  const armRef = useRef<{ armed: boolean; dir: 0 | 1 | -1; at: number }>({
    armed: false,
    dir: 0,
    at: 0,
  });
  const armTimer = useRef<number | null>(null);
  const [armState, setArmState] = useState<ArmState>("idle");

  // Dot hint sequence. Same split as the arming state: refs for anything the
  // key handler reads, state only for what renders.
  const [hintRun, setHintRun] = useState(0);
  const [hintScope, setHintScope] = useState<HintScope>("full");
  const hintRunRef = useRef(0);
  const hintsSeenRef = useRef(false);
  const deadSpace = useRef({ n: 0, at: 0 });

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    hintRunRef.current = hintRun;
  }, [hintRun]);

  // Read on the client only: touching localStorage during render would drive
  // the server and client markup apart and produce a hydration mismatch.
  useEffect(() => {
    try {
      setHasStarted(window.localStorage.getItem(STARTED_KEY) === "1");
      const seen = window.localStorage.getItem(HINTS_KEY) === "1";
      hintsSeenRef.current = seen;
      setHintScope(seen ? "short" : "full");
    } catch {
      setHasStarted(true); // private mode / storage blocked: just stay quiet
      hintsSeenRef.current = true;
      setHintScope("short");
    }
    const rec = isRecording();
    recordingRef.current = rec;
    setRecordingState(rec);
  }, []);

  // --- measurement --------------------------------------------------------

  /** Bank the running span. Idempotent: `since` is advanced as it goes, so
      calling this twice in a row adds nothing the second time. */
  const flushSpan = useCallback(() => {
    const t = tracker.current;
    if (!t || t.since === null) return;
    const now = performance.now();
    const dt = (now - t.since) / 1000;
    if (dt > 0) t.acc[t.mode] = (t.acc[t.mode] ?? 0) + dt;
    t.since = now;
  }, []);

  const snapshot = useCallback((): LiveSession | null => {
    const t = tracker.current;
    if (!t) return null;
    flushSpan();
    const spans = Object.entries(t.acc).map(([m, seconds]) => ({
      mode: m,
      seconds,
    }));
    return {
      startedAt: t.startedAt,
      total: spans.reduce((n, s) => n + s.seconds, 0),
      spans,
    };
  }, [flushSpan]);

  /**
   * Write the session out. Keyed on its start time, so the repeated calls
   * from pause / tab-hide / unmount overwrite one row rather than producing
   * four. Silently does nothing when recording is off.
   */
  const persist = useCallback(() => {
    const t = tracker.current;
    if (!t || !recordingRef.current) return;
    const snap = snapshot();
    if (!snap || snap.total < MIN_RECORD_SECONDS) return;
    saveSession({
      id: t.startedAt,
      startedAt: t.startedAt,
      endedAt: Date.now(),
      total: snap.total,
      spans: snap.spans,
    });
  }, [snapshot]);

  const toggleRecording = useCallback((on: boolean) => {
    recordingRef.current = on;
    setRecordingState(on);
    setRecordingPref(on);
    if (on) persistRef.current();
  }, []);

  // persist() is referenced by toggleRecording, which is defined first for
  // readability. A ref keeps the dependency graph acyclic without either
  // callback having to be rebuilt when the other changes.
  const persistRef = useRef(persist);
  useEffect(() => {
    persistRef.current = persist;
  }, [persist]);

  // The engine crossfades between modes without restarting the session clock,
  // so changing mode mid-session keeps the Initiation -> Deep progression.
  useEffect(() => {
    // Close the running span BEFORE the mode label changes, or the time
    // spent in the old mode is credited to the new one. Runs whether or not
    // audio is playing; while paused `since` is null and this is a no-op.
    const t = tracker.current;
    if (t && t.mode !== mode) {
      flushSpan();
      t.mode = mode;
    }

    const engine = engineRef.current;
    if (!engine || !engine.running) return;

    // Read the engine's mode BEFORE changing it. setMode early-returns when
    // the mode is unchanged, which means no crossfade and no settle tick -
    // and a split started on that non-event would wait for an onSettle that
    // never comes, freezing the reel at 0:00 forever.
    const prev = engine.currentMode;
    engine.setMode(mode);
    if (prev === mode) return;

    setSplit({
      id: ++splitId.current,
      stage: "rolling",
      from: engine.elapsed,
      modeElapsed: 0,
    });
  }, [mode, flushSpan]);

  // Hold the "+", then let the red clock fold away. Keyed on the whole split
  // object, so an interrupting mode change replaces the timer rather than
  // letting a stale one clear a newer split.
  useEffect(() => {
    if (!split || split.stage !== "summing") return;
    const id = window.setTimeout(() => setSplit(null), SUM_HOLD);
    return () => window.clearTimeout(id);
  }, [split]);

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
        // Fires at the same instant the tick sounds, so the reel landing on
        // 0:00 and the mode audibly setting in are one event, not two.
        onSettle: () =>
          setSplit((s) =>
            s ? { ...s, stage: "settling", modeElapsed: 0 } : s
          ),
      });
      await next.start(modeRef.current);
      engineRef.current = next;
      setPlaying(true);
      setHasStarted(true);

      // A resume continues the same measured session; only a tab that has
      // never played starts a new one. This matches the audio, which resumes
      // from the same phase and the same seed.
      const t = tracker.current;
      if (t) {
        t.mode = modeRef.current;
        t.since = performance.now();
      } else {
        tracker.current = {
          startedAt: Date.now(),
          mode: modeRef.current,
          since: performance.now(),
          acc: {},
        };
      }

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
    // A pause cancels a settle in progress: the engine's pending tick dies
    // with the graph, so nothing would ever advance the split past `rolling`.
    setSplit(null);

    // Stop the clock on the current span and bank the session. Paused time
    // is not listening time, so `since` goes null rather than continuing.
    flushSpan();
    if (tracker.current) tracker.current.since = null;
    persist();
  }, [flushSpan, persist]);

  // Refresh the pane's numbers only while it is open. A session runs for
  // hours; there is no reason to re-render a closed dialog once a second.
  useEffect(() => {
    if (!measureOpen) return;
    const tick = () => setLive(snapshot());
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [measureOpen, snapshot]);

  // Save at every point the session might not survive to be saved later.
  // `visibilitychange` is the reliable one on mobile - `beforeunload` is not
  // fired at all when a backgrounded tab is discarded - and `pagehide`
  // covers desktop navigation away.
  useEffect(() => {
    const save = () => {
      flushSpan();
      persist();
    };
    const onVis = () => {
      if (document.visibilityState === "hidden") save();
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pagehide", save);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pagehide", save);
    };
  }, [flushSpan, persist]);

  // --- dot hints ----------------------------------------------------------

  /**
   * Retire the onboarding tail. Line one is unaffected and keeps answering
   * dead space presses forever.
   */
  const retireTail = useCallback(() => {
    hintsSeenRef.current = true;
    setHintScope("short");
    try {
      window.localStorage.setItem(HINTS_KEY, "1");
    } catch {
      // storage unavailable; the tail may offer itself again next visit
    }
  }, []);

  /**
   * Stop the sequence. `learned` is true when the user did the thing the
   * hints were about to teach - pausing, or opening the command centre. In
   * that case the tail has nothing left to say. An arrow press only cancels:
   * the user is busy, not taught.
   */
  const cancelHints = useCallback(
    (learned: boolean) => {
      if (learned) retireTail(); // true even if no sequence is running
      if (hintRunRef.current === 0) return;
      setHintRun(0);
      deadSpace.current = { n: 0, at: 0 };
    },
    [retireTail]
  );

  const finishHints = useCallback(() => {
    setHintRun(0);
    retireTail();
  }, [retireTail]);

  /** A space press that did nothing because the session was already running. */
  const noteDeadSpace = useCallback(() => {
    if (hintRunRef.current > 0) return; // already answering
    const now = performance.now();
    const d = deadSpace.current;
    d.n = now - d.at <= DEAD_SPACE_WINDOW ? d.n + 1 : 1;
    d.at = now;
    if (d.n >= DEAD_SPACE_TRIGGER) {
      d.n = 0;
      setHintRun((r) => r + 1);
    }
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

  const clearArmTimer = () => {
    if (armTimer.current !== null) {
      window.clearTimeout(armTimer.current);
      armTimer.current = null;
    }
  };

  const disarm = useCallback(() => {
    clearArmTimer();
    armRef.current = { armed: false, dir: 0, at: 0 };
    setArmState("idle");
  }, []);

  /**
   * The gate described at ARM_WINDOW above.
   *
   *   left                       -> nothing (armed-pending)
   *   left, left                 -> one mode
   *   left, left, left           -> two modes
   *
   * Once armed, direction is free: you are demonstrably navigating, so a
   * right after a left steps immediately rather than demanding a fresh
   * double. Only the initial pair must be the same key twice.
   */
  const arrowStep = useCallback(
    (dir: 1 | -1) => {
      const now = performance.now();
      const a = armRef.current;
      clearArmTimer();

      const live2 = a.armed && now - a.at <= ARM_IDLE;
      const completesDouble =
        !a.armed && a.dir === dir && now - a.at <= ARM_WINDOW;

      if (live2 || completesDouble) {
        armRef.current = { armed: true, dir, at: now };
        setArmState("armed");
        armTimer.current = window.setTimeout(disarm, ARM_IDLE);
        stepMode(dir);
        return;
      }

      // First press of a fresh gesture. Deliberately does not move; the dot
      // pulses so the press is visibly acknowledged rather than swallowed.
      armRef.current = { armed: false, dir, at: now };
      setArmState("pending");
      armTimer.current = window.setTimeout(disarm, ARM_WINDOW);
    },
    [disarm, stepMode]
  );

  useEffect(() => clearArmTimer, []);

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
        if (commandOpen || measureOpen) {
          e.preventDefault();
          setCommandOpen(false);
          setMeasureOpen(false);
        }
        return;
      }

      // The two panel chords are handled before the modal guard below, so
      // each one closes the other rather than stacking two dialogs.
      if (e.shiftKey && e.code === "KeyC") {
        e.preventDefault();
        cancelHints(true); // they found it; the tail has nothing left to add
        setMeasureOpen(false);
        setCommandOpen((o) => !o);
        return;
      }

      if (e.shiftKey && e.code === "KeyM") {
        e.preventDefault();
        cancelHints(true);
        setCommandOpen(false);
        setMeasureOpen((o) => !o);
        return;
      }

      // While a dialog is up it owns the keyboard, apart from the keys
      // handled above.
      if (commandOpen || measureOpen) return;

      if (e.code === "Space") {
        e.preventDefault(); // stop the page scrolling
        if (e.repeat) return;
        const engine = engineRef.current;
        if (engine && engine.running) {
          noteDeadSpace();
          return;
        }
        void startAudio();
        return;
      }

      if (e.code === "KeyP" && !e.shiftKey) {
        e.preventDefault();
        cancelHints(true);
        pauseAudio();
        return;
      }

      if (e.code === "ArrowRight" || e.code === "ArrowDown") {
        e.preventDefault();
        if (e.repeat) return; // holding the key must not rush the modes
        cancelHints(false); // busy, not taught: the hints may return
        arrowStep(1);
      } else if (e.code === "ArrowLeft" || e.code === "ArrowUp") {
        e.preventDefault();
        if (e.repeat) return;
        cancelHints(false);
        arrowStep(-1);
      } else if (e.code === "Home") {
        e.preventDefault();
        cancelHints(false);
        scrollTo(MODES[0].id);
      } else if (e.code === "End") {
        e.preventDefault();
        cancelHints(false);
        scrollTo(MODES[MODES.length - 1].id);
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    arrowStep,
    cancelHints,
    commandOpen,
    measureOpen,
    noteDeadSpace,
    pauseAudio,
    scrollTo,
    startAudio,
  ]);

  // session readout, and the slow half of the split timer.
  //
  // Both clocks are derived from the engine, i.e. from the AudioContext's own
  // clock, rather than from counting interval fires. A dropped or throttled
  // interval therefore costs a visual update, never accumulated drift.
  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      const engine = engineRef.current;
      if (!engine || !engine.running) return;
      const e = engine.elapsed;
      setSession({ name: sectionAt(e).name, elapsed: e });

      setSplit((s) => {
        if (!s || s.stage !== "settling") return s;
        // modeElapsed runs from the START of the crossfade, but the red clock
        // starts from the tick, so the delay comes back off.
        const m = Math.max(0, engine.modeElapsed - SETTLE_DELAY);
        if (m >= SETTLE_SECONDS) return { ...s, stage: "summing" };
        return { ...s, modeElapsed: m };
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [playing]);

  // stop audio when the page unmounts, and bank whatever was measured
  useEffect(() => {
    return () => {
      flushSpan();
      persistRef.current();
      engineRef.current?.stop();
      engineRef.current = null;
    };
  }, [flushSpan]);

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
          onClick={() => {
            cancelHints(true);
            setMeasureOpen(false);
            setCommandOpen((o) => !o);
          }}
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

      <MeasurePane
        open={measureOpen}
        onClose={() => setMeasureOpen(false)}
        live={live}
        recording={recording}
        onToggleRecording={toggleRecording}
      />

      <div className="hud">
        <p className="session">
          <strong>{active.label}</strong>
          <span className="blurb">{active.blurb}</span>
        </p>

        <SessionClock
          label={session.name}
          elapsed={session.elapsed}
          paused={paused}
          visible={playing || paused}
          split={split}
          rollMs={SETTLE_DELAY * 1000}
          settleSeconds={SETTLE_SECONDS}
        />

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

        {/* The dot is three things at once: the selection marker the mode bar
            scrolls against, the arrow-arming indicator, and the anchor the
            hint blob grows out of. */}
        <ModeDot
          arm={armState}
          run={hintRun}
          scope={hintScope}
          onFinish={finishHints}
        />
      </div>
    </main>
  );
}
