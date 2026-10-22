"""Build the shop's sound effects into assets/audio/*.ogg.

UI sounds are picked from Cyberleaf "Modern UI SFX" (assets/vendor/sfx, not in the repo; its license
allows use in the app but not remixing, so each file is only re-encoded and levelled). The shop
sounds the pack doesn't have (door bell, mallet, pencil) are synthesized here. Deterministic (fixed seed).
Needs ffmpeg with libvorbis. Run: python3 scripts/audio/sfx.py
"""
import subprocess
import tempfile
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
PACK = ROOT / 'assets/vendor/sfx/Cyberleaf-ModernUISFX'
OUT = ROOT / 'assets/audio'
RATE = 44100

# Name in the app -> file in the pack. Chosen for warm, soft tones (low spectral centroid, gentle attack).
PICKED = {
    'click': 'Buttons/GenericButton6.wav',
    'open': 'SlidesAndTransitions/SwooshSlide1b.wav',
    'close': 'SlidesAndTransitions/Minimize4.wav',
    'ask': 'AlertsAndNotifications/GenericNotification10b.wav',
    'success': 'AlertsAndNotifications/Success1.wav',
    'fail': 'AlertsAndNotifications/Error5.wav',
    'serious': 'AlertsAndNotifications/GenericNotification11.wav',
}
# Peak level per sound (UI clicks quieter than news).
PEAK = {'click': 0.35, 'open': 0.4, 'close': 0.35, 'ask': 0.5, 'success': 0.5, 'fail': 0.45, 'serious': 0.55,
        'door': 0.45, 'mallet': 0.4, 'pencil': 0.25}


def load(path: Path) -> np.ndarray:
    raw = subprocess.run(['ffmpeg', '-v', 'quiet', '-i', str(path), '-ac', '1', '-ar', str(RATE), '-f', 'f32le', '-'],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.float32).astype(np.float64)


def save(name: str, x: np.ndarray):
    x = x / max(np.abs(x).max(), 1e-9) * PEAK[name]
    with tempfile.NamedTemporaryFile(suffix='.f32') as tmp:
        tmp.write(x.astype(np.float32).tobytes())
        tmp.flush()
        subprocess.run(['ffmpeg', '-v', 'quiet', '-y', '-f', 'f32le', '-ar', str(RATE), '-ac', '1', '-i', tmp.name,
                        '-c:a', 'libvorbis', '-q:a', '4', str(OUT / f'{name}.ogg')], check=True)


def t(seconds: float) -> np.ndarray:
    return np.arange(int(seconds * RATE)) / RATE


def door_bell() -> np.ndarray:
    """A small shop bell on a spring: two quick strikes, then a fading shimmer."""
    out = np.zeros(int(1.6 * RATE))
    partials = [(1.0, 1.0, 1.4), (2.76, 0.5, 0.9), (5.40, 0.25, 0.5), (8.93, 0.12, 0.3)]
    for start, f0, gain in [(0.0, 1480, 1.0), (0.11, 1490, 0.7), (0.26, 1475, 0.35)]:
        tt = t(1.6 - start)
        strike = sum(a * np.sin(2 * np.pi * f0 * r * tt) * np.exp(-tt / d) for r, a, d in partials)
        strike *= np.minimum(tt / 0.002, 1)  # no click at the attack
        i = int(start * RATE)
        out[i:] += gain * strike[: len(out) - i]
    return out


def mallet(rng) -> np.ndarray:
    """A wooden mallet tapping a board: a short pitched knock plus a puff of filtered noise."""
    tt = t(0.18)
    knock = np.sin(2 * np.pi * (380 * tt - 300 * tt * tt)) * np.exp(-tt / 0.035)
    noise = np.convolve(rng.standard_normal(len(tt)), np.hanning(9), 'same') * np.exp(-tt / 0.012)
    return knock + 0.5 * noise


def pencil(rng) -> np.ndarray:
    """A pencil scribbling: bright noise shaped into a few uneven strokes."""
    total = 1.1
    tt = t(total)
    grain = rng.standard_normal(len(tt))
    hiss = grain - np.convolve(grain, np.ones(6) / 6, 'same')  # keep the scratchy highs
    env = np.zeros(len(tt))
    at = 0.0
    while at < total - 0.15:
        dur = rng.uniform(0.08, 0.18)
        a, b = int(at * RATE), int(min(at + dur, total) * RATE)
        env[a:b] = np.sin(np.linspace(0, np.pi, b - a)) * rng.uniform(0.5, 1.0)
        at += dur + rng.uniform(0.02, 0.07)
    return hiss * env


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for name, rel in PICKED.items():
        save(name, load(PACK / rel))
    rng = np.random.default_rng(11)
    save('door', door_bell())
    save('mallet', mallet(rng))
    save('pencil', pencil(rng))
    print('wrote', ', '.join(sorted(p.name for p in OUT.glob('*.ogg'))))


if __name__ == '__main__':
    main()
