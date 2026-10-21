"""Compose the cafe background (320x180) from LimeZu Modern Interiors tiles.

Reads the raw pack from assets/vendor/ (not in the repo) and writes assets/sprites/cafe.png.
Run: python3 scripts/art/scene.py
"""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
PACK = ROOT / 'assets/vendor/1_Interiors/16x16'
OUT = ROOT / 'assets/sprites'
T = 16
W, H = 320, 180

interiors = Image.open(PACK / 'Interiors_16x16.png').convert('RGBA')
floors = Image.open(PACK / 'Room_Builder_subfiles/Room_Builder_Floors_16x16.png').convert('RGBA')
walls = Image.open(PACK / 'Room_Builder_subfiles/Room_Builder_Walls_16x16.png').convert('RGBA')


def tiles(sheet, col, row, w=1, h=1):
    return sheet.crop((col * T, row * T, (col + w) * T, (row + h) * T))


def obj(x0, y0, x1, y1):
    """An object from the interiors sheet: a rough pixel rect, trimmed to its opaque pixels."""
    part = interiors.crop((x0, y0, x1, y1))
    return part.crop(part.getbbox())


def at(row, dy=0):
    """Pixel y of a tile row in the interiors sheet."""
    return row * T + dy


# Furniture: rough pixel rect on the interiors sheet -> where to place it (canvas px, top-left).
FURNITURE = [
    # back wall
    ('window', (0, at(226), 32, at(228)), (16, 12)),
    ('window2', (0, at(226), 32, at(228)), (52, 12)),
    ('board', (0, at(338), 32, at(340)), (92, 14)),
    ('door', (0, at(215), 16, at(217)), (288, 16)),
    # floor
    ('plant_l', (192, at(26), 208, at(29)), (4, 40)),
    ('rug', (112, at(15), 176, at(18)), (116, 76)),
    ('table', (8, at(316, 24), 72, at(316, 62)), (124, 72)),
    ('bench', (8, at(316, 62), 72, at(316, 79)), (124, 112)),
    ('counter', (112, at(321), 192, at(323)), (216, 60)),
    ('coffee', (204, at(280, 102), 226, at(280, 128)), (238, 46)),
    ('shelf', (64, at(296), 112, at(299)), (8, 112)),
    ('workbench', (144, at(272), 176, at(274)), (128, 144)),
    ('lamp', (0, at(290), 16, at(293)), (272, 140)),
    ('plant_r', (167, at(26), 185, at(29)), (300, 112)),
]


def build():
    img = Image.new('RGBA', (W, H), (59, 42, 30, 255))
    floor = tiles(floors, 4, 12, 3, 2)
    for y in range(48, H, floor.height):
        for x in range(0, W, floor.width):
            img.alpha_composite(floor, (x, y))
    wall = tiles(walls, 1, 22, 1, 2)
    for x in range(0, W, T):
        img.alpha_composite(wall, (x, 16))
    for _name, rect, pos in FURNITURE:
        img.alpha_composite(obj(*rect), pos)
    OUT.mkdir(parents=True, exist_ok=True)
    img.save(OUT / 'cafe.png')
    return img


if __name__ == '__main__':
    build()
    print('built cafe.png')
