"""Draw the app's lamp icon: assets/ui/icon.png (256 px, window and installer) and the tray icons
assets/ui/tray.png and assets/ui/tray-glow.png (32 px; the glowing one alternates with the plain one when
the shop needs the user). A 16x16 pixel lantern, scaled up with hard edges. Deterministic.
Run: python3 scripts/art/icon.py
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'assets/ui'

LANTERN = [
    '................',
    '.......hh.......',
    '......h..h......',
    '.....DDDDDD.....',
    '....DDDDDDDD....',
    '....DyyyyyyD....',
    '....DyywwyyD....',
    '....DywwwwyD....',
    '....DywwwwyD....',
    '....DyywwyyD....',
    '....DoyyyyoD....',
    '....DooyyooD....',
    '....DDDDDDDD....',
    '.....DDDDDD.....',
    '......DDDD......',
    '................',
]
COLORS = {
    'h': (107, 74, 53, 255),    # hook
    'D': (74, 46, 31, 255),     # frame
    'y': (255, 221, 128, 255),  # glass, lit
    'w': (255, 250, 228, 255),  # flame, white-hot
    'o': (242, 168, 75, 255),   # glass, warm edge
}


def lantern(scale: int) -> Image.Image:
    img = Image.new('RGBA', (16 * scale, 16 * scale), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    for y, row in enumerate(LANTERN):
        for x, c in enumerate(row):
            if c in COLORS:
                draw.rectangle([x * scale, y * scale, (x + 1) * scale - 1, (y + 1) * scale - 1], fill=COLORS[c])
    return img


def with_glow(img: Image.Image, strength: float) -> Image.Image:
    """A soft warm halo behind the lantern (the lamp is lit)."""
    size = img.width
    halo = Image.new('RGBA', img.size, (0, 0, 0, 0))
    r = size * 0.36
    c = size / 2
    ImageDraw.Draw(halo).ellipse([c - r, c - r * 0.9, c + r, c + r * 1.1], fill=(255, 200, 90, int(255 * strength)))
    halo = halo.filter(ImageFilter.GaussianBlur(size / 10))
    return Image.alpha_composite(halo, img)


def main():
    with_glow(lantern(16), 0.55).save(OUT / 'icon.png')
    lantern(2).save(OUT / 'tray.png')
    with_glow(lantern(2), 0.9).save(OUT / 'tray-glow.png')
    print('wrote icon.png, tray.png, tray-glow.png')


if __name__ == '__main__':
    main()
