"""Generate the watercolor paper grain: assets/ui/paper.png, a 256x256 tile that repeats seamlessly.

The tile is mostly white with soft blotches, fine grain and a few fibres; the UI multiplies it over
the paper colour, so the same tile works for every card and wash. Deterministic (fixed seed).
Run: python3 scripts/art/paper.py
"""
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'assets/ui/paper.png'
SIZE = 256


def periodic_noise(rng, scale):
    """Noise that wraps at the tile edges: random phases filtered in frequency space, so it tiles."""
    fx = np.fft.fftfreq(SIZE)[:, None]
    fy = np.fft.fftfreq(SIZE)[None, :]
    f = np.sqrt(fx * fx + fy * fy)
    spectrum = np.exp(-((f * scale) ** 2)) * np.exp(2j * np.pi * rng.random((SIZE, SIZE)))
    n = np.real(np.fft.ifft2(spectrum))
    return (n - n.min()) / (n.max() - n.min())


def main():
    rng = np.random.default_rng(7)
    blotch = periodic_noise(rng, 18)      # big soft unevenness of the wash
    tooth = periodic_noise(rng, 160)      # the paper's tooth
    grain = rng.random((SIZE, SIZE))      # fine speckle
    shade = 1 - 0.05 * blotch - 0.035 * tooth - 0.02 * grain
    # A few short fibres, wrapped at the edges.
    for _ in range(40):
        x, y = rng.integers(0, SIZE, 2)
        angle = rng.random() * np.pi
        for t in range(int(rng.integers(6, 18))):
            px = int(x + t * np.cos(angle)) % SIZE
            py = int(y + t * np.sin(angle)) % SIZE
            shade[py, px] -= 0.035
    img = (np.clip(shade, 0, 1) * 255).astype(np.uint8)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(img, 'L').convert('RGB').save(OUT, optimize=True)
    print('wrote', OUT.relative_to(ROOT), OUT.stat().st_size // 1024, 'KB')


if __name__ == '__main__':
    main()
