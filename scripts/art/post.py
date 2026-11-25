"""Compose the post office (邮局, plan-1.6.md F2) background, 320x180, on the cafe's floor plan (shops.py).

Axin's shop. The counter is a wooden one with a green front, a parcel scale at one end and the stamp pad at the other;
right of the blackboard stands a sorting rack of pigeonholes with letters in them, where he works, and above it on the
wall a cork board where the postcards the shop has opened are pinned (app/renderer/game/postwall.ts pins them); the
bookcase is an open shelf of parcels; the reading table is the packing table, a box and string on it; the corner is the
postbox, green as they are at home, a parcel left beside it. Modern Exteriors' 22_Post_Office has the parcels, the
letters and the postbox (red in the pack, made green here); Modern Interiors' 16_Grocery_store has the steel table; the
counter, the sorting rack, the cork board, the shelf and the rates on the blackboard are drawn here by hand.
Reads the raw packs from assets/vendor/ (not in the repo) and writes assets/sprites/post.png.
Run: python3 scripts/art/post.py
"""
from functools import cache

from PIL import Image

import scene
import shops
from shops import BRASS, IRON, IRON_D, IRON_L, PAPER, PAPER_S, SHADOW, WOOD, WOOD_D, WOOD_HI, WOOD_L, Pen

# A grey and white checker underfoot; a cream wall over a green dado (Room_Builder, col and row).
FLOOR = (12, 4)
WALL = (23, 24)

PACK = shops.ROOT / 'assets/vendor/Modern_Exteriors_16x16/ME_Theme_Sorter_16x16/22_Post_Office_Singles_16x16'
GREEN, GREEN_D, GREEN_L = (52, 118, 84, 255), (34, 82, 58, 255), (96, 160, 118, 255)
CORK, CORK_D = (186, 138, 88, 255), (150, 104, 62, 255)
HOLE = (58, 42, 34, 255)
CHALK_Y = (240, 214, 120, 255)


@cache
def po(name):
    """A Modern Exteriors post office single, trimmed."""
    return shops.trim(Image.open(PACK / f'22_Post_Office_16x16_{name}.png').convert('RGBA'))


def greened(img):
    """The pack's red postbox in post office green: each red pixel keeps its lightness, the outline stays."""
    out = img.copy()
    px = out.load()
    for y in range(out.height):
        for x in range(out.width):
            r, g, b, a = px[x, y]
            if a and r > g + 40 and r > b + 40:
                px[x, y] = (int(r * 0.28), int(r * 0.62), int(r * 0.42), a)
    return out


def rates_chalk():
    """The postage rates chalked on the blackboard every room has (shops.wall_fixtures): an envelope drawn at the top,
    then a line of chalk for each kind of post with its price in yellow."""
    p = Pen(24, 16)
    p.box(8, 0, 15, 4, (0, 0, 0, 0), line=PAPER)
    p.line((8, 0, 11, 2), PAPER)
    p.line((15, 0, 12, 2), PAPER)
    for y in (7, 10, 13):
        p.line((0, y, 12, y), PAPER)
        p.line((17, y, 21, y), CHALK_Y)
    return p.img


def cork_board():
    """The cork board above the sorting rack: a dark wooden frame round speckled cork, a brass pin or two waiting. The
    postcards themselves are pinned by the game, as they come (postwall.ts CORK is this board's place and size)."""
    p = Pen(40, 16)
    p.box(0, 0, 39, 15, CORK, line=WOOD_D)
    for x, y in ((4, 3), (11, 9), (19, 4), (27, 11), (33, 5), (7, 12), (23, 8), (36, 12), (15, 13), (30, 2)):
        p.dot(x, y, CORK_D)
    p.dot(37, 2, BRASS)
    p.dot(2, 13, BRASS)
    return p.img


def sorting_rack():
    """Where Axin works: a wooden cabinet of pigeonholes, four across and three down, letters standing in most of them."""
    p = Pen(44, 24)
    p.box(0, 0, 43, 22, WOOD)
    p.line((1, 1, 42, 1), WOOD_HI)
    for row in range(3):
        for col in range(4):
            x, y = 3 + col * 10, 3 + row * 6
            p.fill(x, y, x + 7, y + 4, HOLE)
            if (row * 4 + col) % 3 != 1:
                p.fill(x + 1, y + 1, x + 5, y + 4, PAPER if (row + col) % 2 else PAPER_S)
                p.dot(x + 3, y + 2, (200, 72, 60, 255))
    p.fill(1, 21, 42, 21, WOOD_D)
    p.fill(0, 23, 43, 23, SHADOW)
    return p.img


