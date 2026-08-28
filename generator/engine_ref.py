#!/usr/bin/env python3
"""Offline reference renderer for the real-time Web Audio engine.

WHY THIS FILE EXISTS
--------------------
``src/audio/engine.ts`` is the product. It runs in a browser, and the
environment this project is authored in has no browser, no speakers and no
way to run a page. That means the only claims that could ever be made about
the engine's *output* -- its tempo, whether it produces attack transients,
how wide its dynamic range is -- would otherwise be claims made by reading
code. Reading code is not measurement.

This file closes that hole. It is a numpy re-implementation of the same
synthesis, rendering to a WAV file that can be analysed with a ruler instead
of an opinion. It is the instrument, not the instrument's subject: nothing
here ships to the browser, and the browser never imports it.

It also encodes the second half of the argument. The mode parameters were
derived from a measured profile of Endel's Focus stream
(``endel_focus_profile.json``); ``--compare`` puts this engine's numbers next
to that profile so a deviation is a stated deviation rather than a drift
nobody noticed.

THE CONTRACT WITH presets.ts
----------------------------
``PRESETS``, ``quantize_root`` and ``section_at`` below are a hand-mirror of
``src/audio/presets.ts``. They are duplicated, not imported, because the two
runtimes cannot share a module -- and duplication that nobody checks is
duplication that silently diverges. So ``--check`` parses the TypeScript and
fails when the two disagree. Run it after touching either file. CI does.

WHAT IS FAITHFUL, AND WHAT IS AN APPROXIMATION
----------------------------------------------
Faithful, to the sample:

* the mulberry32 PRNG, so a seed produces the same pad sequence in both
  runtimes;
* every envelope, sampled from the same 128-point curves that engine.ts
  hands to ``setValueCurveAtTime`` and interpolated the same linear way;
* the beat grid, the exponential pad inter-arrival times, the intensity
  automation, the swell, and the drone's phase-modulation index in radians;
* ``StereoPanner``'s equal-power law for a mono input.

Approximate, and deliberately labelled as such:

* ``BiquadFilterNode`` -- the RBJ cookbook lowpass with Q=1 is what the Web
  Audio spec prescribes, but browsers differ in the last bits.
* ``DynamicsCompressorNode`` -- the spec fixes the static curve (soft knee,
  threshold, ratio) but leaves the detector's exact shape loose, and
  browsers disagree with each other. The reduction here is a standard
  peak-following soft-knee compressor with the same four parameters.
* the intensity automation is continuous here, where the engine re-ramps it
  once per 250 ms scheduler tick and therefore trails the ideal curve by up
  to one tick. Over a 75-minute cycle that is not a measurable difference.
* the master output is not dithered and is written at 16 bits.

Consequence, stated plainly: a number out of this file is a measurement of
THIS renderer. It predicts the browser closely for tempo and transients,
where the maths is exact, and less closely for the last decimal of dynamic
range, where the compressor is an approximation. Do not quote a dyn_ratio to
three decimal places and call it a browser measurement.

HISTORY
-------
An earlier version of this file produced the figures quoted in PR #9. It was
never committed and was lost with the sandbox that held it, so those figures
are not reproducible and are not reconciled here. This is a rewrite from
``engine.ts``, and its numbers are the ones that count from now on.

USAGE
-----
    python3 generator/engine_ref.py --check
    python3 generator/engine_ref.py --selftest
    python3 generator/engine_ref.py --measure --all
    python3 generator/engine_ref.py --measure --all --compare --markdown
    python3 generator/engine_ref.py --mode focus --seconds 60 --out focus.wav

Requires numpy. Nothing else -- WAV writing is stdlib ``wave``.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import re
import sys
import wave
from typing import Callable

import numpy as np

# ---------------------------------------------------------------------------
# Mirror of src/audio/presets.ts. Keep in sync; --check enforces it.
# ---------------------------------------------------------------------------

PRESETS: dict[str, dict] = {
    "focus": {
        "root": 110.0,
        "scale": [0, 3, 5, 7, 10],
        "bpm": 60.1,
        "swell": 25.9,
        "sub": {"gain": 0.3, "h2gain": 0.22, "panPeriod": 33.7, "fmDepth": 3.0},
        "pulse": {
            "gain": 0.3,
            "sigma": 0.055,
            "thump": 70.0,
            "body": 220.0,
            "panAlt": 0.1,
        },
        "pad": {
            "gain": 0.038,
            "lenMin": 9.0,
            "lenMax": 16.0,
            "perMin": 14.0,
            "octLo": 1,
            "octHi": 3,
            "attackFrac": 0.45,
        },
        "noise": {"cut": 1200.0, "gain": 0.035},
        "dynFlatten": 0.35,
    },
    "relax": {
        "root": 98.0,
        "scale": [0, 2, 5, 7, 9],
        "bpm": 0.0,
        "swell": 38.0,
        "sub": {"gain": 0.26, "h2gain": 0.16, "panPeriod": 51.0, "fmDepth": 2.0},
        "pulse": {
            "gain": 0.0,
            "sigma": 0.09,
            "thump": 60.0,
            "body": 180.0,
            "panAlt": 0.0,
        },
        "pad": {
            "gain": 0.055,
            "lenMin": 14.0,
            "lenMax": 26.0,
            "perMin": 10.0,
            "octLo": 1,
            "octHi": 3,
            "attackFrac": 0.48,
        },
        "noise": {"cut": 700.0, "gain": 0.03},
        "dynFlatten": 0.25,
    },
    "sleep": {
        "root": 73.42,
        "scale": [0, 3, 5, 7, 10],
        "bpm": 0.0,
        "swell": 55.0,
        "sub": {"gain": 0.34, "h2gain": 0.12, "panPeriod": 74.0, "fmDepth": 1.2},
        "pulse": {
            "gain": 0.0,
            "sigma": 0.12,
            "thump": 50.0,
            "body": 150.0,
            "panAlt": 0.0,
        },
        "pad": {
            "gain": 0.04,
            "lenMin": 20.0,
            "lenMax": 34.0,
            "perMin": 6.0,
            "octLo": 0,
            "octHi": 2,
            "attackFrac": 0.49,
        },
        "noise": {"cut": 380.0, "gain": 0.055},
        "dynFlatten": 0.2,
    },
    "pump": {
        "root": 110.0,
        "scale": [0, 3, 5, 7, 10],
        "bpm": 122.0,
        "swell": 16.0,
        "sub": {"gain": 0.3, "h2gain": 0.26, "panPeriod": 21.0, "fmDepth": 4.0},
        "pulse": {
            "gain": 0.42,
            "sigma": 0.03,
            "thump": 62.0,
            "body": 220.0,
            "panAlt": 0.0,
        },
        "pad": {
            "gain": 0.042,
            "lenMin": 5.0,
            "lenMax": 11.0,
            "perMin": 22.0,
            "octLo": 1,
            "octHi": 4,
            "attackFrac": 0.3,
        },
        "noise": {"cut": 2400.0, "gain": 0.028},
        "dynFlatten": 0.15,
    },
}

MODES = ["focus", "relax", "sleep", "pump"]

SECTIONS = [("initiation", 180.0), ("transition", 720.0), ("deep", 4500.0)]


def quantize_root(root: float, bpm: float) -> float:
    """Mirror of quantizeRoot(): lock the drone to an even cycle count per beat."""
    if bpm <= 0:
        return root
    beat = 60.0 / bpm
    k = max(2.0, 2.0 * round(((root / 2.0) * beat) / 2.0))
    return (2.0 * k) / beat


def section_intensity(elapsed: np.ndarray | float) -> np.ndarray:
    """Mirror of sectionAt().intensity, vectorised over session offsets."""
    t = np.asarray(elapsed, dtype=np.float64)
    out = np.empty_like(t)

    init = t < 180.0
    out[init] = 0.35 + 0.45 * (t[init] / 180.0)

    rest = ~init
    cycle = np.mod(t[rest] - 180.0, 720.0 + 4500.0)
    trans = cycle < 720.0
    vals = np.empty_like(cycle)
    vals[trans] = 0.7 + 0.15 * (cycle[trans] / 720.0)
    u = (cycle[~trans] - 720.0) / 4500.0
    vals[~trans] = 0.82 + 0.1 * np.sin(2 * np.pi * u)
    out[rest] = vals
    return out


def section_name(elapsed: float) -> str:
    if elapsed < 180.0:
        return "initiation"
    cycle = (elapsed - 180.0) % (720.0 + 4500.0)
    return "transition" if cycle < 720.0 else "deep"


# ---------------------------------------------------------------------------
# Mirror of the engine's own primitives
# ---------------------------------------------------------------------------

CURVE_STEPS = 128

# Engine constants that shape the output. Mirrored from engine.ts.
DEFAULT_VOLUME = 0.9
EDGE_FADE = 1.2  # master fade-in applied by start()
SWELL_DEPTH = 0.1  # swellAmt.gain
PAD_FIFTH_GAIN = 0.28  # osc2Gain in schedulePads
PULSE_BODY_GAIN = 0.4  # bodyGain in schedulePulses
SUB_PAN_DEPTH = 0.7  # panAmt.gain
PAD_PAN_SPAN = 1.4  # rand()*1.4 - 0.7
COMP = {"threshold": -24.0, "knee": 30.0, "ratio": 3.0, "attack": 0.25, "release": 1.2}


def mulberry32(seed: int) -> Callable[[], float]:
    """Bit-exact port of the engine's PRNG.

    Transcribed statement by statement from engine.ts rather than from memory.
    mulberry32 is usually published as a one-liner, and a rewrite from memory
    tends to lose one detail of it: the second step ends ``... ) ^ t``. An
    implementation that drops that trailing XOR still looks perfectly random,
    still passes a smoke test, and still produces a completely different pad
    sequence -- which would quietly turn this file into a faithful renderer of
    some other engine.

    ``Math.imul`` returns a signed 32-bit product and ``^`` coerces through
    ToInt32, but both preserve the low 32 bits, so masking to unsigned
    throughout produces identical bit patterns. ``>>>`` applied to a value
    already masked to unsigned is plain ``>>``.
    """
    state = seed & 0xFFFFFFFF

    def rnd() -> float:
        nonlocal state
        state = (state + 0x6D2B79F5) & 0xFFFFFFFF
        a = state
        t = ((a ^ (a >> 15)) * (1 | a)) & 0xFFFFFFFF
        t = (
            (t + (((t ^ (t >> 7)) * (61 | t)) & 0xFFFFFFFF)) & 0xFFFFFFFF
        ) ^ t
        t &= 0xFFFFFFFF
        return ((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296.0

    return rnd


def gaussian_curve(steps: int = CURVE_STEPS) -> np.ndarray:
    x = np.linspace(-4.0, 4.0, steps)
    c = np.exp(-0.5 * x * x)
    c[0] = 0.0
    c[-1] = 0.0
    return c


def raised_cosine_curve(attack_frac: float, steps: int = CURVE_STEPS) -> np.ndarray:
    c = np.empty(steps, dtype=np.float64)
    a = max(1, int(round(steps * attack_frac)))
    i = np.arange(steps)
    rise = i < a
    c[rise] = 0.5 - 0.5 * np.cos(np.pi * i[rise] / a)
    r = steps - a
    j = i[~rise] - a
    c[~rise] = 0.5 + 0.5 * np.cos(np.pi * j / max(1, r - 1))
    c[0] = 0.0
    c[-1] = 0.0
    return c


def apply_curve(curve: np.ndarray, n: int) -> np.ndarray:
    """setValueCurveAtTime: the curve stretched over n samples, linearly.

    The spec interpolates between adjacent curve points; ``np.interp`` is the
    same operation, so an envelope rendered here is the envelope the browser
    schedules, not a lookalike.
    """
    if n <= 1:
        return np.zeros(max(n, 0))
    pos = np.linspace(0.0, len(curve) - 1, n)
    return np.interp(pos, np.arange(len(curve)), curve)


def pan_gains(pan: np.ndarray | float) -> tuple[np.ndarray, np.ndarray]:
    """StereoPannerNode, mono input, equal-power law from the Web Audio spec."""
    p = np.clip(np.asarray(pan, dtype=np.float64), -1.0, 1.0)
    x = (p + 1.0) * 0.5 * (np.pi / 2.0)
    return np.cos(x), np.sin(x)


def biquad_lowpass(x: np.ndarray, sr: int, cutoff: float, q: float = 1.0) -> np.ndarray:
    """RBJ lowpass, the form the Web Audio spec prescribes for BiquadFilter."""
    w0 = 2.0 * np.pi * cutoff / sr
    alpha = np.sin(w0) / (2.0 * q)
    cw = np.cos(w0)
    b0 = (1.0 - cw) / 2.0
    b1 = 1.0 - cw
    b2 = (1.0 - cw) / 2.0
    a0 = 1.0 + alpha
    a1 = -2.0 * cw
    a2 = 1.0 - alpha
    b = np.array([b0, b1, b2]) / a0
    a = np.array([1.0, a1 / a0, a2 / a0])

    y = np.empty_like(x)
    x1 = x2 = y1 = y2 = 0.0
    for i in range(x.shape[0]):
        xi = x[i]
        yi = b[0] * xi + b[1] * x1 + b[2] * x2 - a[1] * y1 - a[2] * y2
        y[i] = yi
        x2, x1 = x1, xi
        y2, y1 = y1, yi
    return y


def compress(stereo: np.ndarray, sr: int) -> np.ndarray:
    """DynamicsCompressorNode with the engine's four settings.

    Soft-knee static curve (threshold -24 dB, knee 30 dB, ratio 3) driven by a
    peak follower with a 0.25 s attack and 1.2 s release. Both channels share
    one reduction, so the stereo image cannot be pulled about by the detector.
    """
    thr = COMP["threshold"]
    knee = COMP["knee"]
    ratio = COMP["ratio"]
    peak = np.max(np.abs(stereo), axis=1)
    level_db = 20.0 * np.log10(np.maximum(peak, 1e-9))

    over = level_db - thr
    target = np.zeros_like(level_db)
    # below the knee: no reduction. inside: quadratic blend. above: full ratio.
    inside = (over > -knee / 2.0) & (over <= knee / 2.0)
    above = over > knee / 2.0
    d = over[inside] + knee / 2.0
    target[inside] = (1.0 / ratio - 1.0) * d * d / (2.0 * knee)
    target[above] = (1.0 / ratio - 1.0) * over[above]

    att = math.exp(-1.0 / (COMP["attack"] * sr))
    rel = math.exp(-1.0 / (COMP["release"] * sr))
    gain_db = np.empty_like(target)
    g = 0.0
    for i in range(target.shape[0]):
        t = target[i]
        coef = att if t < g else rel
        g = coef * g + (1.0 - coef) * t
        gain_db[i] = g

    return stereo * (10.0 ** (gain_db / 20.0))[:, None]


# ---------------------------------------------------------------------------
# Rendering
# ---------------------------------------------------------------------------


def render(
    mode: str,
    seconds: float,
    sr: int = 44100,
    seed: int = 12345,
    phase: float = 0.0,
    volume: float = DEFAULT_VOLUME,
    compressed: bool = True,
    edge_fade: bool = True,
) -> np.ndarray:
    """Render one mode as float stereo, mirroring buildLayer() + the scheduler.

    ``phase`` is the session offset at t=0, exactly as in the engine, so a
    render can start inside Transition or Deep instead of at the top of
    Initiation.
    """
    if mode not in PRESETS:
        raise ValueError(f"unknown mode: {mode}")
    p = PRESETS[mode]
    n = int(round(seconds * sr))
    t = np.arange(n, dtype=np.float64) / sr  # audio time, layer-local
    session = t + phase  # session offset

    # The engine seeds per mode: mulberry32(seed + mode.length * 7919).
    rnd = mulberry32((seed + len(mode) * 7919) & 0xFFFFFFFF)

    root = quantize_root(p["root"], p["bpm"])
    left = np.zeros(n)
    right = np.zeros(n)

    # --- sub drone (centred) + panned 1.5x harmonic -----------------------
    f0 = root / 2.0
    fm_period = p["swell"] * 1.7
    depth = p["sub"]["fmDepth"]
    # An LFO of amplitude depth/fm_period Hz on the frequency param integrates
    # to a phase deviation whose peak is exactly `depth` radians -- which is
    # what the offline model calls its modulation index.
    sub_phase = 2 * np.pi * f0 * t - depth * np.cos(2 * np.pi * t / fm_period) + depth
    sub = np.sin(sub_phase) * p["sub"]["gain"]
    left += sub
    right += sub

    h2 = np.sin(2 * np.pi * f0 * 1.5 * t) * (p["sub"]["h2gain"] * 0.5)
    pan = SUB_PAN_DEPTH * np.sin(2 * np.pi * t / p["sub"]["panPeriod"])
    gl, gr = pan_gains(pan)
    left += h2 * gl
    right += h2 * gr

    # --- intensity-scaled group: noise bed and pads ------------------------
    intensity = section_intensity(session)
    ileft = np.zeros(n)
    iright = np.zeros(n)

    # Noise bed. The engine loops a 4 s stereo buffer whose right channel is
    # the left delayed by one sample; the loop is reproduced so the spectrum
    # of a long render matches a long session rather than matching white noise.
    nbuf = int(4 * sr)
    nrng = np.random.default_rng(seed ^ 0x5EED)
    base = nrng.uniform(-1.0, 1.0, nbuf)
    delayed = np.empty_like(base)
    delayed[0] = 0.0  # engine.ts sets r[0] = 0, not r[-1]
    delayed[1:] = base[:-1]
    idx = np.arange(n) % nbuf
    nl = base[idx]
    nr = delayed[idx]
    cut = p["noise"]["cut"]
    nl = biquad_lowpass(nl, sr, cut)
    nr = biquad_lowpass(nr, sr, cut)
    ileft += nl * p["noise"]["gain"]
    iright += nr * p["noise"]["gain"]

    # Pads. Exponential inter-arrival times, minimum 0.4 s, from the same PRNG
    # in the same call order as schedulePads() -- draw order is part of the
    # contract, not an implementation detail.
    freqs: list[float] = []
    for o in range(p["pad"]["octLo"], p["pad"]["octHi"]):
        for s in p["scale"]:
            freqs.append(root * (2.0 ** (o + s / 12.0)))
    pad_env = raised_cosine_curve(p["pad"]["attackFrac"])
    mean_gap = 60.0 / p["pad"]["perMin"]
    cursor = 0.0
    pad_events = 0
    while cursor < seconds:
        gap = -math.log(1.0 - rnd()) * mean_gap
        cursor += max(0.4, gap)
        if cursor >= seconds:
            break
        f = freqs[int(rnd() * len(freqs))]
        length = p["pad"]["lenMin"] + rnd() * (p["pad"]["lenMax"] - p["pad"]["lenMin"])
        detune = 0.9985 + rnd() * 0.003
        pn = rnd() * PAD_PAN_SPAN - PAD_PAN_SPAN / 2.0

        i0 = int(round(cursor * sr))
        ln = int(round(length * sr))
        i1 = min(n, i0 + ln)
        if i1 <= i0:
            continue
        local = np.arange(i1 - i0) / sr
        env = apply_curve(pad_env, ln)[: i1 - i0]
        sig = np.sin(2 * np.pi * f * detune * local)
        sig = sig + PAD_FIFTH_GAIN * np.sin(2 * np.pi * f * 1.5 * local)
        sig *= env * p["pad"]["gain"]
        pgl, pgr = pan_gains(pn)
        ileft[i0:i1] += sig * pgl
        iright[i0:i1] += sig * pgr
        pad_events += 1

    left += ileft * intensity
    right += iright * intensity

    # --- per-beat pulse (bus, not intensity: intensity is baked into amp) ---
    pulse_events = 0
    if p["pulse"]["gain"] > 0 and p["bpm"] > 0:
        beat = 60.0 / p["bpm"]
        sigma = p["pulse"]["sigma"]
        dur = 8.0 * sigma
        gauss = gaussian_curve()
        k = int(math.ceil(phase / beat)) if phase > 0 else 0
        while True:
            centre = k * beat - phase  # audio time within this render
            t0 = centre - 4.0 * sigma
            if t0 >= seconds:
                break
            if t0 < 0.0:
                # schedulePulses() drops a beat whose window has already begun
                # (`if (t0 < ctx.currentTime) continue`). At phase 0 that means
                # beat 0 never sounds, because its envelope starts 4 sigma
                # before t=0. Rendering a half-envelope here instead would put
                # a transient at sample 0 that the engine never produces.
                k += 1
                continue
            i0 = int(round(t0 * sr))
            ln = int(round(dur * sr))
            a1 = min(n, i0 + ln)
            if a1 > i0:
                env = apply_curve(gauss, ln)[: a1 - i0]
                local = np.arange(a1 - i0) / sr
                sig = np.sin(2 * np.pi * p["pulse"]["thump"] * local)
                sig += PULSE_BODY_GAIN * np.sin(2 * np.pi * p["pulse"]["body"] * local)
                amp = p["pulse"]["gain"] * float(section_intensity(k * beat))
                sig *= env * amp
                alt = p["pulse"]["panAlt"]
                pv = (-alt if k % 2 == 0 else alt) * 2.0 if alt > 0 else 0.0
                bgl, bgr = pan_gains(pv)
                left[i0:a1] += sig * bgl
                right[i0:a1] += sig * bgr
                pulse_events += 1
            k += 1

    # --- swell on the layer bus, then master volume ------------------------
    swell = 1.0 + SWELL_DEPTH * np.sin(2 * np.pi * t / p["swell"])
    left *= swell * volume
    right *= swell * volume

    if edge_fade and phase <= 0.0:
        # start() ramps the master from silence over EDGE_FADE. It is only
        # 1.2 s of a 90 s render, but leaving it out would mean the file does
        # not begin the way the app begins.
        ramp = np.minimum(t / EDGE_FADE, 1.0)
        left *= ramp
        right *= ramp

    out = np.stack([left, right], axis=1)
    render.last_counts = {"pads": pad_events, "pulses": pulse_events}  # type: ignore[attr-defined]
    return compress(out, sr) if compressed else out


def write_wav(path: str, stereo: np.ndarray, sr: int = 44100) -> None:
    peak = float(np.max(np.abs(stereo))) if stereo.size else 0.0
    if peak > 1.0:
        # Report it rather than silently normalising: clipping in the render
        # is information about the engine, not about the file writer.
        print(f"warning: peak {peak:.3f} exceeds full scale; hard-limited", file=sys.stderr)
    data = np.clip(stereo, -1.0, 1.0)
    pcm = (data * 32767.0).astype("<i2")
    with wave.open(path, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes(pcm.tobytes())


# ---------------------------------------------------------------------------
# Measurement
# ---------------------------------------------------------------------------

#: Seconds trimmed from the head before measuring, covering the 1.2 s master
#: fade-in. Rendering is unaffected; only the analysis window moves. Without
#: this the fade itself -- a rise from digital silence -- is correctly
#: identified as the sharpest attack in the file, which is true and useless.
ANALYSIS_SKIP_S = 2.0

# A "sharp attack" is a rise of at least ATTACK_DB inside ATTACK_WINDOW_S of
# the short-term envelope. It is the operational definition of the "string
# pluck" complaint that shaped the engine: every musical envelope is a smooth
# curve, so a compliant render should score zero. The numbers are thresholds,
# not laws -- state them whenever the count is quoted.
ATTACK_DB = 12.0
ATTACK_WINDOW_S = 0.020
ATTACK_RMS_S = 0.020
ENV_HOP_S = 0.005
RMS_WINDOW_S = 0.400


def short_term_rms(mono: np.ndarray, sr: int, window_s: float, hop_s: float) -> np.ndarray:
    w = max(1, int(window_s * sr))
    h = max(1, int(hop_s * sr))
    if mono.shape[0] < w:
        return np.array([float(np.sqrt(np.mean(mono**2)))])
    sq = mono.astype(np.float64) ** 2
    csum = np.concatenate([[0.0], np.cumsum(sq)])
    starts = np.arange(0, mono.shape[0] - w + 1, h)
    return np.sqrt((csum[starts + w] - csum[starts]) / w)


BPM_HOP_S = 0.002
#: 50 ms rather than 20 ms, and then smoothed again below. A short RMS window
#: on a 55-110 Hz drone leaves a strong ripple at twice the carrier in the
#: envelope, and that ripple -- not any beat -- then dominates the
#: autocorrelation. It scored 0.99 at a meaningless lag for Relax, a mode with
#: no pulse layer whatsoever.
BPM_WIN_S = 0.050
#: Zero-phase lowpass corner applied to the RMS contour, in Hz. The fastest
#: tempo in the search band is 200 BPM = 3.33 Hz, so 8 Hz keeps every beat
#: fundamental and its first harmonic while removing carrier leakage.
#:
#: A moving average was tried first and is not sufficient. Sleep's envelope
#: was dominated by components at 18.3 Hz and 73.3 Hz -- the latter being the
#: 73.42 Hz root leaking straight through the RMS window -- and a 40 ms box
#: attenuates 18.3 Hz by only about 13 dB. What survived was enough to put
#: autocorrelation peaks at every multiple of 55 ms, which filled the whole
#: search band with spurious candidates and had a pulseless mode scoring 0.83
#: at a tempo it does not have.
BPM_LOWPASS_HZ = 8.0
BPM_DETREND_S = 2.0
BPM_MIN = 40.0
BPM_MAX = 200.0
#: Below this confidence the tempo estimate is noise dressed as a number, and
#: `measure()` reports 0 BPM rather than a confident-looking fiction.
#:
#: Confidence is the normalised autocorrelation at the chosen lag, so it runs
#: 0..1 and needs no threshold tuning against a moving baseline. The measured
#: separation is wide enough that the exact value hardly matters: Focus scores
#: 0.987 and Pump 0.946, while Relax scores 0.409, Sleep 0.204 and white noise
#: 0.071. Anything from 0.6 to 0.9 would classify all four modes identically.
BPM_CONF_MIN = 0.70


def loudness_envelope(mono: np.ndarray, sr: int) -> tuple[np.ndarray, float]:
    """Detrended short-term RMS contour. Returns (env, frames/s).

    Spectral flux -- the textbook onset function -- is the wrong instrument
    for this engine, and finding that out is half the value of this file.
    Flux detects sudden spectral change, and design note 3 in engine.ts says
    the engine deliberately produces none: every envelope is a smooth curve.
    A flux-based estimator therefore has almost nothing to lock onto, and
    during development it returned 147 BPM for a 60 BPM signal.

    What the pulse layer actually creates is a periodic swelling of LOUDNESS.
    So that is what gets measured. The 2 s moving-average subtraction removes
    the swell and the intensity automation, which are periodic too but an
    order of magnitude slower than any beat.
    """
    r = short_term_rms(mono, sr, BPM_WIN_S, BPM_HOP_S)
    fps = 1.0 / BPM_HOP_S
    if r.size < 64:
        return np.zeros(0), fps
    # Zero-phase: filter forward, then filter the reversed result and reverse
    # back. Running the biquad twice also doubles the rolloff to 24 dB/octave,
    # which is what actually kills the 73 Hz leakage.
    r = biquad_lowpass(r, int(fps), BPM_LOWPASS_HZ, 0.707)
    r = biquad_lowpass(r[::-1], int(fps), BPM_LOWPASS_HZ, 0.707)[::-1]
    w = max(3, int(fps * BPM_DETREND_S) | 1)
    if r.size <= w * 2:
        return np.zeros(0), fps
    r = r - np.convolve(r, np.ones(w) / w, mode="same")
    # Drop half a kernel from each end: `mode="same"` pads with zeros there,
    # so the trend is wrong exactly at the edges.
    return r[w // 2 : -(w // 2)], fps


def measure_bpm(mono: np.ndarray, sr: int) -> tuple[float, float]:
    """Tempo by autocorrelation of the loudness contour.

    Returns (bpm, confidence). Three things this does that a plain argmax does
    not, each of which produced a wrong answer during development:

    * it searches LOCAL MAXIMA, not the largest value in the band. A decaying
      autocorrelation has its largest in-band value at the shortest lag, so a
      plain argmax reported the fastest tempo in the band every time.
    * it corrects the octave error, walking DOWN to the fastest lag that is
      still a strong peak. Half-tempo and double-tempo are both genuine
      peaks; only one of them is the beat. See the comment below for why the
      direction of that walk is the opposite of the intuitive one.
    * it reports the normalised autocorrelation at the chosen lag as a
      confidence, so a mode with no pulse layer at all scores low instead of
      inventing a tempo out of pad noise. `measure()` gates on this.

    Returns the raw estimate regardless of confidence; deciding what to do
    with a weak one is the caller's business.
    """
    env, fps = loudness_envelope(mono, sr)
    if env.size < 64 or not np.any(env):
        return 0.0, 0.0
    x = env - env.mean()
    raw = np.correlate(x, x, mode="full")[x.size - 1 :]
    # Unbiased: without dividing by the overlap count, long lags are damped
    # purely by having fewer terms, which biases every estimate fast.
    counts = np.arange(x.size, 0, -1)
    ac = raw / counts
    if ac[0] <= 0:
        return 0.0, 0.0
    ac = ac / ac[0]

    lo = max(2, int(round(fps * 60.0 / BPM_MAX)))
    hi = min(ac.size - 2, int(round(fps * 60.0 / BPM_MIN)))
    if hi <= lo + 2:
        return 0.0, 0.0

    band = ac[lo : hi + 1]
    peaks = [
        i + lo
        for i in range(1, band.size - 1)
        if band[i] > band[i - 1] and band[i] >= band[i + 1]
    ]
    if not peaks:
        return 0.0, 0.0
    best = max(peaks, key=lambda i: ac[i])

    # Octave correction, and the direction of it is the subtle part. Every
    # integer multiple of the true beat period is ALSO a period of the signal,
    # so ac[2L] is always nearly as strong as ac[L] and a rule that prefers
    # the slower lag halves the tempo every time -- which is exactly what the
    # first version did, turning 122 BPM into 60.44. The half-lag carries no
    # such guarantee: it is only strong if the beat really is twice as fast.
    # So: walk DOWN to the shortest lag that is still a strong local maximum.
    #
    # The search has to be a tolerance window, not `best // 2`. The strongest
    # peak for a 122 BPM train sits at lag 496 and the true beat at lag 247;
    # 496 // 2 is 248, which is next to the peak and not a local maximum, so
    # an exact-index test silently found nothing and reported half tempo.
    def peak_near(target: float) -> int | None:
        tol = max(2.0, target * 0.03)
        near = [p for p in peaks if abs(p - target) <= tol]
        return max(near, key=lambda i: ac[i]) if near else None

    for _ in range(2):
        half = peak_near(best / 2.0)
        if half is not None and half >= lo and ac[half] >= 0.80 * ac[best]:
            best = half

    # Parabolic refinement. At 122 BPM one hop is 0.4% of the beat, and the
    # second decimal is the entire point of the number.
    y0, y1, y2 = ac[best - 1], ac[best], ac[best + 1]
    denom = y0 - 2 * y1 + y2
    lag = best + (0.5 * (y0 - y2) / denom) if denom != 0 else float(best)

    return float(60.0 * fps / lag), float(ac[best])


def measure_attacks(mono: np.ndarray, sr: int) -> int:
    """Count rises of >= ATTACK_DB inside ATTACK_WINDOW_S of the RMS envelope.

    The window is 20 ms rather than a few samples for a reason discovered the
    hard way: a 4 ms RMS window on a filtered noise bed fluctuates by more
    than 12 dB by chance, and the first version of this function duly reported
    17 attack transients in a mode that has no percussive layer at all. The
    measurement was wrong, not the engine.
    """
    env = short_term_rms(mono, sr, ATTACK_RMS_S, ENV_HOP_S)
    db = 20.0 * np.log10(np.maximum(env, 1e-9))
    lag = max(1, int(round(ATTACK_WINDOW_S / ENV_HOP_S)))
    if db.size <= lag:
        return 0
    rise = db[lag:] - db[:-lag]
    # Ignore rises out of near-silence: a step up from nothing is a huge dB
    # figure that no listener hears as an attack.
    audible = db[:-lag] > (np.max(db) - 40.0)
    hits = (rise >= ATTACK_DB) & audible
    # Collapse runs, so one transient counts once rather than once per hop.
    return int(np.count_nonzero(hits & ~np.concatenate([[False], hits[:-1]])))


def measure_dynamics(mono: np.ndarray, sr: int) -> float:
    """Loud-to-quiet ratio of the short-term RMS: 90th percentile over 10th.

    Percentiles rather than peak-over-floor, because a single pad swell should
    not define the whole session's dynamics. This is NOT the same statistic as
    the ``dyn_ratio`` in endel_focus_profile.json, which was computed from AAC
    frame gains rather than from audio; the two are the same idea measured in
    different domains, so compare them as directions, not as equals.
    """
    r = short_term_rms(mono, sr, RMS_WINDOW_S, RMS_WINDOW_S / 4.0)
    lo = float(np.percentile(r, 10))
    if lo <= 0:
        return 0.0
    return float(np.percentile(r, 90) / lo)


def measure_slow_cycle(mono: np.ndarray, sr: int) -> float:
    """Dominant period of the loudness envelope, in seconds, over 8..90 s."""
    hop = 0.05
    r = short_term_rms(mono, sr, 0.2, hop)
    if r.size < 64:
        return 0.0
    x = r - r.mean()
    spec = np.abs(np.fft.rfft(x * np.hanning(x.size)))
    freqs = np.fft.rfftfreq(x.size, d=hop)
    band = (freqs >= 1.0 / 90.0) & (freqs <= 1.0 / 8.0)
    if not np.any(band) or not np.any(spec[band]):
        return 0.0
    f = freqs[band][int(np.argmax(spec[band]))]
    return float(1.0 / f) if f > 0 else 0.0


def measure(mode: str, seconds: float, sr: int, seed: int) -> dict:
    audio = render(mode, seconds, sr=sr, seed=seed)
    # Skip the master fade-in before measuring. It is a real part of the app,
    # so it stays in the render and in any WAV written out, but a 1.2 s ramp
    # up from silence is a 20 dB rise that the attack detector is right to
    # notice and that nobody would call a transient in the music.
    head = int(ANALYSIS_SKIP_S * sr)
    mono = audio[head:].mean(axis=1) if audio.shape[0] > head * 2 else audio.mean(axis=1)
    bpm, conf = measure_bpm(mono, sr)
    if conf < BPM_CONF_MIN:
        # Relax and Sleep have no pulse layer. Reporting a number here would
        # be inventing a tempo for a mode that deliberately has none.
        bpm = 0.0
    counts = getattr(render, "last_counts", {})
    nominal = PRESETS[mode]["bpm"]
    return {
        "mode": mode,
        "seconds": seconds,
        "sr": sr,
        "seed": seed,
        "bpm_nominal": nominal,
        "bpm_measured": round(bpm, 2),
        "bpm_error_pct": (
            round(100.0 * (bpm - nominal) / nominal, 2) if nominal > 0 else None
        ),
        "bpm_confidence": round(conf, 3),
        "sharp_attacks": measure_attacks(mono, sr),
        "dyn_ratio": round(measure_dynamics(mono, sr), 3),
        "slow_cycle_s": round(measure_slow_cycle(mono, sr), 1),
        "swell_nominal_s": PRESETS[mode]["swell"],
        "peak": round(float(np.max(np.abs(audio))), 4),
        "rms": round(float(np.sqrt(np.mean(mono**2))), 5),
        "pad_events": counts.get("pads"),
        "pulse_events": counts.get("pulses"),
    }


# ---------------------------------------------------------------------------
# Self-test: does the instrument read true?
# ---------------------------------------------------------------------------

#: The first eight outputs of mulberry32(12345 + 5*7919) -- the seed the engine
#: derives for a five-letter mode -- captured by running the ACTUAL JavaScript
#: from engine.ts under Node. Not derived from the Python, so it can fail.
PRNG_GOLDEN = [
    0.40098222345113754,
    0.10131936753168702,
    0.4915361094754189,
    0.9022832999471575,
    0.6380754325073212,
    0.03635176667012274,
    0.023182000732049346,
    0.3933679787442088,
]
#: mulberry32(0), first four outputs, same provenance.
PRNG_GOLDEN_ZERO = [
    0.26642920868471265,
    0.0003297457005828619,
    0.2232720274478197,
    0.1462021479383111,
]


def _click_train(bpm: float, seconds: float, sr: int, sigma: float) -> np.ndarray:
    """A drone plus gaussian pulses at a known tempo: a signal of known truth."""
    n = int(seconds * sr)
    t = np.arange(n) / sr
    x = 0.3 * np.sin(2 * np.pi * 55.0 * t)  # something for the pulse to sit on
    beat = 60.0 / bpm
    gauss = gaussian_curve()
    k = 1
    while k * beat + 4 * sigma < seconds:
        i0 = int((k * beat - 4 * sigma) * sr)
        ln = int(8 * sigma * sr)
        env = apply_curve(gauss, ln)
        local = np.arange(ln) / sr
        x[i0 : i0 + ln] += 0.35 * env * np.sin(2 * np.pi * 70.0 * local)
        k += 1
    return x


def selftest() -> int:
    """Check the measurement code against signals whose answers are known.

    A measurement tool that has never been pointed at a known quantity is just
    a number generator. Every check here failed at least once while this file
    was being written, which is the only reason any of them are worth running.
    """
    sr = 44100
    fails: list[str] = []

    def check(name: str, ok: bool, detail: str) -> None:
        print(f"  {'PASS' if ok else 'FAIL'}  {name}: {detail}")
        if not ok:
            fails.append(name)

    print("PRNG")
    r = mulberry32(12345 + 5 * 7919)
    got = [r() for _ in range(8)]
    check(
        "mulberry32 matches engine.ts",
        all(abs(a - b) < 1e-15 for a, b in zip(got, PRNG_GOLDEN)),
        f"first value {got[0]:.17f}",
    )
    r0 = mulberry32(0)
    got0 = [r0() for _ in range(4)]
    check(
        "mulberry32(0) matches engine.ts",
        all(abs(a - b) < 1e-15 for a, b in zip(got0, PRNG_GOLDEN_ZERO)),
        f"first value {got0[0]:.17f}",
    )

    print("tempo")
    for bpm, sigma in ((60.1, 0.055), (122.0, 0.03), (90.0, 0.04)):
        x = _click_train(bpm, 60.0, sr, sigma)
        got_bpm, conf = measure_bpm(x, sr)
        err = abs(got_bpm - bpm) / bpm * 100.0
        check(
            f"{bpm} BPM click train",
            err < 1.0 and conf >= BPM_CONF_MIN,
            f"measured {got_bpm:.2f} ({err:.2f}% off, confidence {conf:.3f})",
        )

    print("tempo rejection")
    rng = np.random.default_rng(7)
    noise = 0.2 * rng.normal(size=sr * 30)
    _, conf = measure_bpm(noise, sr)
    check(
        "white noise has no tempo",
        conf < BPM_CONF_MIN,
        f"confidence {conf:.3f} (threshold {BPM_CONF_MIN})",
    )

    print("attack detection")
    t = np.arange(sr * 10) / sr
    smooth = _click_train(60.0, 10.0, sr, 0.055)
    check(
        "smooth gaussian pulses are not attacks",
        measure_attacks(smooth, sr) == 0,
        f"{measure_attacks(smooth, sr)} counted",
    )
    # A plucked string over a quiet bed: ~26 dB in one 20 ms window. This is
    # the thing the engine is designed never to produce, so the detector has
    # to be able to see it, or "0 sharp attacks" would prove nothing.
    stepped = 0.03 * np.sin(2 * np.pi * 55.0 * t)
    burst = int(0.05 * sr)
    for k in range(1, 9):
        i = int(k * sr)
        stepped[i : i + burst] += 0.6 * np.exp(-np.arange(burst) / (0.02 * sr)) * np.sin(
            2 * np.pi * 400.0 * t[:burst]
        )
    got_att = measure_attacks(stepped, sr)
    check(
        "hard gain steps ARE attacks",
        got_att >= 6,
        f"{got_att} counted out of 8 steps",
    )

    print("engine output")
    for mode in MODES:
        row = measure(mode, 45.0, sr, 4242)
        nominal = PRESETS[mode]["bpm"]
        if nominal > 0:
            err = abs(row["bpm_measured"] - nominal) / nominal * 100.0
            check(
                f"{mode} holds its tempo",
                err < 1.0,
                f"{row['bpm_measured']:.2f} vs {nominal} nominal ({err:.2f}%)",
            )
        else:
            check(
                f"{mode} reports no tempo",
                row["bpm_measured"] == 0.0,
                f"confidence {row['bpm_confidence']}",
            )
        check(
            f"{mode} has no attack transients",
            row["sharp_attacks"] == 0,
            f"{row['sharp_attacks']} counted",
        )
        check(
            f"{mode} does not clip",
            row["peak"] <= 1.0,
            f"peak {row['peak']}",
        )

    print()
    if fails:
        print(f"{len(fails)} check(s) failed: {', '.join(fails)}", file=sys.stderr)
        return 1
    print("all checks passed")
    return 0


# ---------------------------------------------------------------------------
# presets.ts drift check
# ---------------------------------------------------------------------------


def _ts_numbers(ts: str, mode: str) -> dict:
    """Pull one mode's block out of presets.ts and read its numeric leaves.

    Deliberately dumb: it matches ``key: number`` pairs inside the mode's
    braces rather than trying to parse TypeScript. A structural change to
    presets.ts should make this fail loudly, which is the correct outcome --
    it means a human has to look at both files again.
    """
    start = ts.find(f"\n  {mode}: {{")
    if start < 0:
        raise ValueError(f"mode block not found in presets.ts: {mode}")
    depth = 0
    i = ts.index("{", start)
    for j in range(i, len(ts)):
        if ts[j] == "{":
            depth += 1
        elif ts[j] == "}":
            depth -= 1
            if depth == 0:
                block = ts[i : j + 1]
                break
    else:
        raise ValueError(f"unbalanced braces for mode {mode}")
    out: dict[str, float] = {}
    for key, val in re.findall(r"(\w+):\s*(-?\d+(?:\.\d+)?)\s*[,\n}]", block):
        out[key] = float(val)
    scale = re.search(r"scale:\s*\[([^\]]*)\]", block)
    if scale:
        out["scale"] = [float(v) for v in scale.group(1).split(",") if v.strip()]
    return out


def check_sync(presets_path: str) -> int:
    with open(presets_path, "r", encoding="utf-8") as fh:
        ts = fh.read()
    problems: list[str] = []
    for mode in MODES:
        want = _ts_numbers(ts, mode)
        p = PRESETS[mode]
        flat: dict[str, float | list] = {
            "root": p["root"],
            "bpm": p["bpm"],
            "swell": p["swell"],
            "dynFlatten": p["dynFlatten"],
            "scale": [float(s) for s in p["scale"]],
        }
        for group in ("sub", "pulse", "pad", "noise"):
            for k, v in p[group].items():
                flat[k] = float(v)
        for k, v in flat.items():
            if k not in want:
                problems.append(f"{mode}.{k}: missing from presets.ts")
            elif want[k] != v:
                problems.append(f"{mode}.{k}: presets.ts={want[k]} engine_ref={v}")

    # Tolerant of quote style, spacing and trailing zeros. An exact literal
    # match here would turn a Prettier run into a failed build, which is a
    # drift check that cries wolf rather than one that catches drift.
    for name, seconds in SECTIONS:
        pat = re.compile(
            r"""\[\s*["']%s["']\s*,\s*%s(?:\.0+)?\s*[,\]]"""
            % (re.escape(name), re.escape(str(int(seconds))))
        )
        if not pat.search(ts):
            problems.append(f"SECTIONS entry not found in presets.ts: {name} {seconds}")

    if problems:
        print("presets.ts and engine_ref.py disagree:", file=sys.stderr)
        for p_ in problems:
            print(f"  - {p_}", file=sys.stderr)
        return 1
    print(f"presets.ts matches engine_ref.py ({len(MODES)} modes checked)")
    return 0


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def _markdown(rows: list[dict], profile: dict | None) -> str:
    lines = [
        "| mode | bpm nominal | bpm measured | error | conf | sharp attacks | dyn_ratio | slow cycle (s) | swell (s) | peak |",
        "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ]
    for r in rows:
        err = "n/a" if r["bpm_error_pct"] is None else f"{r['bpm_error_pct']:+.2f}%"
        lines.append(
            f"| {r['mode']} | {r['bpm_nominal']:.1f} | {r['bpm_measured']:.2f} | {err} "
            f"| {r['bpm_confidence']:.3f} | {r['sharp_attacks']} | {r['dyn_ratio']:.3f} "
            f"| {r['slow_cycle_s']:.1f} | {r['swell_nominal_s']:.1f} | {r['peak']:.4f} |"
        )
    if profile:
        lines += [
            "",
            "Endel Focus reference profile (measured from the bitstream, not from decoded audio):",
            "",
            f"- bpm {profile.get('bpm_bits')} | slow cycle {profile.get('slow_cycle_s')} s "
            f"| onsets/s {profile.get('onset_per_sec')} | dyn_ratio {profile.get('dyn_ratio')}",
        ]
        focus = next((r for r in rows if r["mode"] == "focus"), None)
        if focus and profile.get("dyn_ratio"):
            d = focus["dyn_ratio"] - float(profile["dyn_ratio"])
            lines.append(
                f"- focus deviates from the profile by {d:+.3f} on dyn_ratio "
                "(a known, deliberate deviation: the only lever is pulse gain, "
                "and cutting it regresses the 'too ethereal' complaint). Note the "
                "two dyn_ratio figures are computed in different domains and are "
                "comparable as directions, not as equals."
            )
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    here = os.path.dirname(os.path.abspath(__file__))
    default_presets = os.path.join(here, "..", "src", "audio", "presets.ts")

    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--mode", choices=MODES, help="render or measure one mode")
    ap.add_argument("--all", action="store_true", help="every mode")
    ap.add_argument("--seconds", type=float, default=90.0)
    ap.add_argument("--sr", type=int, default=44100)
    ap.add_argument("--seed", type=int, default=12345)
    ap.add_argument("--phase", type=float, default=0.0, help="session offset at t=0")
    ap.add_argument("--out", help="write a WAV here (single mode only)")
    ap.add_argument("--measure", action="store_true")
    ap.add_argument("--check", action="store_true", help="verify sync with presets.ts")
    ap.add_argument(
        "--selftest",
        action="store_true",
        help="verify the measurement code against known signals",
    )
    ap.add_argument("--presets", default=default_presets)
    ap.add_argument("--compare", action="store_true", help="include the Endel profile")
    ap.add_argument("--markdown", action="store_true")
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args(argv)

    if args.selftest:
        rc = selftest()
        if rc or not (args.check or args.measure or args.out or args.all):
            return rc

    if args.check:
        rc = check_sync(os.path.normpath(args.presets))
        if not (args.measure or args.out or args.all):
            return rc
        if rc:
            return rc

    if args.out:
        if not args.mode:
            print("--out needs --mode", file=sys.stderr)
            return 2
        audio = render(
            args.mode, args.seconds, sr=args.sr, seed=args.seed, phase=args.phase
        )
        write_wav(args.out, audio, args.sr)
        print(f"wrote {args.out} ({args.seconds:.0f}s {args.mode} @ {args.sr} Hz)")
        if not args.measure:
            return 0

    if args.measure or args.all:
        modes = MODES if args.all or not args.mode else [args.mode]
        rows = [measure(m, args.seconds, args.sr, args.seed) for m in modes]
        profile = None
        if args.compare:
            path = os.path.join(here, "endel_focus_profile.json")
            if os.path.exists(path):
                with open(path, "r", encoding="utf-8") as fh:
                    profile = json.load(fh)
        if args.json:
            print(json.dumps({"rows": rows, "profile": profile}, indent=2))
        elif args.markdown:
            print(_markdown(rows, profile))
        else:
            for r in rows:
                err = "n/a" if r["bpm_error_pct"] is None else f"{r['bpm_error_pct']:+.2f}%"
                print(
                    f"{r['mode']:>6}  bpm {r['bpm_measured']:7.2f} (nominal "
                    f"{r['bpm_nominal']:6.1f}, {err}, conf {r['bpm_confidence']:.3f})  "
                    f"attacks {r['sharp_attacks']:>3}  dyn {r['dyn_ratio']:.3f}  "
                    f"cycle {r['slow_cycle_s']:5.1f}s  peak {r['peak']:.4f}"
                )
        return 0

    ap.print_help()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
