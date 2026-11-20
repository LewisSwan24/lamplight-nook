"""The toolbar's pixel icons, drawn by hand so they look the same on every computer (emoji do not).

Writes assets/sprites/tools.png: one 16x16 cell per icon, in the order of TOOL_ICONS in
app/renderer/ui/tool-icons.ts. Shown at whole multiples only (a fractional scale would make uneven pixels).
Run: python3 scripts/art/tools.py
"""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'assets/sprites/tools.png'
CELL = 16

COLORS = {
    'x': (59, 42, 30),     # ink, the outline
    'p': (251, 244, 230),  # paper
    's': (222, 203, 172),  # paper in shade
    'a': (181, 101, 59),   # the shop's terracotta
    'd': (134, 72, 42),    # terracotta in shade
    'h': (240, 201, 135),  # honey
    'm': (156, 199, 184),  # mint
    'b': (122, 82, 54),    # wood
    'w': (168, 121, 80),   # wood, lit
    'g': (138, 138, 128),  # steel
    'l': (196, 196, 184),  # steel, lit
    'r': (200, 50, 43),    # the red stroke through a muted speaker
}

ICONS = {
    # A commission slip with a torn foot and a stamp in the corner.
    'order': [
        '................',
        '..xxxxxxxxxxxx..',
        '..xppppppppppx..',
        '..xpxxxxxxpaax..',
        '..xppppppppaax..',
        '..xpxxxxxxxxpx..',
        '..xppppppppppx..',
        '..xpxxxxxxxxpx..',
        '..xppppppppppx..',
        '..xpxxxxxppppx..',
        '..xppppppppppx..',
        '..xssssssssssx..',
        '..xpxpxpxpxpxx..',
        '..xx.x.x.x.x....',
        '................',
        '................',
    ],
    # An hourglass with sand running: the work is under way.
    'progress': [
        '................',
        '...xxxxxxxxxx...',
        '...xbwwwwwwbx...',
        '...xxxxxxxxxx...',
        '....xppppppx....',
        '....xhhhhhhx....',
        '.....xhhhhx.....',
        '......xhhx......',
        '......xhhx......',
        '.....xphhpx.....',
        '....xpphhppx....',
        '....xphhhhpx....',
        '...xxxxxxxxxx...',
        '...xbwwwwwwbx...',
        '...xxxxxxxxxx...',
        '................',
    ],
    # The project board: a cork board in a wooden frame with three cards pinned on it.
    'projects': [
        '................',
        '.xxxxxxxxxxxxxx.',
        '.xbbbbbbbbbbbbx.',
        '.xbhhhhhhhhhhbx.',
        '.xbhxxxxhhhhhbx.',
        '.xbhxaaxhxxxxbx.',
        '.xbhxppxhxmmxbx.',
        '.xbhxppxhxppxbx.',
        '.xbhxxxxhxppxbx.',
        '.xbhhhhhhxxxxbx.',
        '.xbhhxxxxxhhhbx.',
        '.xbhhxdpppxhhbx.',
        '.xbhhxxxxxhhhbx.',
        '.xbbbbbbbbbbbbx.',
        '.xxxxxxxxxxxxxx.',
        '................',
    ],
    # The works shelf: two boards with a pot, books and a frame.
    'works': [
        '................',
        '.xxxxxxxxxxxxxx.',
        '.xbbbbbbbbbbbbx.',
        '.xb.......mm.bx.',
        '.xb.xax...mm.bx.',
        '.xb.xax..mmmmbx.',
        '.xb.xax..xddxbx.',
        '.xwwwwwwwwwwwwx.',
        '.xxxxxxxxxxxxxx.',
        '.xb.........hbx.',
        '.xb.xxxxx..xhbx.',
        '.xb.xpppx.xmxbx.',
        '.xb.xxxxx.xmxbx.',
        '.xwwwwwwwwwwwwx.',
        '.xxxxxxxxxxxxxx.',
        '................',
    ],
    # Adeng's notebook: a soft cover, a label, a ribbon.
    'notebook': [
        '................',
        '...xxxxxxxxxx...',
        '..xdaaaaaaaaax..',
        '.xxdaaaaaaaaax..',
        '..xdaxxxxxxaax..',
        '.xxdaxppppxaax..',
        '..xdaxxxxxxaax..',
        '.xxdaaaaaaaaax..',
        '..xdaaaaaaaaax..',
        '.xxdaaaaaaaaax..',
        '..xdaaaaaaaaax..',
        '.xxdaaaaaaaaax..',
        '..xdaaaaaahaax..',
        '...xxxxxxxxhxx..',
        '...........h....',
        '................',
    ],
    # What was said: a speech bubble with two lines of words.
    'captions': [
        '................',
        '................',
        '..xxxxxxxxxxxx..',
        '.xppppppppppppx.',
        '.xpxxxxxxxxxxpx.',
        '.xppppppppppppx.',
        '.xpxxxxxxxppppx.',
        '.xppppppppppppx.',
        '.xpxxxxxxxxxxpx.',
        '.xppppppppppppx.',
        '..xxxpxxxxxxxx..',
        '....xpx.........',
        '....xx..........',
        '................',
        '................',
        '................',
    ],
    # A speaker with two waves.
    'sound': [
        '................',
        '.......xx.......',
        '......xpx...x...',
        '.....xppx....x..',
        '..xxxxppx..x..x.',
        '..xmmxppx...x.x.',
        '..xmmxppx...x.x.',
        '..xmmxppx...x.x.',
        '..xmmxppx...x.x.',
        '..xxxxppx..x..x.',
        '.....xppx....x..',
        '......xpx...x...',
        '.......xx.......',
        '................',
        '................',
        '................',
    ],
    # The same speaker, crossed out.
    'mute': [
        '................',
        '.......xx.......',
        '......xpx.......',
        '.....xppx.......',
        '..xxxxppx.r...r.',
        '..xmmxppx..r.r..',
        '..xmmxppx...r...',
        '..xmmxppx...r...',
        '..xmmxppx..r.r..',
        '..xxxxppx.r...r.',
        '.....xppx.......',
        '......xpx.......',
        '.......xx.......',
        '................',
        '................',
        '................',
    ],
    # A gear: eight teeth around a hole.
    'gear': [
        '................',
        '......xxxx......',
        '..xxx.xllx.xxx..',
        '..xlxxxllxxxlx..',
        '..xxllllllllxx..',
        '...xlggggggllx..',
        '.xxxlgxxxxglxxx.',
        '.xllggx..xggllx.',
        '.xllggx..xggllx.',
        '.xxxlgxxxxglxxx.',
        '...xlggggggllx..',
        '..xxllllllllxx..',
        '..xlxxxllxxxlx..',
        '..xxx.xllx.xxx..',
        '......xxxx......',
        '................',
    ],
    # The street (road-to-1.4.md D1): a shop front with its window and door, a lamp beside it, the pavement below.
    'street': [
        '................',
        '...xxxxxx.......',
        '..xaaaaaax....x.',
        '.xaaaaaaaax..xhx',
        'xxxxxxxxxxxx.xhx',
        '.xppppppppx...x.',
        '.xpxxpxxxpx...x.',
        '.xpxmpxbxpx...x.',
        '.xpxxpxbxpx...x.',
        '.xppppxbxpx...x.',
        '.xppppxbxpx...x.',
        '.xxxxxxxxxx..xxx',
        'ssssssssssssssss',
        '................',
        '................',
        '................',
    ],
}


def main():
    strip = Image.new('RGBA', (CELL * len(ICONS), CELL), (0, 0, 0, 0))
    for i, (name, rows) in enumerate(ICONS.items()):
        assert len(rows) == CELL and all(len(r) == CELL for r in rows), name
        for y, row in enumerate(rows):
            for x, c in enumerate(row):
                if c != '.':
                    strip.putpixel((i * CELL + x, y), (*COLORS[c], 255))
    strip.save(OUT)


if __name__ == '__main__':
    main()
