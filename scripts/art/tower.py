"""Draw the old clock tower on the river street (plan-2.0.md J6) in each look it has as it is mended over the year.

All by hand, nothing from the pack (plan-2.0.md Q-J7). Six looks, each built on the one before:
  stopped   as it stands when 2.0 opens: the roof half fallen in, a cracked face with no hands, the door boarded up
  scaffold  wooden scaffolding up both sides
  roof      a whole new roof of slates, still in its scaffolding
  face      the scaffolding down and a clean clock face with its hours marked
  hands     the hands on (the street draws them, keeping the time), the bell hung, the door mended, the ivy cut back
  lit       a lamp by the door and flowers either side; the bell strikes the hour
and a seventh frame, `lights`: a string of bulbs along the roof and the belfry, the lamp's glow, laid over the lit tower
after dark.

Writes, into assets/sprites/:
  tower.png   the seven frames side by side, each as big as the tower's plot (river.json `tower`)
  tower.json  the frame size, the frames' names in order, and where the clock face is, for the hands
It replaces river.py's river-tower.png (J1), which was the first look alone; river.py now only leaves the tower its plot,
as big as W and H here.
Run: py -3.12 scripts/art/tower.py
"""
import json
from pathlib import Path

from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parents[2] / 'assets' / 'sprites'
# As tall as from the top of the canvas to just above the kerb (town.py KERB - 2), as river.py has always drawn it.
W, H = 56, 122
STAGES = ['stopped', 'scaffold', 'roof', 'face', 'hands', 'lit']
BODY_TOP = 40
FACE = {'x': 27, 'y': 60, 'r': 11}

STONE = (150, 146, 150, 255)
MORTAR = (118, 114, 120, 255)
STONE_EDGE = (96, 92, 100, 255)
BASE = (120, 116, 122, 255)
BASE_TOP = (176, 172, 176, 255)
OLD_WOOD = (104, 72, 48, 255)
OLD_WOOD_DARK = (84, 56, 38, 255)
BOARD = (164, 128, 88, 255)
BEAM = (108, 76, 52, 255)
NEW_WOOD = (140, 98, 60, 255)
NEW_WOOD_LIGHT = (170, 126, 82, 255)
POLE = (176, 140, 96, 255)
POLE_DARK = (124, 92, 60, 255)
RIM = (84, 80, 88, 255)
OLD_FACE = (214, 206, 184, 255)
CRACK = (132, 124, 112, 255)
NEW_FACE = (236, 228, 204, 255)
SLATE = (70, 74, 92, 255)
SLATE_LIGHT = (90, 96, 116, 255)
NEW_SLATE = (64, 76, 104, 255)
NEW_SLATE_LIGHT = (88, 104, 136, 255)
IVY = (74, 120, 70, 255)
IVY_LIGHT = (98, 146, 84, 255)
BRONZE = (176, 132, 64, 255)
BRONZE_DARK = (122, 88, 40, 255)
IRON = (52, 50, 58, 255)
LAMP = (250, 214, 120, 255)
POT = (176, 96, 64, 255)
BULB = (255, 222, 140, 255)
GLOW = (255, 206, 120, 90)


def body(img, d, ivy):
    """The stone body, its courses every six rows with the blocks offset row to row, the wider base, and ivy up the left."""
    d.rectangle((8, BODY_TOP, 47, H - 1), fill=STONE)
    for i, y in enumerate(range(BODY_TOP + 5, H, 6)):
        d.line((8, y, 47, y), fill=MORTAR)
        for x in range(8 + (6 if i % 2 else 0), 48, 12):
            d.line((x, y - 5, x, y - 1), fill=MORTAR)
    d.rectangle((8, BODY_TOP, 8, H - 1), fill=STONE_EDGE)
    d.rectangle((47, BODY_TOP, 47, H - 1), fill=STONE_EDGE)
    d.rectangle((4, H - 14, 51, H - 1), fill=BASE)
    d.line((4, H - 14, 51, H - 14), fill=BASE_TOP)
    if ivy == 'none':
        return
    # Cut back, only a little is left low down by the base.
    top = BODY_TOP + 6 if ivy == 'full' else H - 34
    for y in range(top, H - 14, 2 if ivy == 'full' else 3):
        x = 9 + ((y * 5) % 4)
        img.putpixel((x, y), IVY)
        if y % 6 == 0:
            img.putpixel((x + 1, y + 1), IVY_LIGHT)


