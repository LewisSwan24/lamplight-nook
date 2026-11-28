"""What Auntie Olive's and Pip's stories leave in their own shops (plan-1.6.md F4), all drawn here by hand.

In the bakery: her father's bread tin, the jar of starter on a little shelf, the bus ticket that brought her, the
first year's slate book and the plaited ring loaf for Pip's twenty years. In the post office: Pip's old satchel, the
letters tied with Granny Chen's red string, the framed envelope with no number, the scarf from the snow year and his
twenty-year badge. Since plan-2.0.md J3, in the flower shop: Fern's rose cutting in a jar, the stall sign, Granny
Chen's pressed rose, the seeds from home and the opening-day photo; in the bookshop: Uncle Page's first dictionary, the
ticket to the sea, the library card, the old town map and the "Old books bought" sign. Everything hangs on the wall,
clear of the windows, the blackboard, the clock drawn at (180, 14) and the pieces a shop grows (growth.py), so nobody
walks into any of it.
Writes one room-sized overlay per thing, assets/sprites/tale-<id>.png (tale-tin.png, tale-starter.png,
tale-ticket.png, tale-ledger.png, tale-plait.png, tale-satchel.png, tale-bundle.png, tale-envelope.png,
tale-scarf.png, tale-badge.png; since J3 tale-cutting.png, tale-stallsign.png, tale-pressed.png, tale-seeds.png,
tale-snapshot.png, tale-dictionary.png, tale-stub.png, tale-libcard.png, tale-map.png, tale-buysign.png), read by
app/renderer/game/RoomTales.ts.
Run: py -3.12 scripts/art/tales.py
"""
from pathlib import Path

from PIL import Image

from story import COLORS

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'assets/sprites'
ROOM = (320, 180)

COLOURS = {
    **COLORS,
    'e': (238, 226, 190, 255),   # cream paper
    'T': (196, 132, 60, 255),    # crust
    'G': (226, 176, 96, 255),    # crust in the light
    'H': (150, 92, 40, 255),     # crust in shadow
    'q': (236, 228, 204, 255),   # dough
}

