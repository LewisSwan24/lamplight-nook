"""Compose the study background (320x180), the second scene (plan.md R4), from LimeZu Modern Interiors.

The study keeps the cafe's floor plan (layout.ts): the same zones, anchors, doors, windows and chairs, so the
staff walk, sit and work exactly as in the cafe, and the growth pieces and holiday decorations fit. Only the
furniture, wall and floor change: a desk where the counter was, a bookcase, a reading table, a sofa.
Reads the raw pack from assets/vendor/ (not in the repo) and writes assets/sprites/study.png.
Run: python3 scripts/art/study.py
"""
from pathlib import Path

from PIL import Image

import scene

ROOT = Path(__file__).resolve().parents[2]
THEMES = ROOT / 'assets/vendor/1_Interiors/16x16/Theme_Sorter'
OUT = ROOT / 'assets/sprites'
W, H = scene.W, scene.H

living = Image.open(THEMES / '2_LivingRoom_16x16.png').convert('RGBA')
library = Image.open(THEMES / '5_Classroom_and_library_16x16.png').convert('RGBA')


def piece(sheet, rect):
    part = sheet.crop(rect)
    return part.crop(part.getbbox())


# name, sheet, pixel rect on it -> top-left on the canvas. Drawn in order, so later pieces overlap earlier ones.
# The names are the cafe's where a piece plays the same part (scripts/art/pieces.py); the wall and the rug have none.
FURNITURE = [
    # back wall: the same two windows and blackboard as the cafe (the window glass takes the sky's colour)
    (None, scene.interiors, (0, scene.at(226), 32, scene.at(228)), (16, 12)),
    (None, scene.interiors, (0, scene.at(226), 32, scene.at(228)), (52, 12)),
    (None, scene.interiors, (0, scene.at(338), 32, scene.at(340)), (92, 14)),
    # floor
    ('plant_l', living, (166, 8, 186, 41), (2, 40)),  # a tall pot plant in the corner
    (None, scene.interiors, (112, scene.at(15), 176, scene.at(18)), (116, 78)),  # rug under the reading table
    ('table', living, (33, 123, 95, 142), (122, 84)),  # the reading table: two low tables with lace cloths
    ('shelf', library, (0, 360, 47, 411), (8, 108)),  # the bookcase
    ('counter', living, (52, 181, 112, 202), (218, 76)),  # Adeng's desk: a cabinet and a chest of drawers side by side
    ('counter', living, (84, 154, 96, 171), (246, 63)),  # the desk lamp on it
    ('counter', library, (208, 12, 224, 38), (264, 56)),  # a globe at the end of the desk
    ('workbench', scene.interiors, (144, scene.at(272), 176, scene.at(274)), (128, 144)),  # Laoshi's workbench, brought from home
    ('lamp', living, (176, 182, 192, 210), (274, 138)),  # a floor lamp by the visitor's chair
    ('plant_r', living, (191, 7, 209, 45), (300, 108)),  # another plant by the front wall
]

# Under the reading table, where two of the staff sit for a meeting.
SOFA = (living, (16, 450, 64, 482))
SOFA_POS = (129, 106)


def shell():
    """The room with nothing standing in it: floor, wall and the daylight behind the two doors."""
    img = Image.new('RGBA', (W, H), (59, 42, 30, 255))
    floor = scene.tiles(scene.floors, 0, 12, 3, 2)
    for y in range(48, H, floor.height):
        for x in range(0, W, floor.width):
            img.alpha_composite(floor, (x, y))
    wall = scene.tiles(scene.walls, 23, 24, 1, 2)
    for x in range(0, W, scene.T):
        img.alpha_composite(wall, (x, 16))
    door, back = scene.DOOR, scene.BACK_DOOR
    img.paste((205, 226, 222, 255), (door[0] + 1, door[1] + 12, door[0] + 15, door[1] + 32))
    img.paste((150, 200, 140, 255), (back[0] + 1, back[1] + 12, back[0] + 15, back[1] + 32))
    return img


def build():
    img = shell()
    for _name, sheet, rect, pos in FURNITURE:
        img.alpha_composite(piece(sheet, rect), pos)
    img.alpha_composite(piece(*SOFA), SOFA_POS)
    for (col, row), (x, y) in sorted(scene.CHAIRS, key=lambda c: c[1][1]):
        img.alpha_composite(scene.tiles(scene.interiors, col, row, 1, 2), (x - 8, y - 24))
    img.save(OUT / 'study.png')
    return img


if __name__ == '__main__':
    build()
    print('built study.png')
