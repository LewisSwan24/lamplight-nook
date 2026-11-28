"""Compose the bookshop (书店, plan-2.0.md J2) background, 320x180, on the cafe's floor plan (shops.py).

Zhou's shop, on the river street, full of old books bought one at a time. The counter is a wooden one stacked with
books waiting to be priced, a till at the end; the bookcase is a tall one, full; the reading table is long, piles of
books on it and one open; the corner is a globe on its stand beside a low shelf; above the table, a short shelf on
the wall. Modern Interiors' 5_Classroom_and_library has the bookcases and the globe; the counter, the table and the
piles of books are drawn here by hand.
Reads the raw packs from assets/vendor/ (not in the repo) and writes assets/sprites/bookshop.png.
Run: py -3.12 scripts/art/bookshop.py
"""
import scene
import shops
from shops import PAPER, PAPER_S, SHADOW, WOOD, WOOD_D, WOOD_HI, WOOD_L, Pen

FLOOR = (12, 26)
WALL = (1, 28)

LIBRARY = '5_Classroom_and_library'
SPINES = [(150, 64, 56, 255), (64, 96, 150, 255), (88, 128, 76, 255), (196, 160, 80, 255), (110, 80, 120, 255)]


def lib(x0, y0, x1, y1):
    return shops.cut(LIBRARY, (x0, y0, x1, y1))


def pile(p, x, y, n, start=0):
    """A pile of n books lying flat, bottom up from y, each a little offset and its own colour."""
    for i in range(n):
        w = 9 + (i + start) % 3
        dx = (i * 2 + start) % 3
        top = y - 3 * (i + 1)
        spine = SPINES[(i + start) % len(SPINES)]
        p.box(x + dx, top, x + dx + w, top + 2, spine)
        # The pages showing at one end.
        p.line((x + dx + w - 2, top + 1, x + dx + w - 1, top + 1), PAPER)


def counter():
    """The counter: a wooden base, piles of books waiting to be priced, the till at the end."""
    p = Pen(60, 30)
    p.box(0, 14, 59, 28, WOOD)
    p.line((1, 15, 58, 15), WOOD_HI)
    for x in range(8, 58, 14):
        p.line((x, 17, x, 26), WOOD_L)
    p.fill(1, 27, 58, 27, WOOD_D)
    pile(p, 3, 14, 4)
    pile(p, 18, 14, 3, start=2)
    pile(p, 32, 14, 2, start=1)
    p.box(48, 6, 57, 13, (120, 124, 140, 255))
    p.fill(50, 8, 55, 9, (196, 226, 160, 255))
    p.fill(0, 29, 59, 29, SHADOW)
    return p.img


def reading_table():
    """The reading table: long and wooden, two piles of books and one lying open."""
    p = Pen(58, 22)
    p.box(0, 10, 57, 13, WOOD_L, line=WOOD_D)
    # An apron board under the top, so it reads as a solid table.
    p.fill(1, 14, 56, 15, WOOD_D)
    p.box(2, 14, 4, 20, WOOD, line=WOOD_D)
    p.box(53, 14, 55, 20, WOOD, line=WOOD_D)
    pile(p, 4, 10, 3, start=3)
    pile(p, 40, 10, 2, start=1)
    # The open book: two pages and a line of print on each.
    p.box(20, 6, 27, 9, PAPER)
    p.box(28, 6, 35, 9, PAPER)
    p.line((22, 7, 26, 7), PAPER_S)
    p.line((30, 7, 34, 7), PAPER_S)
    p.fill(0, 21, 57, 21, SHADOW)
    return p.img


BOOKCASE = lib(0, 352, 48, 416)
LOW = lib(128, 224, 160, 256)
GLOBE = lib(192, 0, 224, 32)
CORNER = shops.stack((LOW, 0, 0), (GLOBE, LOW.width + 2, LOW.height - GLOBE.height))
TABLE = reading_table()

FURNITURE = [
    *shops.wall_fixtures(),
    (None, LOW, (136, 57 - LOW.height)),
    ('plant_l', scene.obj(192, scene.at(26), 208, scene.at(29)), (4, 40)),
    ('table', TABLE, (122, 102 - TABLE.height)),
    ('shelf', BOOKCASE, (6, 156 - BOOKCASE.height)),
    ('counter', counter(), (216, 96 - 30)),
    ('workbench', CORNER, (124, 158 - CORNER.height)),
    ('lamp', scene.obj(0, scene.at(290), 16, scene.at(293)), (272, 140)),
    ('plant_r', scene.obj(167, scene.at(26), 185, scene.at(29)), (300, 112)),
]


def shell():
    return shops.shell(FLOOR, WALL)


def build():
    return shops.build('bookshop', shell(), FURNITURE)


if __name__ == '__main__':
    build()
    print('built bookshop.png')
