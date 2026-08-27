"use client";

import { useEffect, useRef } from "react";

/**
 * A single command row. `keys` are rendered as separate <kbd> elements so a
 * chord reads as "SHIFT + C" rather than as one opaque token.
 */
export interface Command {
  keys: string[];
  label: string;
  detail?: string;
}

export const COMMANDS: Command[] = [
  {
    keys: ["Space"],
    label: "Begin",
    detail: "Starts the session. Audio can only begin from a key press or click — browsers require it.",
  },
  {
    keys: ["P"],
    label: "Pause",
    detail: "Fades out and holds your place. Space resumes from the same point in the session.",
  },
  {
    keys: ["\u2190", "\u2192"],
    label: "Change mode",
    detail: "Crossfades without restarting the session clock. Scrolling the mode bar does the same.",
  },
  {
    keys: ["Shift", "C"],
    label: "Command centre",
    detail: "This panel.",
  },
  {
    keys: ["Esc"],
    label: "Close",
  },
];

interface Props {
  open: boolean;
  onClose: () => void;
}

/** Elements that can hold focus inside the dialog. */
const FOCUSABLE =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export default function CommandCenter({ open, onClose }: Props) {
  const panelRef = useRef<HTMLDivElement | null>(null);

  // Focus management. Two obligations, both easy to forget:
  //   1. move focus INTO the dialog, or a keyboard user is stranded outside a
  //      modal that is visually covering everything;
  //   2. put focus BACK where it was on close, or the next Tab starts from the
  //      top of the document.
  // Tab is also cycled within the panel so focus cannot wander to the mode bar
  // underneath while the scrim is up.
  useEffect(() => {
    if (!open) return;
    const node = panelRef.current;
    if (!node) return;

    const previous = document.activeElement as HTMLElement | null;
    const focusables = () =>
      Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => !el.hasAttribute("disabled")
      );

    (focusables()[0] ?? node).focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const list = focusables();
      if (list.length === 0) {
        e.preventDefault();
        return;
      }
      const first = list[0];
      const last = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    node.addEventListener("keydown", onKeyDown);
    return () => {
      node.removeEventListener("keydown", onKeyDown);
      previous?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="cmdscrim" onMouseDown={onClose}>
      <div
        ref={panelRef}
        className="cmdpanel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cmdtitle"
        tabIndex={-1}
        // The scrim closes on click; the panel must not, or every click inside
        // it would bubble up and dismiss the dialog.
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="cmdhead">
          <h2 id="cmdtitle">Commands</h2>
          <button
            type="button"
            className="cmdclose"
            onClick={onClose}
            aria-label="Close commands"
          >
            <span aria-hidden="true">&times;</span>
          </button>
        </div>

        <ul className="cmdlist">
          {COMMANDS.map((c) => (
            <li key={c.label} className="cmdrow">
              <span className="cmdkeys">
                {c.keys.map((k, i) => (
                  <span key={k} className="cmdkeywrap">
                    {i > 0 && <span className="cmdplus">+</span>}
                    <kbd>{k}</kbd>
                  </span>
                ))}
              </span>
              <span className="cmdtext">
                <span className="cmdlabel">{c.label}</span>
                {c.detail && <span className="cmddetail">{c.detail}</span>}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
