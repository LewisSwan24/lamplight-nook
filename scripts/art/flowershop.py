"""Compose the florist (花店, plan-2.0.md J2) background, 320x180, on the cafe's floor plan (shops.py).

Fern's shop, on the river street. The counter is a plain wooden one with a till, a roll of wrapping paper and a jar of
cut stems on it; the bookcase is a stand of three wooden steps with small pots and vases on each; the reading table is
the work table, where bouquets are made up; the corner is three tall buckets of flowers; a wreath hangs on the wall
where the post office has its cork board, and a shelf of little pots above the table. Modern Exteriors' 17_Garden has the
vases, the pots and the buckets; the counter, the steps, the table, the wreath and the wall shelf are drawn here by hand.
Reads the raw packs from assets/vendor/ (not in the repo) and writes assets/sprites/flowershop.png. The shop is
`flowershop`, not `florist`: that is Fern's id as a guest, and florist.png her sprite sheet.
Run: py -3.12 scripts/art/flowershop.py
"""
from functools import cache

from PIL import Image

import scene
import shops
from shops import PAPER, SHADOW, WOOD, WOOD_D, WOOD_HI, WOOD_L, Pen

FLOOR = (0, 30)
WALL = (1, 24)

GARDEN = shops.ROOT / 'assets/vendor/Modern_Exteriors_16x16/ME_Theme_Sorter_16x16/17_Garden_Singles_16x16'
LEAF, LEAF_D = (88, 142, 66, 255), (58, 102, 48, 255)
PETALS = [(214, 84, 96, 255), (240, 196, 72, 255), (236, 236, 240, 255), (196, 120, 200, 255)]
WRAP, WRAP_D = (236, 214, 190, 255), (196, 168, 140, 255)


@cache
def g(name):
    """A Modern Exteriors garden single, trimmed."""
    return shops.trim(Image.open(GARDEN / f'ME_Singles_Garden_16x16_{name}.png').convert('RGBA'))


def counter():
    """The counter: a wooden base, a till at one end, a roll of wrapping paper and a jar of cut stems."""
    p = Pen(60, 30)
    p.box(0, 12, 59, 28, WOOD)
    p.line((1, 13, 58, 13), WOOD_HI)
    for x in range(8, 58, 14):
        p.line((x, 15, x, 26), WOOD_L)
    p.fill(1, 27, 58, 27, WOOD_D)
    # The roll of paper on its side, the end of it hanging over the front.
    p.box(4, 6, 26, 11, WRAP, line=WRAP_D)
    p.fill(24, 11, 26, 17, WRAP)
    # A glass jar of stems, flowers on top.
    p.box(31, 3, 37, 11, (196, 226, 236, 255))
    for i, x in enumerate((30, 33, 36, 38)):
        p.line((x + 1, 3, x + 1, 0), LEAF_D)
        p.dot(x, 0, PETALS[i % 4])
        p.dot(x + 1, 0, PETALS[i % 4])
    # The till.
    p.box(48, 4, 57, 11, (120, 124, 140, 255))
    p.fill(50, 6, 55, 7, (196, 226, 160, 255))
    p.fill(0, 29, 59, 29, SHADOW)
    return p.img


def steps():
    """The bookcase's place: a stand of three wooden steps. The six vases on it are drawn by the game
    (app/renderer/game/FlowerStand.ts, plan-2.0.md J12), so what is in them changes day by day; VASES are their feet."""
    p = Pen(46, 40)
    for i, (y, x0) in enumerate(((10, 18), (22, 9), (34, 0))):
        p.box(x0, y, 45, y + 3, WOOD_L, line=WOOD_D)
        p.box(x0, y + 4, x0 + 2, 38, WOOD, line=WOOD_D)
    p.box(43, 10, 45, 38, WOOD, line=WOOD_D)
    p.fill(0, 39, 45, 39, SHADOW)
    return p.img  # not trimmed: the top step stays at its place with no vases above it


