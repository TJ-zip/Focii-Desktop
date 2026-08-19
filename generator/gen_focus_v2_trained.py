"""Focus v2 -- trained on measured profile of the user's Endel Focus reference
(minutes 1-8 of the 20-min recording; see endel_focus_profile.json).

Measured targets (AAC bitstream analysis -- no Endel audio is reproduced):
  pulse             60.1 BPM, strongly periodic
  attacks           zero sharp transients -> all envelopes raised-cosine/gaussian
  dynamics          extremely flat (95/5 bit-alloc ratio 1.21) -> gentle leveling
  slow energy cycle ~25.9 s swell period
Kept from the project plan: directional/spatial bass, pentatonic-only pitch
material, loop-safe ends (tail crossfades into head).

Usage: python gen_focus_v2_trained.py [duration_seconds] [out.wav]
Canonical seed 207. Verified render: pulse autocorrelation = 60.1 BPM.
"""
import numpy as np, wave, sys, os

SEED = 207          # focus v2 canonical seed
SR = 22050
DUR = float(sys.argv[1]) if len(sys.argv) > 1 else 108.0
OUT = sys.argv[2] if len(sys.argv) > 2 else "focus_v2_trained_sample.wav"
BPM = 60.1          # measured
CYCLE = 25.9        # measured slow swell period, seconds
rng = np.random.default_rng(SEED)

n = int(DUR * SR)
t = np.arange(n) / SR
beat = 60.0 / BPM

def soft_env(length, att, rel):
    e = np.ones(length)
    a = int(att * SR); r = int(rel * SR)
    e[:a] = 0.5 - 0.5 * np.cos(np.linspace(0, np.pi, a))
    e[-r:] = 0.5 + 0.5 * np.cos(np.linspace(0, np.pi, r))
    return e

# ---------- pentatonic palette (A minor pentatonic) ----------
base = 110.0
penta = [0, 3, 5, 7, 10]
freqs = [base * 2 ** (o + s / 12) for o in range(3) for s in penta]

L = np.zeros(n); R = np.zeros(n)

# ---------- 1. sub drone with directional slow motion ----------
f0 = base / 2  # 55 Hz
sub = np.sin(2 * np.pi * f0 * t + 3 * np.sin(2 * np.pi * t / (CYCLE * 1.7)))
sub2 = 0.5 * np.sin(2 * np.pi * f0 * 1.5 * t + 1.3)
# direction: pan the 82.5 Hz harmonic slowly, keep 55 Hz centered
panL = 0.5 + 0.35 * np.sin(2 * np.pi * t / (CYCLE * 1.3))
L += 0.30 * sub + 0.22 * sub2 * panL
R += 0.30 * sub + 0.22 * sub2 * (1 - panL)

# ---------- 2. 60.1 BPM soft pulse (gaussian bump, no attack) ----------
pulse = np.zeros(n)
sigma = 0.055
for k in range(int(DUR / beat) + 1):
    c = k * beat
    i0, i1 = max(0, int((c - 4 * sigma) * SR)), min(n, int((c + 4 * sigma) * SR))
    if i0 >= i1:
        continue
    tt = t[i0:i1] - c
    pulse[i0:i1] += np.exp(-0.5 * (tt / sigma) ** 2)
thump = pulse * np.sin(2 * np.pi * 70 * t)            # felt more than heard
tick = pulse * np.sin(2 * np.pi * base * 2 * t) * 0.4  # faint 220 Hz body
# alternate pulse direction slightly beat by beat (spatial, subtle)
beatphase = np.floor(t / beat) % 2
pL = 0.56 + 0.10 * (beatphase * 2 - 1)
L += 0.30 * (thump + tick) * pL
R += 0.30 * (thump + tick) * (1.12 - pL)

# ---------- 3. blurred pentatonic pads, slow swells on 25.9 s cycle ----------
nev = int(DUR / CYCLE * 6) + 8
for e in range(nev):
    f = rng.choice(freqs[5:])            # mid/high register only
    start = rng.uniform(0, DUR - 8)
    length = rng.uniform(9, 16)
    i0 = int(start * SR); i1 = min(n, i0 + int(length * SR))
    m = i1 - i0
    env = soft_env(m, length * 0.45, length * 0.45)  # symmetric swell, no attack
    det = rng.uniform(0.9985, 1.0015)
    seg = np.sin(2 * np.pi * f * det * np.arange(m) / SR + rng.uniform(0, 6.28))
    seg += 0.4 * np.sin(2 * np.pi * f * 2 * det * np.arange(m) / SR)
    pan = rng.uniform(0.25, 0.75)
    g = 0.038
    L[i0:i1] += g * seg * env * pan * 2
    R[i0:i1] += g * seg * env * (1 - pan) * 2

# ---------- 4. filtered noise bed (air), very low ----------
noise = rng.standard_normal(n)
a = np.exp(-2 * np.pi * 1200 / SR)  # cheap one-pole lowpass ~1.2 kHz
nb = np.concatenate([[0], noise[:-1]]) * a + noise * (1 - a)
nb2 = np.concatenate([[0], nb[:-1]])  # decorrelate channels by 1 sample
L += 0.035 * nb
R += 0.035 * nb2

# ---------- 5. slow global swell, then flatten dynamics (measured 1.21) ----------
swell = 1 + 0.10 * np.sin(2 * np.pi * t / CYCLE - 1.2)
L *= swell; R *= swell

def flatten(x):
    w = int(2.0 * SR)
    rms = np.sqrt(np.convolve(x ** 2, np.ones(w) / w, mode="same")) + 1e-9
    target = np.median(rms)
    return x * (target / rms) ** 0.35  # gentle leveling toward flat dynamics

L = flatten(L); R = flatten(R)

# ---------- 6. loop-safe: crossfade last 6 s into first 6 s ----------
xf = int(6 * SR)
w = 0.5 - 0.5 * np.cos(np.linspace(0, np.pi, xf))
for ch in (L, R):
    head = ch[:xf].copy()
    ch[-xf:] = ch[-xf:] * (1 - w) + head * w

# ---------- master ----------
mix = np.stack([L, R], axis=1)
mix *= 0.85 / np.max(np.abs(mix))
pcm = (mix * 32767).astype(np.int16)
with wave.open(OUT, "wb") as wf:
    wf.setnchannels(2); wf.setsampwidth(2); wf.setframerate(SR)
    wf.writeframes(pcm.tobytes())
print(f"wrote {OUT}: {os.path.getsize(OUT) / 1e6:.1f} MB, {DUR:.0f}s, seed {SEED}")

# ---------- verify ----------
with wave.open(OUT, "rb") as wf:
    assert wf.getnframes() == n and wf.getframerate() == SR
d = pcm.astype(float) / 32767
print(f"peak {np.max(np.abs(d)):.3f} rms {np.sqrt((d ** 2).mean()):.4f}")
env = np.sqrt(np.convolve(d[:, 0] ** 2, np.ones(1024) / 1024, mode="same"))[::512]
fr = SR / 512
x = env - env.mean()
ac = np.correlate(x, x, "full")[len(x) - 1:]
ac /= ac[0]
lags = np.arange(len(ac)) / fr
m = (lags >= 60 / 160) & (lags <= 60 / 40)
print(f"rendered pulse: {60 / lags[m][np.argmax(ac[m])]:.1f} BPM (target 60.1)")
