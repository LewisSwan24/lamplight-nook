"""Compose the workshop (工坊, road-to-1.4.md D2) background, 320x180, on the cafe's floor plan (shops.py).

The counter is a DIY workbench with tools on it; right of the blackboard hangs a tool wall; the bookcase is a parts
cabinet of small drawers with boxes on top; the corner is a desk with an old computer; the reading table is a bench with
a job in pieces on it. Modern Farm has the workbenches and their tools, Modern Interiors' 1_Generic the tools on the
wall and the boxes, and 5_Classroom_and_library the old computer on its desk; the pegboard and the parts cabinet are
drawn here by hand.
Reads the raw pack from assets/vendor/ (not in the repo) and writes assets/sprites/workshop.png.
Run: python3 scripts/art/workshop.py
"""
import scene
import shops
from shops import INK, IRON_D, IRON_L, KRAFT, KRAFT_D, PAPER, SHADOW, Pen

FLOOR = (12, 16)
WALL = (12, 18)

GENERIC = '1_Generic'
LIVING = '2_LivingRoom'
STEEL, STEEL_D, STEEL_L = (92, 132, 140, 255), (64, 96, 106, 255), (138, 176, 180, 255)


def pegboard():
    """The tool wall: a pegboard with the pack's two sets of wall tools hung on it, side by side."""
    p = Pen(56, 25)
    p.box(0, 0, 55, 24, KRAFT)
    p.line((1, 1, 54, 1), (220, 186, 132, 255))
    for y in range(4, 24, 3):
        for x in range(2, 55, 3):
            p.dot(x, y, KRAFT_D)
    left = shops.cut(GENERIC, (2, 877, 30, 896))
    right = shops.cut(GENERIC, (34, 877, 62, 896))
    return shops.stack((p.img, 0, 0), (left, 1, 3), (right, 28, 3))


def parts_cabinet():
    """The bookcase's place: a steel cabinet of small labelled drawers, with boxes of parts on top."""
    p = Pen(44, 40)
    p.box(0, 0, 43, 38, STEEL_D)
    p.fill(1, 1, 42, 2, STEEL_L)
    p.line((0, 3, 43, 3), INK)
    for row in range(5):
        for col in range(4):
            x0, y0 = 2 + col * 10, 5 + row * 6
            p.box(x0, y0, x0 + 8, y0 + 4, STEEL)
            p.fill(x0 + 2, y0 + 1, x0 + 6, y0 + 1, PAPER)
            p.fill(x0 + 3, y0 + 3, x0 + 5, y0 + 3, IRON_D)
    p.fill(1, 36, 42, 37, IRON_D)
    p.fill(0, 39, 43, 39, SHADOW)
    boxes = shops.cut(GENERIC, (192, 944, 224, 976))
    small = shops.cut(GENERIC, (208, 944, 224, 960))
    return shops.stack((p.img, 0, 0), (small, 4, 2 - small.height), (small, 24, 3 - small.height))


BENCH = shops.farm('DIY_Crafting_Table')
COUNTER = shops.stack((BENCH, 0, 0), (shops.farm('Hammer_DIY_Crafting_Table'), 18, 16),
                      (shops.farm('Pencils_Can_DIY_Crafting_Table'), 32, 14), (shops.farm('Handbook_DIY_Crafting_Table'), 22, 22))
JOB = shops.widen(shops.cut('14_Basement', (112, 216, 152, 248)), 60)
TABLE = shops.stack((JOB, 0, 0), (shops.farm('Wood_Piece_1_Woodwork_Crafting_Table'), 4, -4), (shops.farm('Hacksaw_Woodwork_Crafting_Table'), 16, -5),
                    (shops.farm('Wood_Cutter_Woodwork_Crafting_Table'), 30, -3), (shops.farm('Color_Can_Full_DIY_Crafting_Table'), 44, -9))
CABINET = parts_cabinet()
COMPUTER = shops.cut('5_Classroom_and_library', (112, 160, 144, 208))

FURNITURE = [
    *shops.wall_fixtures(),
    (None, pegboard(), (122, 19)),
    ('plant_l', scene.obj(192, scene.at(26), 208, scene.at(29)), (4, 40)),
    ('table', TABLE, (122, 102 - TABLE.height)),
    ('shelf', CABINET, (8, 156 - CABINET.height)),
    ('counter', COUNTER, (224, 95 - COUNTER.height)),
    ('workbench', COMPUTER, (126, 158 - COMPUTER.height)),
    ('lamp', scene.obj(0, scene.at(290), 16, scene.at(293)), (272, 140)),
    ('plant_r', scene.obj(167, scene.at(26), 185, scene.at(29)), (300, 112)),
]


def shell():
    return shops.shell(FLOOR, WALL)


def build():
    return shops.build('workshop', shell(), FURNITURE)


if __name__ == '__main__':
    build()
    print('built workshop.png')