# The left foot of each vase on the stand, from the stand's top left: two on the top step, two on each below.
VASES = [(22, 10), (34, 10), (12, 22), (26, 22), (3, 34), (17, 34)]


def bouquet(p, x, y):
    """A bouquet lying on the table: paper round the stems, three heads of flowers."""
    p.fill(x, y + 2, x + 9, y + 4, WRAP)
    p.line((x, y + 4, x + 9, y + 4), WRAP_D)
    for i, dx in enumerate((10, 11, 12)):
        p.dot(x + dx, y + 1 + i, PETALS[i])
        p.dot(x + dx + 1, y + 1 + i, PETALS[i])


def work_table():
    """The reading table's place: a long wooden table, two bouquets being made up and a pair of scissors."""
    p = Pen(58, 18)
    p.box(0, 6, 57, 9, WOOD_L, line=WOOD_D)
    # An apron board under the top, so it reads as a solid table.
    p.fill(1, 10, 56, 11, WOOD_D)
    p.box(2, 10, 4, 16, WOOD, line=WOOD_D)
    p.box(53, 10, 55, 16, WOOD, line=WOOD_D)
    bouquet(p, 6, 1)
    bouquet(p, 30, 2)
    p.line((48, 4, 52, 2), (140, 144, 160, 255))
    p.line((48, 2, 52, 4), (140, 144, 160, 255))
    p.fill(0, 17, 57, 17, SHADOW)
    return p.img


def wreath():
    """A wreath of green with a few flowers in it and a red bow, hung on the wall."""
    p = Pen(20, 20)
    for y in range(20):
        for x in range(20):
            d = ((x - 9.5) ** 2 + (y - 9.5) ** 2) ** 0.5
            if 5.5 <= d <= 9.5:
                p.dot(x, y, LEAF_D if d > 8.6 or d < 6.3 else LEAF)
    for i, (x, y) in enumerate(((3, 7), (15, 5), (4, 14), (14, 15), (9, 2))):
        p.dot(x, y, PETALS[i % 4])
        p.dot(x + 1, y, PETALS[i % 4])
    p.fill(8, 16, 11, 18, (200, 60, 60, 255))
    return p.img


def wall_shelf():
    """A plank on two brackets on the wall, three little pots of green on it."""
    p = Pen(44, 14)
    p.box(0, 10, 43, 12, WOOD_L, line=WOOD_D)
    p.box(4, 13, 5, 13, WOOD_D)
    p.box(38, 13, 39, 13, WOOD_D)
    img = p.img
    for i, x in enumerate((4, 18, 32)):
        pot = g(('Big_Sprout_Vase_1', 'Big_Sprout_Vase_3', 'Big_Sprout_Vase_5')[i])
        img.alpha_composite(pot, (x, 10 - pot.height + 1)) if pot.height <= 11 else img.alpha_composite(pot.crop((0, pot.height - 11, pot.width, pot.height)), (x, 0))
    return img


BUCKETS = shops.stack((g('Big_Red_Flower_Vase'), 0, 0), (g('Big_Yellow_Flower_Vase'), 14, 2), (g('Big_White_Flower_Vase'), 28, 0))
SHELF = wall_shelf()

FURNITURE = [
    *shops.wall_fixtures(),
    (None, wreath(), (130, 18)),
    (None, SHELF, (150, 57 - SHELF.height)),
    ('plant_l', scene.obj(192, scene.at(26), 208, scene.at(29)), (4, 40)),
    ('table', work_table(), (122, 102 - 18)),
    ('shelf', steps(), (6, 156 - 40)),
    ('counter', counter(), (216, 96 - 30)),
    ('workbench', BUCKETS, (128, 158 - BUCKETS.height)),
    ('lamp', scene.obj(0, scene.at(290), 16, scene.at(293)), (272, 140)),
    ('plant_r', scene.obj(167, scene.at(26), 185, scene.at(29)), (300, 112)),
]


def shell():
    return shops.shell(FLOOR, WALL)


def build():
    return shops.build('flowershop', shell(), FURNITURE)


if __name__ == '__main__':
    build()
    print('built flowershop.png')
