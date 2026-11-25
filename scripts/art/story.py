"""What the neighbours' stories leave on the street (road-to-1.4.md D4), all drawn here by hand.

Old Zhou's bell, toolbox, pump and number plate at the workshop and his mended bicycle by the cafe; Granny Chen's
cushion, millet, roses, birdhouse and stool round the bench; Xiaohe's books, notice, cactus, lending shelf and cap at
the study. Plus the bubble over a neighbour who has a chapter waiting, and where each of the five waits: Auntie Olive
and Pip at their own doors, though what their stories leave hangs inside their shops (tales.py).
Everything stands against the fronts, clear of the pavement people walk on and of the cart's spot (x 674..712), where
the festivals stand (decor.py). Kept out of town.json, which town.py rewrites whole.
Writes assets/sprites/town-story.png and town-story.json, read by app/renderer/game/TownStories.ts.
Run: py -3.12 scripts/art/story.py
"""
import json
import math
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'assets/sprites'

COLORS = {
    'x': (52, 44, 48, 255),      # outline
    's': (196, 200, 208, 255),   # chrome
    'S': (138, 144, 156, 255),   # chrome in shadow
    'w': (250, 248, 240, 255),   # white
    'r': (196, 64, 46, 255),     # red
    'R': (150, 44, 34, 255),     # dark red
    'g': (120, 124, 130, 255),   # grey
    'b': (74, 112, 168, 255),    # blue
    'B': (112, 150, 200, 255),   # light blue
    'y': (232, 204, 112, 255),   # pale yellow
    'Y': (196, 150, 52, 255),    # millet
    'k': (60, 72, 60, 255),      # dark green ink
    'p': (222, 120, 132, 255),   # pink
    'P': (176, 74, 92, 255),     # deep pink
    'L': (98, 160, 72, 255),     # leaf
    'D': (58, 110, 52, 255),     # dark leaf
    'c': (186, 98, 62, 255),     # terracotta
    'C': (140, 70, 46, 255),     # terracotta in shadow
    'o': (164, 112, 64, 255),    # wood
    'O': (118, 78, 44, 255),     # dark wood
    'h': (92, 62, 40, 255),      # saddle brown
    'u': (82, 132, 104, 255),    # book green
    'v': (110, 86, 150, 255),    # book violet
    'n': (36, 36, 40, 255),      # black cap
}

SPRITES = {
    # Old Zhou
    'bell': [
        '...x...',
        '..xxx..',
        '.xsssx.',
        'xsswssx',
        'xSsssSx',
        'xxxxxxx',
    ],
    'toolbox': [
        '....xxxx....',
        '....x..x....',
        'xxxxxxxxxxxx',
        'xrrrrrrrrrrx',
        'xRRRRggRRRRx',
        'xrrrrrrrrrrx',
        'xrrrrrrrrrrx',
        'xxxxxxxxxxxx',
    ],
    'pump': [
        'xxxxx',
        '..x..',
        '..s..',
        '..s..',
        '.xxx.',
        '.xBx.',
        '.xbx.',
        '.xbx.',
        '.xbx.',
        '.xbx.',
        '.xbx.',
        '.xbx.',
        '.xbx.',
        'xxxxx',
        'x...x',
    ],
    'plate': [
        'xxxxxxxxxx',
        'xyyyyyyyyx',
        'xykykkykyx',
        'xykyykkkyx',
        'xyyyyyyyyx',
        'xxxxxxxxxx',
    ],
    # Granny Chen
    'cushion': [
        '.xxxxxxxxxx.',
        'xpwpPpwpPpwx',
        'xPpPwpPpwpPx',
        '.xxxxxxxxxx.',
    ],
    'millet': [
        '.YyYyY.',
        'xwwwwwx',
        '.xxxxx.',
    ],
    'rose': [
        '.pP..rR.',
        'pPPLLrRr',
        '.pDLLDr.',
        '.LDLDLL.',
        '..LDLD..',
        '...DL...',
        'xxxxxxxx',
        'xccccccx',
        '.xcccCx.',
        '.xcccCx.',
        '.xcccCx.',
        '..xxxx..',
    ],
    'birdhouse': [
        '....x....',
        '...xRx...',
        '..xRRRx..',
        '.xRRRRRx.',
        'xxxxxxxxx',
        '.xoooOox.',
        '.xooxOox.',
        '.xoxxxOx.',
        '.xooxOox.',
        '.xoooOox.',
        '.xxxxxxx.',
        '....x....',
    ],
    'stool': [
        'xxxxxxxxxx',
        'xoooooooox',
        'xxxxxxxxxx',
        '.xO....Ox.',
        '.xO....Ox.',
        '.xxxxxxxx.',
        '.xO....Ox.',
    ],
    # Xiaohe
    'books': [
        '.xxxxxx.',
        '.xbbbbx.',
        'xxxxxxxx',
        'xuuuuuux',
        'xxxxxxxx',
        '.xrrrrrx',
        '.xxxxxxx',
        'xvvvvvvx',
        'xwwwwwwx',
        'xxxxxxxx',
    ],
    'notice': [
        '...r...',
        'xxxRxxx',
        'xwwwwwx',
        'xwkkkwx',
        'xwwwwwx',
        'xwkkwwx',
        'xwkkkwx',
        'xwwwwwx',
        'xxxxxxx',
    ],
    'cactus': [
        '..L..',
        'L.L.L',
        'LDLDL',
        '.DLD.',
        'xxxxx',
        '.xcx.',
        '.xCx.',
        '.xxx.',
    ],
    'bookshelf': [
        '.......xx.......',
        '.....xxRRxx.....',
        '...xxRRRRRRxx...',
        '.xxRRRRRRRRRRxx.',
        'xxxxxxxxxxxxxxxx',
        'xOooooooooooooOx',
        'xOrbuvbryuvbrbOx',
        'xOrbuvbryuvbrbOx',
        'xOrbuvbryuvbrbOx',
        'xOooooooooooooOx',
        'xOvuyrbbvuyrbuOx',
        'xOvuyrbbvuyrbuOx',
        'xOvuyrbbvuyrbuOx',
        'xOooooooooooooOx',
        'xOOOOOOOOOOOOOOx',
        'xxxxxxxxxxxxxxxx',
        '.xO..........Ox.',
        '.xx..........xx.',
    ],
    'cap': [
        '...xxx...',
        'xnnnnnnnx',
        '.xxnnnxyx',
        '...xxx.y.',
    ],
    # Over a neighbour with a chapter waiting.
    'bubble': [
        '.xxxxxxxxx.',
        'xwwwwwwwwwx',
        'xwwwwwwwwwx',
        'xwxwwxwwxwx',
        'xwwwwwwwwwx',
        '.xxxxwwxxx.',
        '.....xwx...',
        '......x....',
    ],
}


