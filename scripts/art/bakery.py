"""Compose the bakery (面包房, plan-1.6.md F1) background, 320x180, on the cafe's floor plan (shops.py).

Auntie Gui's shop. The counter is a glass bread case on a wooden base, trays of bread on top; right of the blackboard stand
two steel ovens against the wall, where she works; the bookcase is a pair of bakery racks full of loaves; the reading
table is a steel kneading table with dough rising in its bowls; the corner is the dough mixer on its own little table, a
sack of flour beside it; the day's prices are chalked on the blackboard. Modern Interiors' 16_Grocery_store has the ovens, the racks, the trays and the steel tables,
3_Animated_objects the mixer, and Modern Farm the bread bowls, the loaf, the basket and the sacks; the bread case and the
prices are drawn here by hand. The packs do have bread after all (plan-1.6.md Q-F10): only the case is new.
Reads the raw pack from assets/vendor/ (not in the repo) and writes assets/sprites/bakery.png.
Run: python3 scripts/art/bakery.py
"""
from functools import cache

from PIL import Image

import scene
import shops
from shops import PAPER, SHADOW, WOOD, WOOD_D, WOOD_HI, WOOD_L, Pen

# Round terracotta tiles underfoot; a warm yellow wall with an orange band (Room_Builder, col and row).
FLOOR = (4, 24)
WALL = (1, 20)

GROCERY = '16_Grocery_store'
GLASS, GLASS_L = (196, 226, 236, 200), (232, 246, 250, 230)
CRUST, CRUST_D, CRUMB = (204, 136, 64, 255), (152, 92, 44, 255), (240, 206, 140, 255)


def grocery(x0, y0, x1, y1):
    return shops.cut(GROCERY, (x0, y0, x1, y1))


@cache
def mixer():
    """The first frame of the pack's dough mixer (it turns in the pack; here it rests)."""
    sheet = Image.open(shops.ROOT / 'assets/vendor/3_Animated_objects/16x16/spritesheets/animated_kitchen_kneader.png').convert('RGBA')
    return shops.trim(sheet.crop((0, 0, 16, sheet.height)))


def loaf(p, x, y, long=False):
    """A loaf seen from the front: a dark crust edge, a lighter top, a score or two."""
    w = 8 if long else 5
    p.fill(x, y + 1, x + w, y + 3, CRUST)
    p.fill(x + 1, y, x + w - 1, y, CRUST)
    p.line((x, y + 3, x + w, y + 3), CRUST_D)
    for sx in range(x + 2, x + w - 1, 3):
        p.dot(sx, y + 1, CRUMB)


def bread_case():
    """The counter: a wooden base with a glass case on it, loaves and rolls inside on two shelves, a till at the end."""
    p = Pen(60, 30)
    # The base, in the cafe's warm wood, with a darker plinth.
    p.box(0, 14, 59, 28, WOOD)
    p.line((1, 15, 58, 15), WOOD_HI)
    for x in range(8, 58, 14):
        p.line((x, 17, x, 26), WOOD_L)
    p.fill(1, 27, 58, 27, WOOD_D)
    # The glass case on top, two shelves of bread showing through it.
    p.box(2, 0, 44, 14, GLASS)
    p.line((3, 1, 43, 1), GLASS_L)
    p.line((3, 7, 43, 7), (150, 170, 180, 255))
    for i, x in enumerate(range(4, 38, 7)):
        loaf(p, x, 3, long=i % 3 == 0)
    for x in range(5, 40, 6):
        p.fill(x, 10, x + 3, 12, CRUST)
        p.dot(x + 1, 10, CRUMB)
    p.dot(4, 2, GLASS_L)
    p.dot(5, 3, GLASS_L)
    # A small till on the bare end of the counter, where the cup and the slip go.
    p.box(48, 6, 57, 13, (120, 124, 140, 255))
    p.fill(50, 8, 55, 9, (196, 226, 160, 255))
    p.fill(0, 29, 59, 29, SHADOW)
    return p.img


def price_chalk():
    """The day's prices chalked on the blackboard every room has (shops.wall_fixtures): a loaf drawn at the top, then
    a line of chalk for each kind with its price in yellow. The wall right of the ovens is kept for the festivals and for
    what the shop grows (decor.py, growth.py), so the prices go where there is a board already."""
    p = Pen(24, 16)
    loaf(p, 9, 0, long=True)
    for y in (6, 9, 12):
        p.line((0, y, 12, y), PAPER)
        p.line((17, y, 21, y), (240, 214, 120, 255))
    return p.img


DOUBLE_OVEN = grocery(146, 579, 174, 608)
OVENS = shops.stack((DOUBLE_OVEN, 0, 0), (DOUBLE_OVEN, DOUBLE_OVEN.width + 1, 0))
RACK = grocery(114, 548, 142, 580)
RACKS = shops.stack((RACK, 0, 0), (RACK, RACK.width - 1, 0), (shops.farm('Basket_Empty'), 8, -10),
                    (shops.farm('Bread_Stone_Oven'), 34, -9))
STEEL = shops.widen(grocery(224, 620, 256, 642), 58, edge=6)
TABLE = shops.stack((STEEL, 0, 0), (shops.farm('Bread_Pot_1_Stone_Oven'), 6, -9), (shops.farm('Bread_Pot_2_Stone_Oven'), 22, -9),
                    (grocery(226, 600, 239, 612), 40, -6))
SMALL = shops.widen(grocery(224, 620, 256, 642), 26, edge=6)
CORNER = shops.stack((SMALL, 0, 0), (mixer(), 6, -mixer().height + 4), (shops.farm('Sack_Jute_Load_1'), 24, -2))

FURNITURE = [
    *shops.wall_fixtures(),
    (None, price_chalk(), (96, 19)),
    (None, OVENS, (124, 56 - OVENS.height)),
    ('plant_l', scene.obj(192, scene.at(26), 208, scene.at(29)), (4, 40)),
    ('table', TABLE, (122, 102 - TABLE.height)),
    ('shelf', RACKS, (6, 156 - RACKS.height)),
    ('counter', bread_case(), (216, 96 - 30)),
    ('workbench', CORNER, (124, 158 - CORNER.height)),
    ('lamp', scene.obj(0, scene.at(290), 16, scene.at(293)), (272, 140)),
    ('plant_r', scene.obj(167, scene.at(26), 185, scene.at(29)), (300, 112)),
]


def shell():
    return shops.shell(FLOOR, WALL)


def build():
    return shops.build('bakery', shell(), FURNITURE)


if __name__ == '__main__':
    build()
    print('built bakery.png')
