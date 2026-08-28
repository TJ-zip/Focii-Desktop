"use client";

/**
 * The offer to stop settling in.
 *
 * A session opens in Initiation: 180 seconds during which intensity climbs
 * from 0.35 to 0.80 so the sound arrives rather than starts. That ramp is the
 * right default and the wrong one for a listener who is already in the state
 * the mode is trying to produce. This is the escape hatch, and it is phrased
 * as a question rather than a command because it is asking permission to be
 * more, not offering to be less. Nothing is killed by taking it -- the session
 * is fast-forwarded past the ramp and continues normally.
 *
 * WHY IT WITHDRAWS. An always-available button would be a permanent invitation
 * to fiddle, which is the opposite of what this app is for. It appears a few
 * seconds in -- long enough that the mode is audible and the question is
 * answerable -- and leaves on its own. Ignoring it is a valid answer and costs
 * nothing.
 *
 * WHY IT COMES BACK ON EVERY MODE CHANGE. Switching mode does not restart the
 * session clock, but it does restart the listener's judgement of it: the sound
 * is new again, and the question "do I need to ease into this?" is genuinely
 * open again. The window is therefore keyed to the mode, not to the session.
 * It is suppressed once the session is already out of Initiation, because
 * there would be nothing left to skip.
 *
 * WHY IT SITS WHERE IT SITS. Between the mode name and the session clock --
 * the gap directly above the settling indicator, not below it. That gap is
 * where the eye already is, and the prompt emanates from it rather than
 * arriving from an edge. The slot has zero height so the prompt's appearance
 * cannot shove the clock down the page mid-session, which would be far more
 * distracting than the prompt itself.
 */

import { useEffect, useRef, useState } from "react";
import type { Mode } from "@/audio/presets";
import styles from "./SkipPrompt.module.css";

export interface SkipWindow {
  /**
   * The word on the button. Always a question, and always the question that
   * mode's listener would actually be asking -- not a generic "Skip". Focus
   * wants to attack the work; relax wants to feel better; sleep wants it
   * easier; pump wants it harder. The verb belongs to the listener's goal,
   * not to the software's mechanism.
   */
  label: string;
  /** Seconds after the window opens at which the prompt appears. */
  at: number;
  /** Seconds after the window opens at which it withdraws again. */
  until: number;
}

/**
 * Per-mode timing, in seconds from the start of the mode.
 *
 * The offsets are not uniform and should not be made uniform. They track how
 * long each mode takes to become recognisable, and how long a listener in that
 * state can tolerate something asking them a question:
 *
 * - pump appears almost immediately and lingers -- someone reaching for pump
 *   has already decided they want more, and is moving anyway.
 * - sleep appears early but is given the longest patience, because a listener
 *   settling down is not going to answer quickly.
 * - focus waits the longest before appearing (it lands with the settle tick at
 *   4s, so the question follows the confirmation rather than pre-empting it)
 *   and gets a middling window.
 * - relax has the shortest window of all. If relaxing is working, being asked
 *   about it repeatedly is the thing most likely to stop it working.
 */
export const SKIP_WINDOWS: Record<Mode, SkipWindow> = {
  focus: { label: "Attack?", at: 4, until: 14 },
  relax: { label: "Better?", at: 3, until: 10 },
  sleep: { label: "Easier?", at: 2, until: 15 },
  pump: { label: "Harder?", at: 1, until: 15 },
};

/**
 * Must match the transition duration in SkipPrompt.module.css. The component
 * stays mounted this long after `open` goes false so the exit animation can
 * finish; unmounting immediately would make it vanish rather than withdraw.
 */
const EXIT_MS = 420;

interface Props {
  mode: Mode;
  open: boolean;
  onSkip: () => void;
}

export default function SkipPrompt({ mode, open, onSkip }: Props) {
  const [held, setHeld] = useState(false);
  const [shown, setShown] = useState(false);

  // The label is frozen while the prompt is on screen. Without this, changing
  // mode during the withdrawal animation would swap the word mid-fade -- the
  // prompt would appear to be answering a question nobody asked.
  const labelRef = useRef(SKIP_WINDOWS[mode].label);
  if (open) labelRef.current = SKIP_WINDOWS[mode].label;

  useEffect(() => {
    if (open) {
      setHeld(true);
      // Two frames, not one. The first render with held=true paints the
      // start state; a single rAF can still run before that paint, in which
      // case the browser sees only the end state and there is no transition
      // at all. The second frame guarantees the start state has been painted.
      let inner = 0;
      const outer = requestAnimationFrame(() => {
        inner = requestAnimationFrame(() => setShown(true));
      });
      return () => {
        cancelAnimationFrame(outer);
        cancelAnimationFrame(inner);
      };
    }
    setShown(false);
    const t = window.setTimeout(() => setHeld(false), EXIT_MS);
    return () => window.clearTimeout(t);
  }, [open]);

  if (!held) return null;

  const label = labelRef.current;

  return (
    <div className={styles.slot}>
      <button
        type="button"
        className={styles.button}
        data-on={shown ? "true" : "false"}
        // The visible word is a single question and gives a screen reader
        // nothing to act on, so the accessible name carries the whole offer.
        aria-label={`${label} Skip settling in and go straight to the fuller sound.`}
        onClick={onSkip}
        tabIndex={shown ? 0 : -1}
      >
        {label}
      </button>
    </div>
  );
}
