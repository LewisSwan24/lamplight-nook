"""Compose the studio (画室, road-to-1.4.md D2) background, 320x180, on the cafe's floor plan (shops.py).

The counter is a long table of palettes, brushes and paint; right of the blackboard stands an easel; the bookcase is a
rack of paint tins with framed canvases leaning on it; the corner is a tall stool; the reading table carries a still life
of pots; on the wall, pictures hang drying on a line. Modern Interiors' 7_Art has the tables, the easel, the paint, the
pots, the frames and the palettes, and 14_Basement the tall stool; the rack and the drying line are drawn here by hand.
Reads the raw pack from assets/vendor/ (not in the repo) and writes assets/sprites/studio.png.
Run: python3 scripts/art/studio.py
"""
import shops
from growth import COLORS
from shops import INK, PAPER, PAPER_S, SHADOW, WOOD, WOOD_D, WOOD_HI, WOOD_L, Pen

FLOOR = (0, 30)
WALL = (1, 6)

ART = '7_Art'
LIVING = '2_LivingRoom'


def art(x, y, w=16, h=32):
    return shops.cut(ART, (x, y, x + w, y + h))


def drying_line():
    """A string across the wall with sketches pegged on it to dry."""
    p = Pen(40, 14)
    p.line((0, 1, 10, 3, 20, 4, 30, 3, 39, 1), (120, 104, 96, 255))
    sheets = [(2, (232, 120, 96, 255), (240, 196, 92, 255)), (11, (112, 160, 208, 255), (96, 168, 112, 255)),
              (21, (236, 196, 92, 255), (200, 72, 60, 255)), (30, (150, 70, 96, 255), (112, 172, 204, 255))]
    for x, a, b in sheets:
        sag = 3 if 8 <= x <= 25 else 2
        p.box(x, sag + 1, x + 7, sag + 9, PAPER, PAPER_S)
        p.fill(x + 1, sag + 4, x + 4, sag + 6, a)
        p.fill(x + 3, sag + 6, x + 6, sag + 8, b)
        p.dot(x + 2, sag, WOOD)
        p.dot(x + 5, sag, WOOD)
    return p.img


def paint_rack():
    """The bookcase's place: a wooden rack, tins of paint on its shelves, canvases leaning against its foot."""
    p = Pen(48, 48)
    p.box(0, 0, 47, 46, WOOD_D)
    p.fill(1, 1, 46, 2, WOOD_HI)
    p.line((0, 3, 47, 3), INK)
    for x0 in (0, 44):
        p.box(x0, 3, x0 + 3, 46, WOOD)
    for top in (20, 43):
        p.box(0, top, 47, top + 3, WOOD)
        p.line((1, top + 1, 46, top + 1), WOOD_L)
    tins = [art(96, 0, 16, 32), art(112, 0, 16, 32), art(128, 0, 16, 32)]
    for i, tin in enumerate(tins):
        p.img.alpha_composite(tin, (4 + i * 14, 21 - tin.height))
    low = [art(96, 32, 16, 32), art(112, 32, 16, 32), art(128, 32, 16, 32)]
    for i, tin in enumerate(low):
        p.img.alpha_composite(tin, (4 + i * 14, 44 - tin.height))
    p.fill(0, 47, 47, 47, SHADOW)
    rack = p.img
    frames = [shops.cut(ART, (240, 64, 256, 96)), shops.cut(ART, (208, 64, 224, 96)), shops.cut(ART, (192, 64, 208, 96))]
    parts = [(rack, 0, 0)]
    for i, frame in enumerate(frames):
        parts.append((frame, 2 + i * 15, 48 - frame.height + 2))
    return shops.stack(*parts)


TABLE = shops.cut(ART, (32, 80, 64, 96))
PALE_TABLE = shops.cut(ART, (64, 80, 96, 96))
PALETTE = shops.cut(ART, (128, 96, 144, 112))
BRUSH = shops.cut(ART, (32, 96, 45, 112))
SKETCH = shops.cut(ART, (45, 96, 56, 112))
TUBES = shops.cut(ART, (56, 96, 64, 112))
LONG = shops.widen(TABLE, 56)
COUNTER = shops.stack((LONG, 0, 0), (PALETTE, 2, -2), (BRUSH, 14, -1), (SKETCH, 25, -1), (TUBES, 35, -2),
                      (shops.cut(ART, (112, 32, 128, 64)), 42, -9))
STILL_LIFE = shops.stack((shops.widen(PALE_TABLE, 60), 0, 0), (art(48, 32), 14, -9), (art(80, 32), 26, -10),
                         (shops.cut(ART, (0, 64, 16, 96)), 38, -11))
STOOL = shops.cut('14_Basement', (224, 248, 240, 274))
EASEL = art(240, 32)

FURNITURE = [
    *shops.wall_fixtures(),
    (None, drying_line(), (138, 18)),
    ('plant_l', shops.cut(LIVING, (166, 8, 186, 41)), (2, 40)),
    ('easel', EASEL, (126, 56 - EASEL.height)),
    ('table', STILL_LIFE, (122, 102 - STILL_LIFE.height)),
    ('shelf', paint_rack(), (8, 108)),
    ('counter', COUNTER, (218, 94 - COUNTER.height)),
    ('workbench', STOOL, (130, 158 - STOOL.height)),
    ('lamp', shops.cut(LIVING, (176, 182, 192, 210)), (274, 138)),
    ('plant_r', shops.cut(LIVING, (191, 7, 209, 45)), (300, 108)),
]


def shell():
    return shops.shell(FLOOR, WALL)


def build():
    return shops.build('studio', shell(), FURNITURE)


if __name__ == '__main__':
    build()
    print('built studio.png')