def grid(rows):
    img = Image.new('RGBA', (max(len(r) for r in rows), len(rows)), (0, 0, 0, 0))
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            if ch != '.':
                img.putpixel((x, y), COLORS[ch])
    return img


def line(img, a, b, colour):
    (x0, y0), (x1, y1) = a, b
    dx, dy = abs(x1 - x0), -abs(y1 - y0)
    sx, sy = (1 if x0 < x1 else -1), (1 if y0 < y1 else -1)
    err = dx + dy
    while True:
        img.putpixel((x0, y0), colour)
        if (x0, y0) == (x1, y1):
            return
        e2 = 2 * err
        if e2 >= dy:
            err += dy
            x0 += sx
        if e2 <= dx:
            err += dx
            y0 += sy


def wheel(img, cx, cy, r):
    for a in range(0, 360, 4):

        t = math.radians(a)
        img.putpixel((round(cx + r * math.cos(t)), round(cy + r * math.sin(t))), COLORS['x'])
    for dx, dy in ((r - 2, 0), (-(r - 2), 0), (0, r - 2), (0, -(r - 2)), (3, 3), (-3, -3), (3, -3), (-3, 3)):
        line(img, (cx, cy), (cx + dx, cy + dy), COLORS['S'])
    img.putpixel((cx, cy), COLORS['s'])


def bicycle():
    """An old black roadster, 28-inch wheels, a brown saddle and a chrome bell, leaning on its stand."""
    img = Image.new('RGBA', (26, 16), (0, 0, 0, 0))
    back, front, r = (6, 9), (19, 9), 6
    wheel(img, *back, r)
    wheel(img, *front, r)
    frame = COLORS['x']
    crank, seat, head = (12, 10), (10, 3), (17, 3)
    for a, b in ((crank, seat), (seat, head), (crank, (17, 5)), (crank, back), (seat, back), (head, front)):
        line(img, a, b, frame)
    line(img, (16, 1), (19, 1), COLORS['S'])  # handlebar
    line(img, (17, 1), (17, 3), COLORS['S'])
    img.putpixel((19, 0), COLORS['s'])        # the bell
    line(img, (8, 2), (11, 2), COLORS['h'])   # saddle
    line(img, (10, 3), (10, 2), COLORS['h'])
    line(img, (11, 10), (13, 10), COLORS['S'])  # pedal
    line(img, (8, 7), (8, 15), COLORS['g'])     # the stand, down to the ground
    return img


# Where each thing stands on the street: top-left. Against the fronts, never below the kerb + 4.
PLACES = {
    'bell': (641, 94), 'toolbox': (589, 118), 'pump': (643, 111), 'plate': (612, 84), 'bicycle': (66, 110),
    'cushion': (274, 124), 'millet': (288, 125), 'rose': (263, 114), 'birdhouse': (285, 96), 'stool': (298, 121),
    'books': (203, 116), 'notice': (203, 98), 'cactus': (190, 101), 'bookshelf': (246, 108), 'cap': (250, 104),
}
# Where each neighbour's feet are while they wait, and how they stand.
WAITS = {
    'mechanic': {'x': 625, 'y': 131, 'anim': 'idle', 'facing': 'down'},
    'granny': {'x': 283, 'y': 133, 'anim': 'sit', 'facing': 'left'},
    'student': {'x': 238, 'y': 131, 'anim': 'read', 'facing': 'down'},
    # Auntie Olive and Pip (plan-1.6.md F4) step out of their own doors; what they leave hangs inside (tales.py).
    'baker': {'x': 900, 'y': 131, 'anim': 'idle', 'facing': 'down'},
    'postman': {'x': 1044, 'y': 131, 'anim': 'idle', 'facing': 'down'},
}


def build():
    pieces = {name: grid(rows) for name, rows in SPRITES.items()}
    pieces['bicycle'] = bicycle()
    sheet = Image.new('RGBA', (sum(p.width + 1 for p in pieces.values()), max(p.height for p in pieces.values())), (0, 0, 0, 0))
    parts, bubble, sx = [], None, 0
    for name, img in pieces.items():
        sheet.paste(img, (sx, 0))
        cut = {'sx': sx, 'sy': 0, 'w': img.width, 'h': img.height}
        if name == 'bubble':
            bubble = cut
        else:
            x, y = PLACES[name]
            parts.append({'id': name, **cut, 'x': x, 'y': y})
        sx += img.width + 1
    sheet.save(OUT / 'town-story.png')
    (OUT / 'town-story.json').write_text(json.dumps({'parts': parts, 'bubble': bubble, 'waits': WAITS}, indent=1) + '\n', encoding='utf-8')


if __name__ == '__main__':
    build()
    print('town-story.png and town-story.json written')
