"""Compose the cafe background (320x180) from LimeZu Modern Interiors tiles.

Reads the raw pack from assets/vendor/ (not in the repo) and writes assets/sprites/cafe.png.
Run: python3 scripts/art/scene.py
"""
from pathlib import Path

from PIL import Image

import backroom
import rug

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
    ('window3', (0, at(226), 32, at(228)), (197, 12)),  # looks out on the street, between the clock and the wall painting
    ('board', (0, at(338), 32, at(340)), (92, 14)),
    # floor
    ('plant_l', (192, at(26), 208, at(29)), (4, 40)),
    ('table', (8, at(316, 24), 72, at(316, 62)), (124, 72)),
    ('bench', (8, at(316, 62), 72, at(316, 79)), (124, 112)),
    ('counter', (112, at(321), 192, at(323)), (216, 76)),
    ('coffee', (204, at(280, 102), 226, at(280, 128)), (238, 62)),
    ('shelf', (64, at(296), 112, at(299)), (8, 112)),
    ('workbench', (144, at(272), 176, at(274)), (128, 144)),
    ('lamp', (0, at(290), 16, at(293)), (272, 140)),
    ('plant_r', (167, at(26), 185, at(29)), (300, 112)),
]


# Top-left of the door (an animated sprite placed by the game at the same spot).
DOOR = (288, 16)
# The back door out to the garden, in the near wall (app/renderer/game/garden.ts, BACK_DOOR).
BACK_DOOR = (152, 164)
NEAR_WALL_Y = 176
NEAR_WALL = (34, 28, 36, 255)
WALL_CAP_ROW = 1
GARDEN_GREEN = (150, 200, 140, 255)
MAT = (132, 142, 104, 255)
MAT_EDGE = (92, 102, 76, 255)
DOOR_WOOD = (156, 98, 58, 255)
DOOR_EDGE = (92, 56, 38, 255)
DOOR_KNOB = (238, 204, 120, 255)
DAYLIGHT = (214, 240, 190, 70)

# Chairs at the table seats (app/renderer/game/layout.ts, SEATS): a chair's 16x32 cell sits 8px below
# the sitting character's frame, whose feet are at the seat point.
CHAIR_FACING_LEFT = (7, 270)   # back on the right
CHAIR_FACING_RIGHT = (7, 268)  # back on the left
CHAIRS = [
    (CHAIR_FACING_LEFT, (196, 100)),
    (CHAIR_FACING_RIGHT, (104, 100)),
    # The customer's chair by the lamp, where the player waits while their commission is made
    # (app/renderer/game/you.ts, YOU_SEAT).
    (CHAIR_FACING_LEFT, (262, 166)),
]

# Animated props are played by the game, so they are copied as sheets rather than drawn in.
ANIMATED = {
    'door.png': 'animated_door_4.png',  # 5 frames of 16x32, closed to open
    'clock.png': 'animated_cuckoo_clock.png',  # 10 frames of 16x32
    'cup.png': 'animated_coffee.png',  # 6 frames of 16x32, a steaming cup
}


def shell():
    """The room with nothing standing in it: floor, wall and the daylight behind the two doors."""
    img = Image.new('RGBA', (W, H), (59, 42, 30, 255))
    floor = tiles(floors, 4, 12, 3, 2)
    for y in range(48, H, floor.height):
        for x in range(0, W, floor.width):
            img.alpha_composite(floor, (x, y))
    wall = tiles(walls, 1, 22, 1, 2)
    for x in range(0, W, T):
        img.alpha_composite(wall, (x, 16))
    # The doorway behind the animated door: daylight outside, seen when the door opens.
    door = (DOOR[0], DOOR[1])
    img.paste((205, 226, 222, 255), (door[0] + 1, door[1] + 12, door[0] + 15, door[1] + 32))
    near_wall(img, wall)
    return img


def near_wall(img, wall):
    """The wall nearest us, seen from above along the bottom edge. Its gap shows the garden, with a mat in front."""
    img.paste(wall.getpixel((0, WALL_CAP_ROW)), (0, NEAR_WALL_Y, W, NEAR_WALL_Y + 1))
    img.paste(NEAR_WALL, (0, NEAR_WALL_Y + 1, W, H))
    x = BACK_DOOR[0]
    img.paste(GARDEN_GREEN, (x + 1, NEAR_WALL_Y, x + 15, H))
    img.paste(MAT_EDGE, (x - 1, NEAR_WALL_Y - 6, x + 17, NEAR_WALL_Y - 1))
    img.paste(MAT, (x, NEAR_WALL_Y - 5, x + 16, NEAR_WALL_Y - 2))


def back_door():
    """The back door from above, swinging outwards: closed, two steps, then open with the daylight on the mat."""
    sheet = Image.new('RGBA', (16 * 4, 16), (0, 0, 0, 0))
    top = NEAR_WALL_Y - BACK_DOOR[1]
    for frame, right in enumerate((15, 9, 4, 1)):
        x = frame * 16
        for px in range(1, right):
            for y in range(top, 16):
                sheet.putpixel((x + px, y), DOOR_EDGE if y == top or px in (1, right - 1) else DOOR_WOOD)
        for post in (0, 15):
            for y in range(top - 2, 16):
                sheet.putpixel((x + post, y), DOOR_EDGE)
        if frame == 0:
            sheet.putpixel((x + 12, top + 1), DOOR_KNOB)
        if frame == 3:
            for y in range(top - 6, top):
                inset = (top - y) // 2
                for px in range(2 + inset, 14 - inset):
                    sheet.putpixel((x + px, y), DAYLIGHT)
    sheet.save(OUT / 'back-door.png')


def build():
    img = shell()
    for _name, rect, pos in FURNITURE:
        img.alpha_composite(obj(*rect), pos)
    # Chairs are drawn top to bottom so a lower chair overlaps the one above it.
    for (col, row), (x, y) in sorted(CHAIRS, key=lambda c: c[1][1]):
        img.alpha_composite(tiles(interiors, col, row, 1, 2), (x - 8, y - 24))
    rug.patch(img)
    backroom.paint(img, 'cafe')
    OUT.mkdir(parents=True, exist_ok=True)
    img.save(OUT / 'cafe.png')
    back_door()
    animated = ROOT / 'assets/vendor/3_Animated_objects/16x16/spritesheets'
    for out, src in ANIMATED.items():
        Image.open(animated / src).convert('RGBA').save(OUT / out)
    return img


if __name__ == '__main__':
    build()
    print('built cafe.png')
