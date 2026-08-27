"use client";

import { useRef } from "react";
import { useDialogFocus } from "../lib/useDialogFocus";

/**
 * A single command row. `keys` are rendered as separate <kbd> elements so a
 * chord reads as "SHIFT + C" rather than as one opaque token.
 *
 * `sep` is what goes between them. It defaults to "+" (press together). Set
 * it to "then" for a sequence: "SHIFT + C" and "LEFT then LEFT" are entirely
 * different instructions and the panel must not render them identically.
 */
export interface Command {
  keys: string[];
  label: string;
  detail?: string;
  sep?: string;
}

export const COMMANDS: Command[] = [
  {
    keys: ["Space"],
    label: "Begin",
    detail:
      "Starts the session. Audio can only begin from a key press or click \u2014 browsers require it.",
  },
  {
    keys: ["P"],
    label: "Pause",
    detail:
      "Fades out and holds your place. Space resumes from the same point in the session.",
  },
  {
    keys: ["\u2190", "\u2190"],
    sep: "then",
    label: "Change mode",
    detail:
      "Press twice. The first arrow arms and does not move; the second moves, and further single presses keep moving while the dot glows. Scrolling or clicking the bar needs no such confirmation \u2014 you already reached for it.",
  },
  {
    keys: ["Shift", "M"],
    label: "Measure",
    detail:
      "How long this session has run, and how it divided between modes. History and CSV export are in the same panel. Kept on this device only, and can be switched off there.",
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

export default function CommandCenter({ open, onClose }: Props) {
  const panelRef = useRef<HTMLDivElement | null>(null);

  useDialogFocus(open, panelRef);

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
                  <span key={`${k}-${i}`} className="cmdkeywrap">
                    {i > 0 && (
                      <span className="cmdplus">{c.sep ?? "+"}</span>
                    )}
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
