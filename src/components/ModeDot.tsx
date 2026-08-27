"use client";

import { useEffect, useRef, useState } from "react";

export type ArmState = "idle" | "pending" | "armed";

/**
 * The three things a stuck user needs, in the order they need them.
 *
 * Ordering is the whole design. The first line answers the question they are
 * actually asking right now ("why won't space stop it?"). Only once that is
 * answered does the second line suggest there is a reason for the refusal,
 * and the third says where the rest of it lives. Leading with "Press Shift+C"
 * would be answering a question nobody asked.
 */
const STEPS = [
  "To pause, press P",
  "Want it seamless?",
  "Press Shift + C",
] as const;

/** How long each line stays up, ms. The middle one is a beat, not a read. */
const HOLD = [3200, 2400, 3800] as const;

/**
 * Time the dot spends as a plain dot between lines. Deliberately short: the
 * collapse is what makes the sequence read as one object breathing rather
 * than as three separate notifications.
 */
const GAP = 620;

interface Props {
  arm: ArmState;
  /**
   * Sequence control. 0 is idle and also cancels a running sequence; any
   * increment starts it from the top. A counter rather than a boolean so a
   * second request after a completed run still fires.
   */
  run: number;
  onFinish?: () => void;
}

export default function ModeDot({ arm, run, onFinish }: Props) {
  const [step, setStep] = useState(-1);
  const [shown, setShown] = useState(false);
  const timers = useRef<number[]>([]);
  const finishRef = useRef(onFinish);

  useEffect(() => {
    finishRef.current = onFinish;
  }, [onFinish]);

  useEffect(() => {
    const clearAll = () => {
      timers.current.forEach((id) => window.clearTimeout(id));
      timers.current = [];
    };

    clearAll();
    if (run === 0) {
      setShown(false);
      setStep(-1);
      return;
    }

    // One flat schedule rather than a chain of nested callbacks: every
    // timeout id lands in the same array, so a cancel is one sweep and there
    // is no window in which a stale callback can still fire.
    let t = 0;
    STEPS.forEach((_, i) => {
      timers.current.push(
        window.setTimeout(() => {
          setStep(i);
          setShown(true);
        }, t)
      );
      t += HOLD[i];
      timers.current.push(window.setTimeout(() => setShown(false), t));
      t += GAP;
    });
    timers.current.push(
      window.setTimeout(() => {
        setStep(-1);
        finishRef.current?.();
      }, t)
    );

    return clearAll;
  }, [run]);

  const open = shown && step >= 0;

  return (
    <div className="dotwrap">
      {/* Polite, so it is announced after whatever the user is doing rather
          than interrupting it. The blob is removed from the DOM between
          lines, which is what makes each new line a fresh announcement. */}
      <div className="dothintlive" aria-live="polite">
        {open && <span className="dothint">{STEPS[step]}</span>}
      </div>
      <span
        className="modedot"
        data-arm={arm}
        data-hidden={open ? "true" : undefined}
        aria-hidden="true"
      />
    </div>
  );
}
