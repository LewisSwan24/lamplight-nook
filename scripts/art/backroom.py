"""The back room and the post (road-to-1.3.md C8): a filing cabinet beside the bookcase, a letter holder on the wall by
the front door, and a small outbox basket on the counter. Drawn by hand, like the growth pieces the pack has nothing
small enough for (growth.py), in the same colours and outline.

scene.py and study.py paint them into cafe.png and study.png. The cabinet is a piece of furniture of its own
(pieces.py), the holder stays on the wall, and the basket becomes part of the counter. Where each sits is shared with
the game (app/renderer/game/layout.ts, CABINET, MAILSLOT and OUTBOX).
"""
from PIL import Image

from growth import COLORS

CABINET = [
    'xxxxxxxxxxxxxx',
    'xssssssssssssx',
    'xssssssssssssx',
    'xxxxxxxxxxxxxx',
    'xoooooooooooox',
    'xooooowwwoooox',
    'xoooooooooooox',
    'xooooxllxoooox',
    'xoooooooooooox',
    'xkkkkkkkkkkkkx',
    'xoooooooooooox',
    'xooooowwwoooox',
    'xoooooooooooox',
    'xooooxllxoooox',
    'xoooooooooooox',
    'xkkkkkkkkkkkkx',
    'xoooooooooooox',
    'xooooowwwoooox',
    'xoooooooooooox',
    'xooooxllxoooox',
    'xoooooooooooox',
    'xxxxxxxxxxxxxx',
    '.xx........xx.',
]

MAILSLOT = [
    'xxxxxxxxxxxx',
    'xkkkkkkkkkkx',
    'xkkkkkkkkkkx',
    'xkxxxxxxxxkx',
    'xkxooooooxkx',
    'xkxooooooxkx',
    'xkxoGGGGoxkx',
    'xkxooooooxkx',
    'xkxooooooxkx',
    'xkxxxxxxxxkx',
    'xkkkkkkkkkkx',
    'xxxxxxxxxxxx',
]

OUTBOX = [
    '.xxxxxx.',
    'xsososox',
    'xosososx',
    'xsososox',
    '.xxxxxx.',
]

# Top-left of each on the canvas. The cabinet and the holder sit the same in both scenes; the basket sits on the
# counter in the cafe and on the right-hand desk in the study, clear of the cup, the lamp and the globe.
CABINET_AT = (58, 98)
MAILSLOT_AT = (306, 31)
OUTBOX_AT = {'cafe': (262, 79), 'study': (256, 80)}


def drawn(rows):
    img = Image.new('RGBA', (len(rows[0]), len(rows)), (0, 0, 0, 0))
    for y, row in enumerate(rows):
        assert len(row) == len(rows[0]), row
        for x, c in enumerate(row):
            if c != '.':
                img.putpixel((x, y), COLORS[c])
    return img


def cabinet_box():
    img = drawn(CABINET)
    return (CABINET_AT[0], CABINET_AT[1], CABINET_AT[0] + img.width, CABINET_AT[1] + img.height)


def paint(img, scene):
    """The holder on the wall, the cabinet on the floor, the basket on the counter (drawn after the counter)."""
    img.alpha_composite(drawn(MAILSLOT), MAILSLOT_AT)
    img.alpha_composite(drawn(CABINET), CABINET_AT)
    img.alpha_composite(drawn(OUTBOX), OUTBOX_AT[scene])
