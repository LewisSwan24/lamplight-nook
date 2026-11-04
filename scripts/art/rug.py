"""The cafe's rug: painted around the big table so the same shows on every side, and the top edge of the bench.

The pack's rug is 60 wide and sat to the left of a 58 wide table. This paints the same pattern at the size the table
needs, on the floor only: furniture and its shadows stay on top. scene.py calls patch() when it builds the room; run
on its own (python3 scripts/art/rug.py) it repaints the existing cafe.png. Run furnish.py afterwards, for the colours.
"""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
CAFE = ROOT / 'assets/sprites/cafe.png'

# The table and bench reach from x 124 to 181 and from y 72 to 127; the rug shows 8 pixels around them.
LEFT, TOP, RIGHT, BOTTOM = 116, 64, 189, 135
# Outline, border, band, inner line, middle: the pack's pattern, ring by ring from the edge inwards.
OUTLINE, GOLD, RED = (58, 58, 80), (195, 170, 87), (167, 78, 71)
RINGS = [OUTLINE, GOLD, GOLD, RED, RED, RED, RED, RED, GOLD, GOLD, GOLD, GOLD]

# Colours of what stands on the floor here: the table, the bench, the chair and their shadow.
FURNITURE = {(0xe0, 0xb8, 0x70), (0xc7, 0x8c, 0x59), (0xf1, 0xce, 0x8e), (0xe5, 0xbf, 0x7a), (0xd5, 0xaa, 0x68),
             (0xa7, 0x97, 0x96), (0xb5, 0x75, 0x4d), (0x46, 0x46, 0x5e), (0x56, 0x59, 0x72), (0xca, 0x88, 0x54),
             (0xab, 0x4a, 0x36), (0xa8, 0x5f, 0x46), (0xa1, 0x3a, 0x30), (0xb3, 0x5e, 0x3f), (0xd9, 0xa1, 0x6a)}

# The old rug's outline is the same colour as the furniture's, so it is known by where it was.
OLD_LEFT, OLD_TOP, OLD_RIGHT, OLD_BOTTOM = 116, 76, 175, 115
TABLE_LEFT, TABLE_RIGHT = 124, 181
BENCH_TOP = 111


def old_outline(x, y):
    if OLD_TOP <= y <= OLD_BOTTOM and x == OLD_LEFT:
        return True
    if x < TABLE_LEFT and y in (OLD_TOP, OLD_BOTTOM):
        return True
    return x == OLD_RIGHT and 105 <= y <= 111  # between the table and the bench, the only place it showed


def is_floor(colour, x, y):
    if colour == OUTLINE:
        return old_outline(x, y) or x in (LEFT, RIGHT) or y in (TOP, BOTTOM)
    return colour not in FURNITURE


def patch(img):
    for y in range(TOP, BOTTOM + 1):
        for x in range(LEFT, RIGHT + 1):
            if is_floor(img.getpixel((x, y))[:3], x, y):
                ring = min(x - LEFT, RIGHT - x, y - TOP, BOTTOM - y)
                img.putpixel((x, y), (RINGS[ring] if ring < len(RINGS) else RED) + (255,))
    # The bench was cut from the sheet without its top edge, and read as a table broken in two.
    for x in range(TABLE_LEFT + 1, TABLE_RIGHT):
        img.putpixel((x, BENCH_TOP), OUTLINE + (255,))
    return img


if __name__ == '__main__':
    patch(Image.open(CAFE).convert('RGBA')).save(CAFE)
    print('repainted the rug in', CAFE.relative_to(ROOT))
