"""Soundscape v1.1 sample generator — Sleep / Relax / Pump.
Pure numpy + stdlib wave. Loop-safe (tail crossfades into head).
Delivery: 16-bit stereo WAV, each < 10 MB.
"""
import numpy as np
import wave

RNG = np.random.default_rng


# ---------- helpers ----------
def fft_filter(x, sr, shape_fn):
    """Filter mono signal by shaping its spectrum. shape_fn(freqs)->gain."""
    n = len(x)
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(n, 1 / sr)
    X *= shape_fn(f)
    return np.fft.irfft(X, n)


def pink_noise(n, sr, rng):
    w = rng.standard_normal(n)
    return fft_filter(w, sr, lambda f: 1.0 / np.sqrt(np.maximum(f, 1.0)))


def brown_noise(n, sr, rng):
    w = rng.standard_normal(n)
    b = np.cumsum(w)
    # remove drift
    t = np.arange(n)
    b -= np.polyval(np.polyfit(t, b, 1), t)
    return b / (np.abs(b).max() + 1e-9)


def lowpass(x, sr, fc, order=2.0):
    return fft_filter(x, sr, lambda f: 1.0 / (1.0 + (f / fc) ** (2 * order)))


def highpass(x, sr, fc, order=2.0):
    return fft_filter(x, sr, lambda f: 1.0 / (1.0 + (fc / np.maximum(f, 1e-3)) ** (2 * order)))


def env_ar(n, sr, a, r):
    """attack/release envelope over n samples"""
    e = np.ones(n)
    na, nr = int(a * sr), int(r * sr)
    na, nr = min(na, n), min(nr, n)
    if na > 0:
        e[:na] = np.linspace(0, 1, na) ** 2
    if nr > 0:
        e[-nr:] *= np.linspace(1, 0, nr) ** 2
    return e


def place(buf, sig, start):
    end = min(start + len(sig), len(buf))
    if end > start:
        buf[start:end] += sig[: end - start]


def loopify(stereo, sr, xfade=4.0):
    """Crossfade last xfade seconds into the first, trim tail -> gapless loop."""
    nx = int(xfade * sr)
    head = stereo[:, :nx].copy()
    tail = stereo[:, -nx:].copy()
    w = np.linspace(0, 1, nx)
    stereo[:, :nx] = tail * (1 - w) + head * w
    return stereo[:, :-nx]


def write_wav(path, stereo, sr):
    peak = np.abs(stereo).max() + 1e-9
    pcm = (stereo / peak * 0.89 * 32767).astype(np.int16)
    inter = np.empty(pcm.shape[1] * 2, dtype=np.int16)
    inter[0::2], inter[1::2] = pcm[0], pcm[1]
    with wave.open(path, "wb") as f:
        f.setnchannels(2)
        f.setsampwidth(2)
        f.setframerate(sr)
        f.writeframes(inter.tobytes())


def pan_lfo(n, sr, rate, depth, phase=0.0):
    t = np.arange(n) / sr
    p = depth * np.sin(2 * np.pi * rate * t + phase)  # -depth..depth
    gl = np.sqrt(0.5 * (1 - p))
    gr = np.sqrt(0.5 * (1 + p))
    return gl, gr


A = 55.0  # A1


def note(f0, dur, sr, partials=((1, 1.0), (2, 0.3), (3, 0.12)), detune=0.15, vib=0.0):
    n = int(dur * sr)
    t = np.arange(n) / sr
    out = np.zeros(n)
    for mult, amp in partials:
        f = f0 * mult
        ph = 2 * np.pi * f * t
        if vib:
            ph += (vib / f) * np.sin(2 * np.pi * 0.15 * t) * f
        out += amp * np.sin(ph + 2 * np.pi * np.random.rand())
        out += amp * 0.6 * np.sin(2 * np.pi * (f + detune) * t + 2 * np.pi * np.random.rand())
    return out / (np.abs(out).max() + 1e-9)