SPRITES = {
    # Auntie Olive
    'tin': [
        '......x.......',
        '.....x.x......',
        '....x...x.....',
        'xxxxxxxxxxxxxx',
        'xsssssssssssSx',
        '.xsSSSSSSSSSx.',
        '.xsSSSSSSSSSx.',
        '..xxxxxxxxxx..',
    ],
    'starter': [
        '....xxxxx....',
        '...xwwwwwx...',
        '....xrrrx....',
        '...xBqqqBx...',
        '...xBqqqBx...',
        '...xBqqqBx...',
        '...xBBBBBx...',
        '....xxxxx....',
        'ooooooooooooo',
        'OOOOOOOOOOOOO',
        '.O.........O.',
        '.O.........O.',
    ],
    'ticket': [
        '.....r.....',
        'xxxxxRxxxxx',
        'xeeeeeeeeex',
        'xerreeeeeex',
        'xeeeekkkeex',
        'xeeeeeeeeex',
        'xeekkkkkeex',
        'xxxxxxxxxxx',
    ],
    'ledger': [
        '....x....',
        '...x.x...',
        '..x...x..',
        'xxxxxxxxx',
        'xOuuuuuux',
        'xOueeeeux',
        'xOuuuuuux',
        'xOuuuuuux',
        'xOuuuuuux',
        'xOuuuuuux',
        'xxxxxxxxx',
    ],
    'plait': [
        '......x......',
        '.....x.x.....',
        '....HTTTH....',
        '..HTGTGTGTH..',
        '.HGTH...HTGH.',
        'HTGH.....HGTH',
        'HGTH.....HTGH',
        'HTGH.....HGTH',
        '.HGTH...HTGH.',
        '..HTGTGTGTH..',
        '....HTTTH....',
    ],
    # Pip
    'satchel': [
        '.....x.....',
        '....x.x....',
        '...x...x...',
        '..x.....x..',
        '.x.......x.',
        'xxxxxxxxxxx',
        'xhhhhhhhhhx',
        'xOOOOOOOOOx',
        'xOOOOyOOOOx',
        'xhhhhhhhhhx',
        'xhhhhhhhhhx',
        'xhhhhhhhhhx',
        'xxxxxxxxxxx',
    ],
    'scarf': [
        '...xx....',
        '....x....',
        '.xxxxxxx.',
        '.xrrxrrx.',
        '.xwwxwwx.',
        '.xrrxrrx.',
        '.xrrxrrx.',
        '.xwwxwwx.',
        '.xrrxrrx.',
        '.xrrxxxx.',
        '.xwwx....',
        '.xrrx....',
        '.xxxx....',
        '.x.x.....',
    ],
    'bundle': [
        '....x.....',
        '...xrx....',
        'xxxxrxxxxx',
        'xwwwrwwwwx',
        'xrrrrrrrrx',
        'xeeerweeex',
        'xxxxrxxxxx',
        'xwwwrwwwwx',
        'xxxxxxxxxx',
    ],
    'badge': [
        '.xxxxx.',
        '.xrwrx.',
        '.xrwrx.',
        '.xrwrx.',
        '..xrx..',
        '..xYx..',
        '.xxxxx.',
        'xYyyyYx',
        'xyYYYyx',
        'xyYwYyx',
        'xyYYYyx',
        'xYyyyYx',
        '.xxxxx.',
    ],
    'envelope': [
        'xxxxxxxxx',
        'xOOOOOOOx',
        'xOwwwwwOx',
        'xOkwwwkOx',
        'xOwkwkwOx',
        'xOwwkwwOx',
        'xOOOOOOOx',
        'xxxxxxxxx',
    ],
    # Fern (plan-2.0.md J3)
    'cutting': [
        '....p....',
        '...pPp...',
        '....pL...',
        '....L.L..',
        '...LL....',
        '....L....',
        '..xxLxx..',
        '.xBBLBBx.',
        '.xBwLBBx.',
        '.xBBLBBx.',
        '.xBBBBBx.',
        '..xxxxx..',
        'ooooooooo',
        '.O.....O.',
    ],
    'stallsign': [
        '......xx......',
        '.....x..x.....',
        '....x....x....',
        'xxxxxxxxxxxxxx',
        'xoooooooooooox',
        'xorroorrooLLox',
        'xoooooooooLpox',
        'xorroorroooLox',
        'xoooooooooooox',
        'xxxxxxxxxxxxxx',
    ],
    'pressed': [
        'xxxxxxxxxxx',
        'xOOOOOOOOOx',
        'xOeeeeeeeOx',
        'xOeeePeeeOx',
        'xOeePpPeeOx',
        'xOeeePeeeOx',
        'xOeeeDeeeOx',
        'xOeeDDeeeOx',
        'xOeeeDeeeOx',
        'xOeeeDeeeOx',
        'xOeeeeeeeOx',
        'xOOOOOOOOOx',
        'xxxxxxxxxxx',
    ],
    'seeds': [
        '...rr...',
        'xxxxxxxx',
        'xyyyyyyx',
        'xyLLLLyx',
        'xyLppLyx',
        'xyLLLLyx',
        'xyyyyyyx',
        'xykkkkyx',
        'xyyyyyyx',
        'xykkyyyx',
        'xxxxxxxx',
    ],
    'snapshot': [
        'xxxxxxxxxxxxx',
        'xwwwwwwwwwwwx',
        'xwBBBBBBBBBwx',
        'xwccccccccBwx',
        'xwcOOcccccBwx',
        'xwcOOccnccBwx',
        'xwcOOcLpLcBwx',
        'xwggggLgggBwx',
        'xwwwwwwwwwwwx',
        'xwwwwwwwwwwwx',
        'xxxxxxxxxxxxx',
    ],
    # Uncle Page
    'dictionary': [
        '.xxxxxxx..',
        '.xoooooxw.',
        '.xoxxxoxw.',
        '.xoooooxw.',
        '.xoooooxw.',
        '.xoxxxoxw.',
        '.xoooooxw.',
        '.xoooooxw.',
        '.xxxxxxxw.',
        'oooooooooo',
        'OOOOOOOOOO',
        '.O......O.',
    ],
    'stub': [
        '.....r.....',
        'xxxxxRxxxxx',
        'xBBBBBBBBBx',
        'xBwwBBBkkBx',
        'xBBBBBBBBBx',
        'xBkkkkkBBBx',
        'xBBBBBBBBBx',
        'xxxxxxxxxxx',
    ],
    'libcard': [
        '....x....',
        '...x.x...',
        '..x...x..',
        'xxxxxxxxx',
        'xeeeeeeex',
        'xebbbbbex',
        'xeeeeeeex',
        'xekkkkeex',
        'xekkkeeex',
        'xeeeeeeex',
        'xekkkkkex',
        'xxxxxxxxx',
    ],
    'map': [
        'xxxxxxxxxxxxxxxxx',
        'xyyyyyyyyyyyyyyyx',
        'xyyLLyyyyyyyyyyyx',
        'xyLLLyyycyyyyyyyx',
        'xyyyyyyycyyyLLyyx',
        'xBBBBBBBBBBBBBBBx',
        'xBBBBoBBBBBBBBBBx',
        'xyyyyoyyyyyyyyyyx',
        'xyyyyyyyycccyyyyx',
        'xyyLyyyyycccyyyyx',
        'xyyyyyyyyyyyyyyyx',
        'xxxxxxxxxxxxxxxxx',
    ],
    'buysign': [
        '....x........x....',
        '...x..........x...',
        'xxxxxxxxxxxxxxxxxx',
        'xoooooooooooooooox',
        'xokkokkokkoookkkox',
        'xokoookookoookokox',
        'xokkokkokkoookkkox',
        'xoooooooooooooooox',
        'xxxxxxxxxxxxxxxxxx',
    ],
}

# Where each hangs, top-left, in its shop (bakery-room.png, post-room.png). The bakery's three over the ovens sit
# between the blackboard and the clock; the strip between the second window and the blackboard and the wall right of
# the back door hold the rest, in both shops.
PLACES = {
    'tin': (127, 16), 'starter': (145, 17), 'ticket': (162, 18), 'ledger': (80, 16), 'plait': (305, 16),
    'satchel': (305, 14), 'scarf': (306, 28), 'bundle': (80, 16), 'badge': (81, 28), 'envelope': (169, 18),
    # The flower shop and the bookshop (plan-2.0.md J3): on the plaster below the trim: above the pots shelf, either side of the low bookcase, between the third
    # window and the back door, and right of the door.
    'cutting': (156, 24), 'stallsign': (234, 22), 'pressed': (252, 24), 'seeds': (268, 25), 'snapshot': (305, 24),
    'stub': (123, 26), 'libcard': (169, 22), 'map': (234, 24), 'buysign': (256, 22), 'dictionary': (306, 26),
}


def grid(rows):
    img = Image.new('RGBA', (max(len(r) for r in rows), len(rows)), (0, 0, 0, 0))
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            if ch != '.':
                img.putpixel((x, y), COLOURS[ch])
    return img


def build():
    for name, rows in SPRITES.items():
        overlay = Image.new('RGBA', ROOM, (0, 0, 0, 0))
        overlay.paste(grid(rows), PLACES[name])
        overlay.save(OUT / f'tale-{name}.png')


if __name__ == '__main__':
    build()
    print(f'{len(SPRITES)} tale-*.png written')