def door(d, mended):
    """The arched door: boarded up across the old planks, or new planks with an iron ring and a keystone over the arch."""
    wood, line = (NEW_WOOD, NEW_WOOD_LIGHT) if mended else (OLD_WOOD, OLD_WOOD_DARK)
    d.rectangle((22, H - 24, 33, H - 1), fill=wood)
    d.pieslice((22, H - 30, 33, H - 19), 180, 360, fill=wood)
    for x in (25, 28, 31):
        d.line((x, H - 27, x, H - 1), fill=line)
    if mended:
        d.rectangle((27, H - 32, 28, H - 30), fill=BASE_TOP)
        d.point((30, H - 12), fill=IRON)
        d.point((31, H - 11), fill=IRON)
        d.point((30, H - 10), fill=IRON)
        return
    d.line((21, H - 22, 34, H - 12), fill=BOARD, width=2)
    d.line((21, H - 12, 34, H - 22), fill=BOARD, width=2)


def face(d, clean, hub):
    """The clock face: old and cracked with four marks, or clean with all twelve hours marked; the hands' hub once on."""
    cx, cy, r = FACE['x'], FACE['y'], FACE['r']
    d.ellipse((cx - r - 2, cy - r - 2, cx + r + 2, cy + r + 2), fill=RIM)
    d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=NEW_FACE if clean else OLD_FACE)
    if not clean:
        for dx, dy in ((0, -r + 2), (r - 2, 0), (0, r - 2), (-r + 2, 0)):
            d.point((cx + dx, cy + dy), fill=RIM)
        d.line((cx - 7, cy - 6, cx - 1, cy + 1, cx + 2, cy - 1, cx + 8, cy + 6), fill=CRACK)
        return
    # Twelve marks, a little in from the rim; the quarters two pixels long.
    ring =[(0, -9), (4, -8), (8, -4), (9, 0), (8, 4), (4, 8), (0, 9), (-4, 8), (-8, 4), (-9, 0), (-8, -4), (-4, -8)]
    for i, (dx, dy) in enumerate(ring):
        d.point((cx + dx, cy + dy), fill=RIM)
        if i % 3 == 0:
            ix, iy = (0 if dx == 0 else (1 if dx < 0 else -1)), (0 if dy == 0 else (1 if dy < 0 else -1))
            d.point((cx + dx + ix, cy + dy + iy), fill=RIM)
    if hub:
        d.rectangle((cx, cy, cx + 1, cy + 1), fill=IRON)


def belfry(d, bell):
    """
    The open wooden belfry: at first bare posts with cross braces; once the bell is hung, the middle post gives way to a
    beam across with the bell under it.
    """
    if bell:
        for x in (10, 44):
            d.rectangle((x, 14, x + 1, BODY_TOP), fill=NEW_WOOD)
        d.rectangle((10, 16, 45, 17), fill=NEW_WOOD)
        d.line((27, 18, 28, 18), fill=IRON)
        # The bell: a crown, flaring to the lip, a darker mouth and the clapper showing below.
        d.rectangle((25, 19, 30, 20), fill=BRONZE)
        d.polygon([(24, 21), (31, 21), (33, 30), (22, 30)], fill=BRONZE)
        d.line((22, 31, 33, 31), fill=BRONZE_DARK)
        d.line((26, 22, 25, 29), fill=(206, 166, 96, 255))
        d.rectangle((27, 32, 28, 33), fill=BRONZE_DARK)
    else:
        for x in (10, 27, 44):
            d.rectangle((x, 14, x + 1, BODY_TOP), fill=BEAM)
        d.line((11, 16, 27, BODY_TOP - 2), fill=BEAM)
        d.line((45, 16, 28, BODY_TOP - 2), fill=BEAM)
    d.rectangle((6, BODY_TOP - 2, 49, BODY_TOP), fill=STONE_EDGE)


