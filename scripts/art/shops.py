"""What the three new shops (road-to-1.4.md D2) share: print.py, studio.py and workshop.py each build one room with it.

Every shop keeps the cafe's floor plan (layout.ts), as the study does (study.py): the same zones, anchors, doors, the
three windows, the blackboard whose slate the step list is chalked on, and the three chairs. Only the floor, the wall
and the furniture change, so the staff walk, stand and sit in the same places.

A room's FURNITURE is a list of (name, image, top-left), drawn in order. A piece with a name stands on the floor and
becomes a piece of furniture people can walk behind (pieces.py); the wall, the windows and anything hung there have
none. Where the pack has nothing (a printing press, a type case, a parts cabinet), the piece is drawn here by hand in
the pack's manner, like the back room's cabinet (backroom.py): the same dark outline, flat colours and one shade.
"""
from functools import cache
from pathlib import Path

from PIL import Image, ImageDraw

import scene
from growth import COLORS

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'assets/sprites'
THEMES = ROOT / 'assets/vendor/1_Interiors/16x16/Theme_Sorter'
FARM = ROOT / 'assets/vendor/Modern_Farm/16x16/Single_Files_16x16/Props_and_Buildings_16x16'
W, H = scene.W, scene.H

INK = COLORS['x']
SHADOW = (42, 34, 51, 70)
IRON_D, IRON, IRON_L = (62, 64, 82, 255), (96, 100, 120, 255), (146, 152, 172, 255)
BRASS, BRASS_D = COLORS['G'], COLORS['h']
WOOD_D, WOOD, WOOD_L, WOOD_HI = COLORS['k'], COLORS['o'], (206, 158, 102, 255), (226, 184, 128, 255)
PAPER, PAPER_S = COLORS['w'], (214, 206, 192, 255)
KRAFT, KRAFT_D = (198, 160, 106, 255), (158, 118, 74, 255)
TYPE, TYPE_L = (112, 116, 134, 255), (168, 172, 186, 255)


@cache
def theme(name):
    return Image.open(THEMES / f'{name}_16x16.png').convert('RGBA')


def trim(img):
    return img.crop(img.getbbox())


def cut(name, rect):
    """A piece of a Modern Interiors theme sheet: a rough pixel rect, trimmed to what is drawn."""
    return trim(theme(name).crop(rect))


def farm(name):
    """A Modern Farm single, trimmed."""
    return trim(Image.open(FARM / f'{name}_16x16.png').convert('RGBA'))


def widen(img, width, edge=10):
    """The same piece made wider by repeating its middle columns: a longer table with its legs at the ends."""
    out = Image.new('RGBA', (width, img.height), (0, 0, 0, 0))
    out.paste(img.crop((0, 0, edge, img.height)), (0, 0))
    out.paste(img.crop((img.width - edge, 0, img.width, img.height)), (width - edge, 0))
    middle = img.crop((edge, 0, img.width - edge, img.height))
    for x in range(edge, width - edge, middle.width):
        out.paste(middle.crop((0, 0, min(middle.width, width - edge - x), img.height)), (x, 0))
    return out


def stack(*parts):
    """Things standing on something: (image, dx, dy) each, the first at 0,0, all on one canvas trimmed to fit."""
    left = min(dx for _i, dx, _y in parts)
    top = min(dy for _i, _x, dy in parts)
    right = max(dx + i.width for i, dx, _y in parts)
    bottom = max(dy + i.height for i, _x, dy in parts)
    out = Image.new('RGBA', (right - left, bottom - top), (0, 0, 0, 0))
    for img, dx, dy in parts:
        out.alpha_composite(img, (dx - left, dy - top))
    return out


def drawn(rows, colours):
    """A piece drawn as rows of characters, '.' empty, the rest looked up in colours."""
    img = Image.new('RGBA', (len(rows[0]), len(rows)), (0, 0, 0, 0))
    for y, row in enumerate(rows):
        assert len(row) == len(rows[0]), row
        for x, c in enumerate(row):
            if c != '.':
                img.putpixel((x, y), colours[c])
    return img


class Pen:
    """Drawing a piece by hand: boxes with the dark outline, plain fills, single pixels. Coordinates are inclusive."""

    def __init__(self, w, h):
        self.img = Image.new('RGBA', (w, h), (0, 0, 0, 0))
        self.draw = ImageDraw.Draw(self.img)

    def box(self, x0, y0, x1, y1, fill, line=INK):
        self.draw.rectangle((x0, y0, x1, y1), fill=fill, outline=line)

    def fill(self, x0, y0, x1, y1, colour):
        self.draw.rectangle((x0, y0, x1, y1), fill=colour)

    def dot(self, x, y, colour):
        self.img.putpixel((x, y), colour)

    def line(self, points, colour):
        self.draw.line(points, fill=colour)


def wall_fixtures():
    """The back wall the cafe and the study share: three windows and the blackboard."""
    window = scene.obj(0, scene.at(226), 32, scene.at(228))
    return [(None, window, (16, 12)), (None, window, (52, 12)), (None, window, (197, 12)),
            (None, scene.obj(0, scene.at(338), 32, scene.at(340)), (92, 14))]


def shell(floor, wall):
    """The room with nothing standing in it: a floor and a wall from Room_Builder (col, row of each), the daylight
    behind the front door, and the near wall with the back door to the garden."""
    img = Image.new('RGBA', (W, H), (59, 42, 30, 255))
    tile = scene.tiles(scene.floors, floor[0], floor[1], 3, 2)
    for y in range(48, H, tile.height):
        for x in range(0, W, tile.width):
            img.alpha_composite(tile, (x, y))
    band = scene.tiles(scene.walls, wall[0], wall[1], 1, 2)
    for x in range(0, W, scene.T):
        img.alpha_composite(band, (x, 16))
    door = scene.DOOR
    img.paste((205, 226, 222, 255), (door[0] + 1, door[1] + 12, door[0] + 15, door[1] + 32))
    scene.near_wall(img, band)
    return img


def build(name, room, furniture):
    """Draw the furniture into the room, then the chairs, top to bottom, and write assets/sprites/<name>.png."""
    img = room.copy()
    for _name, image, pos in furniture:
        img.alpha_composite(image, pos)
    for (col, row), (x, y) in sorted(scene.CHAIRS, key=lambda c: c[1][1]):
        img.alpha_composite(scene.tiles(scene.interiors, col, row, 1, 2), (x - 8, y - 24))
    img.save(OUT / f'{name}.png')
    return img
