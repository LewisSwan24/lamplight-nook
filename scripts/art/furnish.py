"""Furnishing choices for each scene (plan.md S4): the wall colour, the curtains and the rug.

Each choice is a transparent 320x180 overlay holding only the recoloured pixels of that part, laid over
the scene's background by the game; the default choice is the background itself, so it has no overlay.
Parts are found by colour inside a box: the wall in each scene, the curtains (positions taken from the
study, where the wall behind them is a different colour), and the rug under the big table.
Recolouring keeps each pixel's brightness and shading and moves its hue (shared/furnish.ts lists the ids).
Writes assets/sprites/furnish-<scene>-<part>-<choice>.png.
Run: python3 scripts/art/furnish.py
"""
import colorsys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SPRITES = ROOT / 'assets/sprites'
W, H = 320, 180

CURTAIN = {(208, 190, 156), (185, 158, 134), (156, 120, 107), (145, 102, 98), (224, 208, 178)}
CURTAIN_BOXES = [(16, 11, 43, 38), (52, 11, 79, 38)]
WALL_BOX = (0, 20, 320, 47)
WALL = {
    'cafe': {(208, 190, 156): 'main', (224, 208, 178): 'main'},
    'study': {(238, 225, 183): 'main', (104, 145, 131): 'low', (88, 130, 120): 'low', (193, 198, 165): 'low'},
}
RUG_BOX = (112, 72, 180, 120)
RUG = {(167, 78, 71): 'main', (168, 95, 70): 'main', (179, 94, 63): 'main',
       (195, 170, 87): 'edge', (187, 152, 78): 'edge', (165, 135, 69): 'edge'}

# choice -> tone -> (hue in degrees, saturation multiplier, brightness multiplier)
CHOICES = {
    'wall': {
        'sage': {'main': (100, 0.7, 1.0), 'low': (95, 0.9, 1.0)},
        'rose': {'main': (350, 0.9, 1.02), 'low': (345, 0.8, 1.05)},
        'sky': {'main': (205, 0.85, 1.02), 'low': (210, 0.9, 1.0)},
    },
    'curtain': {
        'blue': {'all': (212, 1.5, 0.95)},
        'rose': {'all': (350, 1.4, 1.0)},
        'green': {'all': (120, 1.2, 0.95)},
    },
    'rug': {
        'blue': {'main': (215, 0.9, 1.0), 'edge': (40, 0.9, 1.05)},
        'green': {'main': (150, 0.75, 1.0), 'edge': (45, 0.8, 1.05)},
        'plum': {'main': (305, 0.6, 1.0), 'edge': (30, 0.6, 1.05)},
    },
}


def shift(rgb, hue, sat, val):
    h, s, v = colorsys.rgb_to_hsv(*(c / 255 for c in rgb))
    r, g, b = colorsys.hsv_to_rgb(hue / 360, min(1, s * sat), min(1, v * val))
    return round(r * 255), round(g * 255), round(b * 255), 255


def in_box(x, y, box):
    return box[0] <= x < box[2] and box[1] <= y < box[3]


def curtain_mask(study):
    return {(x, y) for box in CURTAIN_BOXES for x in range(box[0], box[2]) for y in range(box[1], box[3])
            if study.getpixel((x, y))[:3] in CURTAIN}


def part_pixels(img, scene, part, curtains):
    """(x, y) -> tone for every pixel of the part in this scene."""
    out = {}
    for y in range(H):
        for x in range(W):
            c = img.getpixel((x, y))[:3]
            if part == 'curtain' and (x, y) in curtains:
                out[(x, y)] = 'all'
            elif part == 'wall' and in_box(x, y, WALL_BOX) and c in WALL[scene] and (x, y) not in curtains:
                out[(x, y)] = WALL[scene][c]
            elif part == 'rug' and in_box(x, y, RUG_BOX) and c in RUG:
                out[(x, y)] = RUG[c]
    return out


if __name__ == '__main__':
    study = Image.open(SPRITES / 'study.png').convert('RGBA')
    curtains = curtain_mask(study)
    n = 0
    for scene in ('cafe', 'study'):
        img = Image.open(SPRITES / f'{scene}.png').convert('RGBA')
        for part, choices in CHOICES.items():
            pixels = part_pixels(img, scene, part, curtains)
            for choice, tones in choices.items():
                over = Image.new('RGBA', (W, H), (0, 0, 0, 0))
                for (x, y), tone in pixels.items():
                    over.putpixel((x, y), shift(img.getpixel((x, y))[:3], *tones.get(tone, next(iter(tones.values())))))
                over.save(SPRITES / f'furnish-{scene}-{part}-{choice}.png', optimize=True)
                n += 1
    print('wrote', n, 'overlays')