def post_counter():
    """The counter: a wooden top on a green front with panels, a parcel scale at the left end, a letter waiting on it,
    and the stamp pad and stamp at the right end, where the cup and the slip are clear of them."""
    p = Pen(60, 30)
    p.box(0, 14, 59, 28, GREEN)
    p.fill(0, 14, 59, 15, WOOD)
    p.line((1, 14, 58, 14), WOOD_HI)
    p.line((0, 13, 59, 13), WOOD_D)
    for x in range(4, 56, 14):
        p.box(x, 18, x + 10, 25, GREEN, line=GREEN_D)
        p.line((x + 1, 19, x + 9, 19), GREEN_L)
    p.fill(1, 27, 58, 27, GREEN_D)
    # The parcel scale: an iron platform on a post, its round dial facing the room.
    p.box(2, 4, 15, 6, IRON_L, line=IRON_D)
    p.fill(8, 7, 9, 12, IRON)
    p.box(4, 8, 13, 12, IRON, line=IRON_D)
    p.fill(6, 9, 11, 11, PAPER)
    p.dot(8, 10, (200, 72, 60, 255))
    p.img.alpha_composite(po('Letter_1'), (3, -2 + 2))
    # The stamp pad and its stamp.
    p.box(50, 10, 57, 12, (72, 104, 160, 255))
    p.box(53, 5, 55, 9, WOOD_L, line=WOOD_D)
    p.fill(0, 29, 59, 29, SHADOW)
    return p.img


def parcel_shelf():
    """The bookcase's place: an open wooden shelf, two parcels above, two below, a bundle of letters on top."""
    p = Pen(46, 40)
    p.box(0, 2, 3, 38, WOOD, line=WOOD_D)
    p.box(42, 2, 45, 38, WOOD, line=WOOD_D)
    for y in (2, 20, 36):
        p.box(0, y, 45, y + 2, WOOD_L, line=WOOD_D)
    p.fill(0, 39, 45, 39, SHADOW)
    img = p.img
    for part, at in ((po('Single_Package_1'), (5, 20 - 11)), (po('Single_Package_4'), (28, 20 - 9)),
                     (po('Single_Package_2'), (5, 36 - 16)), (po('Single_Package_5'), (24, 36 - 16))):
        img.alpha_composite(part, at)
    return shops.stack((img, 0, 0), (po('Letter_2'), 14, -6), (po('Letter_1'), 22, -7))


STEEL = shops.widen(shops.cut('16_Grocery_store', (224, 620, 256, 642)), 58, edge=6)
TABLE = shops.stack((STEEL, 0, 0), (po('Big_Single_Package_2'), 8, -po('Big_Single_Package_2').height + 4),
                    (po('Letter_2'), 40, -6))
CORNER = shops.stack((greened(po('Red_Mailbox_2_Front')), 0, 0), (po('Single_Package_3'), 12, 23 - 21), (po('Single_Package_4'), 21, 23 - 9))
RACK = sorting_rack()

FURNITURE = [
    *shops.wall_fixtures(),
    (None, rates_chalk(), (96, 19)),
    (None, cork_board(), (128, 18)),
    (None, RACK, (126, 57 - RACK.height)),
    ('plant_l', scene.obj(192, scene.at(26), 208, scene.at(29)), (4, 40)),
    ('table', TABLE, (122, 102 - TABLE.height)),
    ('shelf', parcel_shelf(), (6, 156 - 40)),
    ('counter', post_counter(), (216, 96 - 30)),
    ('workbench', CORNER, (134, 158 - CORNER.height)),
    ('lamp', scene.obj(0, scene.at(290), 16, scene.at(293)), (272, 140)),
    ('plant_r', scene.obj(167, scene.at(26), 185, scene.at(29)), (300, 112)),
]


def shell():
    return shops.shell(FLOOR, WALL)


def build():
    return shops.build('post', shell(), FURNITURE)


if __name__ == '__main__':
    build()
    print('built post.png')
