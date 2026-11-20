"""Compose the print shop (印刷铺, road-to-1.4.md D2) background, 320x180, on the cafe's floor plan (shops.py).

The counter is a composing frame with a type case on it and a tall type rack (铅字架) at its end; right of the
blackboard stands a hand press (印机); the bookcase is a paper rack (纸架); the corner is a binding table (装订桌) with a
book press on it; the reading table is a table of proofs. Modern Interiors has the tables, the plants and the lamp; the
press, the type case and rack, the paper rack and the book press are drawn here by hand.
Reads the raw pack from assets/vendor/ (not in the repo) and writes assets/sprites/print.png.
Run: python3 scripts/art/print.py
"""
import scene
import shops
from growth import COLORS
from shops import (BRASS, BRASS_D, INK, IRON, IRON_D, IRON_L, KRAFT, KRAFT_D, PAPER, PAPER_S, SHADOW, TYPE, TYPE_L,
                   WOOD, WOOD_D, WOOD_HI, WOOD_L, Pen)

FLOOR = (12, 26)
WALL = (1, 16)
RED, CREAM = COLORS['r'], COLORS['y']


def press():
    """A treadle platen press seen from the front: the ink disc on top, the platen with a sheet on it, the feed board
    with its stack of paper on the left, the flywheel on the right, the treadle below."""
    p = Pen(36, 34)
    p.box(5, 30, 24, 32, IRON_D)  # the base and the treadle
    p.line((1, 32, 6, 30), IRON_D)
    p.box(7, 8, 21, 30, IRON_D)  # the frame
    p.line((8, 9, 8, 29), IRON)
    p.line((20, 9, 20, 29), IRON)
    p.box(9, 12, 19, 22, IRON_L)  # the platen, a sheet on it
    p.box(10, 13, 18, 21, PAPER)
    for y in (15, 17, 19):
        p.line((11, y, 17 - (y % 3), y), TYPE)
    p.line((10, 24, 18, 24), IRON)  # the bed below the platen
    p.line((10, 26, 18, 26), IRON)
    p.box(13, 5, 15, 8, IRON)  # the stem and the round ink disc
    p.draw.ellipse((6, 0, 22, 6), fill=IRON_L, outline=INK)
    p.draw.ellipse((10, 2, 18, 4), fill=TYPE, outline=None)
    p.draw.polygon(((0, 21), (7, 15), (7, 19), (1, 24)), fill=WOOD, outline=INK)  # the feed board
    p.box(1, 17, 6, 20, PAPER)
    p.line((2, 19, 5, 19), PAPER_S)
    p.draw.ellipse((17, 8, 35, 26), fill=None, outline=INK, width=1)  # the flywheel
    p.draw.ellipse((18, 9, 34, 25), fill=None, outline=IRON_D, width=2)
    p.draw.ellipse((20, 11, 32, 23), fill=None, outline=INK, width=1)
    for a, b in (((26, 12), (26, 22)), ((21, 17), (31, 17)), ((22, 13), (30, 21)), ((22, 21), (30, 13))):
        p.line((*a, *b), IRON)
    p.box(24, 15, 28, 19, IRON_L)
    p.dot(26, 17, INK)
    p.fill(4, 33, 26, 33, SHADOW)
    return p.img


def composing_frame():
    """The counter: a frame with a type case open on top, a galley of set type, and drawers of cases below."""
    p = Pen(46, 20)
    p.box(0, 0, 45, 18, WOOD)
    p.fill(1, 1, 44, 7, WOOD_L)
    p.box(2, 2, 30, 6, TYPE)  # the case: little boxes of sorts
    for x in range(6, 30, 4):
        p.line((x, 2, x, 6), WOOD_D)
    p.line((2, 4, 30, 4), WOOD_D)
    for x in range(3, 30, 2):
        p.dot(x, 3 if x % 4 == 1 else 5, TYPE_L)
    p.box(33, 2, 43, 6, IRON_L)  # the galley, with three lines set
    for y in (3, 5):
        p.line((34, y, 41, y), IRON_D)
    p.line((0, 8, 45, 8), INK)
    for y in (12,):
        p.line((1, y, 44, y), WOOD_D)
    for x in (15, 30):
        p.line((x, 9, x, 16), WOOD_D)
    for x in (7, 22, 37):
        for y in (10, 14):
            p.dot(x, y, BRASS)
            p.dot(x + 1, y, BRASS)
    p.fill(1, 17, 44, 17, WOOD_D)
    p.fill(1, 19, 44, 19, SHADOW)
    return p.img


def type_rack():
    """The tall rack of type cases at the end of the counter: shallow drawers, each with a brass pull."""
    p = Pen(16, 42)
    p.box(0, 0, 15, 40, WOOD)
    p.fill(1, 1, 14, 3, WOOD_HI)
    p.fill(3, 2, 12, 2, TYPE)
    p.line((0, 4, 15, 4), INK)
    for y in range(8, 37, 4):
        p.line((1, y, 14, y), WOOD_D)
    for y in range(6, 37, 4):
        p.dot(7, y, BRASS)
        p.dot(8, y, BRASS)
    p.fill(1, 37, 14, 39, WOOD_D)
    p.fill(1, 41, 14, 41, SHADOW)
    return p.img