# ---------- SLEEP : dark drones + brown/pink noise, minimal motion ----------
def gen_sleep(dur=114, sr=22050, seed=41):
    rng = RNG(seed)
    n = int(dur * sr)
    L = np.zeros(n)
    R = np.zeros(n)
    t = np.arange(n) / sr

    # brown noise bed, breathing amplitude (~0.02 Hz), darkened
    for ch, phase in ((L, 0.0), (R, 1.1)):
        b = brown_noise(n, sr, rng)
        b = lowpass(b, sr, 420, 2.5)
        breathe = 0.55 + 0.45 * np.sin(2 * np.pi * 0.018 * t + phase)
        ch += 0.30 * b / (np.abs(b).max() + 1e-9) * breathe

    # low drones A1 + E2, slow beating
    d1 = np.sin(2 * np.pi * 55.0 * t) + 0.7 * np.sin(2 * np.pi * 55.15 * t)
    d2 = np.sin(2 * np.pi * 82.41 * t + 1.0) + 0.7 * np.sin(2 * np.pi * 82.3 * t)
    swell1 = 0.5 + 0.5 * np.sin(2 * np.pi * 0.011 * t)
    swell2 = 0.5 + 0.5 * np.sin(2 * np.pi * 0.014 * t + 2.0)
    L += 0.16 * d1 * swell1 + 0.10 * d2 * swell2
    R += 0.10 * d1 * swell1 + 0.16 * d2 * swell2

    # sparse very-soft low pentatonic tones (A2 C3 E3 G3), 18-24 s swells
    freqs = [110.0, 130.81, 164.81, 196.0]
    pos = 0
    while pos < n - sr * 10:
        f0 = float(rng.choice(freqs))
        d = float(rng.uniform(16, 24))
        sig = note(f0, d, sr, partials=((1, 1.0), (2, 0.15)), vib=0.3)
        sig = lowpass(sig, sr, 800) * env_ar(len(sig), sr, d * 0.45, d * 0.45)
        g = float(rng.uniform(0.05, 0.09))
        pl = float(rng.uniform(0.35, 0.65))
        place(L, sig * g * (1 - pl), pos)
        place(R, sig * g * pl, pos)
        pos += int(rng.uniform(10, 16) * sr)

    return loopify(np.vstack([L, R]), sr, 5.0), sr


# ---------- RELAX : ethereal pads, no beat, pink noise, slow spatial motion ----------
def gen_relax(dur=114, sr=22050, seed=42):
    rng = RNG(seed)
    n = int(dur * sr)
    L = np.zeros(n)
    R = np.zeros(n)

    # pink noise air, gentle stereo decorrelation
    for ch, s in ((L, 1), (R, 2)):
        p = pink_noise(n, sr, RNG(seed * 10 + s))
        p = lowpass(p, sr, 3200) * 0.10 / (np.abs(p).max() + 1e-9)
        ch += p * 3.0

    # overlapping warm pad swells, A major pentatonic (A3 B3 C#4 E4 F#4)
    scale = [220.0, 246.94, 277.18, 329.63, 369.99, 440.0]
    pos = 0
    k = 0
    while pos < n - sr * 8:
        f0 = float(rng.choice(scale))
        d = float(rng.uniform(12, 20))
        sig = note(f0, d, sr, partials=((1, 1.0), (2, 0.4), (4, 0.08)), detune=0.4, vib=0.5)
        sig = lowpass(sig, sr, 2400) * env_ar(len(sig), sr, d * 0.4, d * 0.5)
        gl, gr = pan_lfo(len(sig), sr, rng.uniform(0.02, 0.05), 0.6, rng.uniform(0, 6.28))
        g = float(rng.uniform(0.10, 0.16))
        place(L, sig * g * gl * 1.41, pos)
        place(R, sig * g * gr * 1.41, pos)
        pos += int(rng.uniform(4, 8) * sr)
        k += 1

    # sub anchor A2, barely there
    t = np.arange(n) / sr
    sub = np.sin(2 * np.pi * 110.0 * t) * (0.5 + 0.5 * np.sin(2 * np.pi * 0.02 * t))
    L += 0.06 * sub
    R += 0.06 * sub

    return loopify(np.vstack([L, R]), sr, 5.0), sr