def roof(img, d, whole):
    """The belfry's roof: what is left of it (the left slope with slates missing, the ridge beam bare), or a whole new one."""
    if not whole:
        for y in range(2, 15):
            left = 27 - round(y * 1.6)
            for x in range(left, 28):
                if (x + y) % 7 == 3 and y > 6:
                    continue
                img.putpixel((x, y), SLATE if (x + 2 * y) % 5 else SLATE_LIGHT)
        d.line((28, 2, 48, 14), fill=BEAM)
        d.line((27, 1, 28, 1), fill=BEAM)
        return
    for y in range(2, 15):
        span = round(y * 1.6)
        for x in range(27 - span, 29 + span):
            img.putpixel((x, y), NEW_SLATE if (x + 2 * y) % 5 else NEW_SLATE_LIGHT)
    d.line((4, 14, 51, 14), fill=IRON)
    d.rectangle((27, 0, 28, 1), fill=IRON)


def scaffold(d):
    """Poles up both sides with planks across, lashed at the crossings, and a ladder up to the face."""
    for x in (1, 53):
        d.rectangle((x, 6, x + 1, H - 1), fill=POLE)
        d.line((x + 1, 6, x + 1, H - 1), fill=POLE_DARK)
    for y in (30, 80, 104):
        d.rectangle((0, y, W - 1, y + 1), fill=POLE)
        d.line((0, y + 2, W - 1, y + 2), fill=POLE_DARK)
        for x in (1, 53):
            d.point((x, y - 1), fill=POLE_DARK)
    for y in range(83, 104, 4):
        d.line((40, y, 44, y), fill=POLE_DARK)
    d.line((40, 82, 40, 103), fill=POLE)
    d.line((44, 82, 44, 103), fill=POLE)
    # A bucket and a coil of rope left on the planks.
    d.rectangle((12, 76, 15, 79), fill=IRON)
    d.rectangle((34, 101, 37, 103), fill=BOARD)


def finishing(img, d):
    """Mended and in use: a lamp on a bracket by the door, and a pot of flowers on the base either side of it."""
    d.line((34, H - 30, 37, H - 30), fill=IRON)
    d.rectangle((36, H - 29, 38, H - 25), fill=IRON)
    d.point((37, H - 28), fill=LAMP)
    d.point((37, H - 27), fill=LAMP)
    for left in (13, 38):
        d.rectangle((left, H - 5, left + 4, H - 1), fill=POT)
        d.line((left, H - 5, left + 4, H - 5), fill=(204, 124, 84, 255))
        for i, x in enumerate(range(left, left + 5)):
            img.putpixel((x, H - 7 - (i % 2)), (206, 72, 72, 255) if i % 2 else (238, 196, 72, 255))
            img.putpixel((x, H - 6), IVY)


def lights():
    """Bulbs along the roof's eaves and the belfry's ledge, and the lamp by the door glowing: only what shines after dark."""
    img = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    for y in range(4, 15, 3):
        span = round(y * 1.6)
        img.putpixel((27 - span, y + 1), BULB)
        img.putpixel((28 + span, y + 1), BULB)
    for x in range(8, 49, 5):
        img.putpixel((x, BODY_TOP + 1), BULB)
    d.ellipse((34, H - 31, 40, H - 23), fill=GLOW)
    d.point((37, H - 28), fill=(255, 240, 196, 255))
    d.point((37, H - 27), fill=(255, 240, 196, 255))
    return img


def draw(stage):
    """The tower in one look; each look keeps what the ones before it mended."""
    step = STAGES.index(stage)
    img = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    body(img, d, 'full' if step < STAGES.index('hands') else 'trim')
    door(d, mended=step >= STAGES.index('hands'))
    face(d, clean=step >= STAGES.index('face'), hub=step >= STAGES.index('hands'))
    belfry(d, bell=step >= STAGES.index('hands'))
    roof(img, d, whole=step >= STAGES.index('roof'))
    if stage in ('scaffold', 'roof'):
        scaffold(d)
    if stage == 'lit':
        finishing(img, d)
    return img


def build():
    frames = [draw(s) for s in STAGES] + [lights()]
    sheet = Image.new('RGBA', (W * len(frames), H), (0, 0, 0, 0))
    for i, frame in enumerate(frames):
        sheet.paste(frame, (i * W, 0))
    sheet.save(OUT / 'tower.png')
    data = {'w': W, 'h': H, 'stages': STAGES + ['lights'], 'face': FACE}
    (OUT / 'tower.json').write_text(json.dumps(data, indent=2) + '\n', encoding='utf-8')
    print(f'tower.png {sheet.width}x{sheet.height}, {len(frames)} frames')


if __name__ == '__main__':
    build()