def ream(p, x0, x1, top, bottom, colour=PAPER, edge=PAPER_S):
    """A stack of paper on a shelf, its edge striped."""
    p.box(x0, top, x1, bottom, colour)
    for y in range(top + 2, bottom, 2):
        p.line((x0 + 1, y, x1 - 1, y), edge)


def bundle(p, x0, x1, top, bottom):
    """Paper wrapped in brown paper and tied with string."""
    p.box(x0, top, x1, bottom, KRAFT)
    p.line(((x0 + x1) // 2, top + 1, (x0 + x1) // 2, bottom - 1), KRAFT_D)
    p.line((x0 + 1, (top + bottom) // 2, x1 - 1, (top + bottom) // 2), KRAFT_D)


def paper_rack():
    """The bookcase's place: three shelves of reams, bundles and rolls of paper."""
    p = Pen(48, 48)
    p.box(0, 0, 47, 46, WOOD_D)
    p.fill(1, 1, 46, 2, WOOD_HI)
    p.line((0, 3, 47, 3), INK)
    for x0 in (0, 44):
        p.box(x0, 3, x0 + 3, 46, WOOD)
    for top in (16, 31, 43):
        p.box(0, top, 47, top + 3, WOOD)
        p.line((1, top + 1, 46, top + 1), WOOD_L)
    # top shelf
    ream(p, 5, 15, 7, 16)
    bundle(p, 17, 27, 9, 16)
    ream(p, 29, 37, 5, 16)
    ream(p, 39, 43, 10, 16, (196, 214, 236, 255), (150, 172, 204, 255))
    # middle shelf: rolls seen end on, and coloured paper
    for cx in (9, 19):
        p.draw.ellipse((cx - 5, 21, cx + 4, 30), fill=PAPER, outline=INK)
        p.draw.ellipse((cx - 2, 24, cx + 1, 27), fill=PAPER_S, outline=None)
        p.dot(cx - 1, 25, INK)
    ream(p, 26, 34, 24, 31, (240, 196, 196, 255), (214, 150, 150, 255))
    ream(p, 35, 43, 22, 31, CREAM, (222, 196, 140, 255))
    # bottom shelf
    bundle(p, 5, 16, 36, 43)
    bundle(p, 18, 28, 37, 43)
    ream(p, 30, 43, 35, 43)
    p.fill(0, 47, 47, 47, SHADOW)
    return p.img


def book_press():
    """A small book press: two boards with folded sheets between them, a screw and its bar."""
    p = Pen(12, 11)
    p.box(5, 0, 6, 3, IRON_L)
    p.box(1, 0, 10, 1, IRON_D)
    p.box(0, 3, 11, 5, WOOD)
    p.box(1, 5, 10, 7, PAPER)
    p.line((2, 6, 9, 6), PAPER_S)
    p.box(0, 7, 11, 10, WOOD)
    p.line((1, 8, 10, 8), WOOD_L)
    return p.img


def proof(w=9, h=6):
    """A proof sheet lying on the table: a red heading and lines of type."""
    p = Pen(w, h)
    p.box(0, 0, w - 1, h - 1, PAPER, PAPER_S)
    p.line((2, 1, w - 4, 1), RED)
    for y in range(3, h - 1, 1):
        p.line((1, y, w - 2 - (y % 2) * 2, y), TYPE)
    return p.img


def broadside():
    """A printed bill pinned to the wall: a red title, lines of type, a rule."""
    p = Pen(15, 19)
    p.box(0, 1, 14, 18, PAPER, INK)
    p.dot(7, 0, RED)
    p.dot(7, 1, RED)
    p.fill(3, 3, 11, 4, RED)
    p.line((2, 6, 12, 6), INK)
    for y in range(8, 17, 2):
        p.line((2, y, 12 - (y // 2) % 3, y), TYPE)
    return p.img


def brayer():
    """An ink roller with a wooden handle."""
    p = Pen(9, 4)
    p.box(0, 0, 4, 3, IRON_D)
    p.line((1, 1, 3, 1), IRON)
    p.box(5, 1, 8, 2, WOOD)
    return p.img


ART = '7_Art'
GENERIC = '1_Generic'
LIVING = '2_LivingRoom'
TABLE = shops.widen(shops.cut(ART, (32, 80, 64, 96)), 60)
BINDING = shops.stack((shops.cut(GENERIC, (64, 800, 80, 816)), 0, 0), (book_press(), 2, -7))

FURNITURE = [
    *shops.wall_fixtures(),
    (None, broadside(), (158, 20)),
    ('plant_l', shops.cut(LIVING, (166, 8, 186, 41)), (2, 40)),
    ('press', press(), (122, 23)),
    ('table', shops.stack((TABLE, 0, 0), (proof(), 6, 1), (proof(11, 7), 19, 0), (proof(), 41, 2), (brayer(), 32, 2)),
     (122, 86)),
    ('shelf', paper_rack(), (8, 108)),
    ('counter', composing_frame(), (216, 76)),
    ('counter', type_rack(), (262, 54)),
    ('workbench', BINDING, (128, 144 + 14 - BINDING.height)),
    ('lamp', scene.obj(0, scene.at(290), 16, scene.at(293)), (272, 140)),
    ('plant_r', shops.cut(LIVING, (191, 7, 209, 45)), (300, 108)),
]


def shell():
    return shops.shell(FLOOR, WALL)


def build():
    return shops.build('print', shell(), FURNITURE)


if __name__ == '__main__':
    build()
    print('built print.png')