# ---------- PUMP : kick + hats + bassline, driving, no lead melody ----------
def gen_pump(dur=76, sr=32000, seed=43, bpm=128):
    rng = RNG(seed)
    n = int(dur * sr)
    L = np.zeros(n)
    R = np.zeros(n)
    spb = 60.0 / bpm  # seconds per beat

    # kick every beat
    kd = 0.28
    kn = int(kd * sr)
    kt = np.arange(kn) / sr
    fsweep = 160 * np.exp(-kt / 0.045) + 44
    phase = 2 * np.pi * np.cumsum(fsweep) / sr
    kick = np.sin(phase) * np.exp(-kt / 0.11)
    kick += 0.4 * RNG(7).standard_normal(kn) * np.exp(-kt / 0.004)  # click
    kick /= np.abs(kick).max()

    beat_starts = []
    bpos = 0.0
    while bpos < dur - kd:
        s = int(bpos * sr)
        beat_starts.append(s)
        place(L, kick * 0.9, s)
        place(R, kick * 0.9, s)
        bpos += spb

    # hats: 8ths, offbeats louder; short noise bursts highpassed
    hd = 0.05
    hn = int(hd * sr)
    hat = RNG(8).standard_normal(hn) * np.exp(-np.arange(hn) / (0.012 * sr))
    hat = highpass(hat, sr, 6500, 3)
    hat /= np.abs(hat).max()
    hpos = 0.0
    i = 0
    while hpos < dur - hd:
        s = int(hpos * sr)
        g = 0.30 if i % 2 == 1 else 0.14
        pl = 0.42 if i % 4 == 1 else 0.58
        place(L, hat * g * (1 - pl) * 2, s)
        place(R, hat * g * pl * 2, s)
        hpos += spb / 2
        i += 1

    # bassline: A1-based pattern, 8th notes, sidechain-ducked after each kick
    pattern = [55.0, 55.0, 65.41, 55.0, 82.41, 55.0, 98.0, 82.41]  # A C E G-ish
    nd = spb / 2 * 0.92
    nn = int(nd * sr)
    tt = np.arange(nn) / sr
    bpos = 0.0
    i = 0
    while bpos < dur - nd:
        f0 = pattern[i % len(pattern)]
        sig = (np.sin(2 * np.pi * f0 * tt)
               + 0.5 * np.sin(2 * np.pi * 2 * f0 * tt)
               + 0.25 * np.sin(2 * np.pi * 3 * f0 * tt))
        sig *= env_ar(nn, sr, 0.005, 0.05)
        place(L, sig * 0.34, int(bpos * sr))
        place(R, sig * 0.34, int(bpos * sr))
        bpos += spb / 2
        i += 1

    # sidechain duck on the summed low end
    duck = np.ones(n)
    dn = int(0.18 * sr)
    denv = 1 - 0.55 * np.exp(-np.arange(dn) / (0.06 * sr))
    for s in beat_starts:
        e = min(s + dn, n)
        duck[s:e] = np.minimum(duck[s:e], denv[: e - s])
    L *= duck
    R *= duck

    # energy pad stabs on offbeats (dark, no melody) — filtered saw-ish
    sd = spb * 0.45
    sn = int(sd * sr)
    st = np.arange(sn) / sr
    stab = sum(np.sin(2 * np.pi * 110.0 * k * st) / k for k in range(1, 7))
    stab = np.asarray(stab) * env_ar(sn, sr, 0.01, sd * 0.6)
    stab = lowpass(stab, sr, 900)
    stab /= np.abs(stab).max()
    bpos = spb / 2
    j = 0
    while bpos < dur - sd:
        pl = 0.35 if j % 2 else 0.65
        place(L, stab * 0.16 * (1 - pl) * 2, int(bpos * sr))
        place(R, stab * 0.16 * pl * 2, int(bpos * sr))
        bpos += spb
        j += 1

    return loopify(np.vstack([L, R]), sr, spb * 4), sr


if __name__ == "__main__":
    import os
    out = "/app/created"
    os.makedirs(out, exist_ok=True)
    for name, fn in (("sleep", gen_sleep), ("relax", gen_relax), ("pump", gen_pump)):
        stereo, sr = fn()
        path = f"{out}/{name}_v1_sample.wav"
        write_wav(path, stereo, sr)
        mb = os.path.getsize(path) / 1e6
        print(f"{path}: {mb:.2f} MB, {stereo.shape[1]/sr:.1f}s @ {sr} Hz")
