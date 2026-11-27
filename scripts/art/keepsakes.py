"""The keepsakes the staff's own stories leave (plan-1.9.md I1), all drawn here by hand.

Wick: the junk-stall desk lamp, the ink bottle from the first winter, the crooked door sign. Clem: the library card,
the magnifying glass, the slip with the answer. Flint: his apprentice plane, his master's square, the little chair.
Iris: the swatch, her grandmother's indigo cloth, the jar of that blue. Bean: the apprentice notice, the umbrella, the
full notebook. Pica: the piece of type, the inky apron, the shop's seal. Umber: the bald brush, the first coin, the
red stone. Tack: the spare screw, the neighbour's radio, Old Zhou's pocket watch.
The walls of the rooms are full, so these are not hung anywhere: they are shown on the story card and in the notebook.
Writes one strip of 16x16 frames, assets/sprites/keepsakes.png, in the order of KEEPSAKES in
app/shared/staffstories.ts, which the tests check.
Run: py -3.12 scripts/art/keepsakes.py
"""
from pathlib import Path

from PIL import Image

from story import COLORS

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'assets/sprites/keepsakes.png'
SIZE = 16

COLOURS = {
    **COLORS,
    'e': (238, 226, 190, 255),   # cream paper
    'i': (44, 62, 112, 255),     # indigo
}

# In the order of the table in app/shared/staffstories.ts.
SPRITES = {
    'lamp': [
        '....xxxxx....',
        '...xyyyyyx...',
        '..xyyyyyyyx..',
        '.xxxxxxxxxxx.',
        '......xx.....',
        '......xo.....',
        '......xo.....',
        '......xo.....',
        '....xxxxxx...',
        '...xoooooox..',
        '...xxxxxxxx..',
    ],
    'inkpot': [
        '....xxxx....',
        '....xggx....',
        '...xxxxxx...',
        '..xbbbbbbx..',
        '.xbBBbbbbbx.',
        '.xbBbbbbbbx.',
        '.xbbbbbbbbx.',
        '.xbbbbbbbbx.',
        '..xxxxxxxx..',
    ],
    'sign': [
        'xxxxxxxxxxxxxx',
        'xoooooooooooox',
        'xonoonnoooonox',
        'xonnoonooonnox',
        'xonoonnooonoox',
        'xoooooooooooox',
        'xxxxxxxxxxxxxx',
    ],
    'card': [
        'xxxxxxxxxxxx',
        'xeeeeeeeeeex',
        'xekkkkkeeeex',
        'xeeeeeeeeeex',
        'xekkkkkkkkex',
        'xeeeeeeeerex',
        'xekkkkkkrrex',
        'xeeeeeeeeeex',
        'xxxxxxxxxxxx',
    ],
    'magnifier': [
        '...xxxx.....',
        '..xBBBBx....',
        '.xBwBBBBx...',
        '.xBBBBBBx...',
        '.xBBBBBBx...',
        '..xBBBBx....',
        '...xxxxOx...',
        '.......xOx..',
        '........xOx.',
        '.........xOx',
        '..........xx',
    ],
    'slip': [
        '..yyy......',
        'xxxxxxxxxxx',
        'xwwwwwwwwwx',
        'xwkkkkkkkwx',
        'xwwwwwwwwwx',
        'xwkkkkkwwwx',
        'xwwwwwwwwwx',
        'xxxxxxxxxxx',
    ],
    'plane': [
        '.....xx.......',
        '....xOOx......',
        '...xOoOx......',
        '.xxxxxxxxxxxx.',
        'xoooooooooooox',
        'xoooosssooooox',
        'xOOOOOOOOOOOOx',
        '.xxxxxxxxxxxx.',
    ],
    'square': [
        'xxx.........',
        'xsx.........',
        'xsx.........',
        'xsx.........',
        'xsx.........',
        'xsx.........',
        'xsx.........',
        'xsxxxxxxxxxx',
        'xssssssssssx',
        'xxxxxxxxxxxx',
    ],
    'chair': [
        '.xx......',
        '.xox.....',
        '.xox.....',
        '.xox.....',
        '.xoxxxxx.',
        '.xooooox.',
        '.xxxxxxx.',
        '.xx...xx.',
        '.xo...xo.',
        '.xo...xo.',
        '.xx...xx.',
    ],
    'swatch': [
        'xxxxxxxxx',
        'xiiiiiiix',
        'xiiiiiiix',
        'xbbbbbbbx',
        'xbbbbbbbx',
        'xBBBBBBBx',
        'xBBBBBBBx',
        'xwwwwwwwx',
        'xwkkkkwwx',
        'xxxxxxxxx',
    ],
    'cloth': [
        '.xxxxxxxxxxx',
        'xiiiiiiiiiix',
        'xiiwiiiiwiix',
        'xiiiiiiiiiix',
        'xxxxxxxxxxxx',
        'xiiiiiiiiiix',
        'xiwiiiiiwiix',
        'xxxxxxxxxxxx',
    ],
    'vial': [
        '...xxxx...',
        '...xOOx...',
        '..xxxxxx..',
        '.xwwwwwwx.',
        '.xiiiiiix.',
        '.xiiiiiix.',
        '.xiBiiiix.',
        '.xiiiiiix.',
        '..xxxxxx..',
    ],
    'flyer': [
        '....r.....',
        'xxxxRxxxxx',
        'xwwwwwwwwx',
        'xwkkkkkkwx',
        'xwwwwwwwwx',
        'xwkkwkkwwx',
        'xwwkkwkkwx',
        'xwwwwwwwwx',
        'xwkkkkwwwx',
        'xxxxxxxxxx',
    ],
    'umbrella': [
        '....xx....',
        '...x..x...',
        '...x.xx...',
        '....xrx...',
        '...xrrRx..',
        '...xrrRx..',
        '..xrrrRRx.',
        '..xrrrRRx.',
        '.xrrrrRRRx',
        '..xxxxxxx.',
        '.....x....',
    ],
    'pad': [
        'xxxxxxxxx',
        'xuuuuuuux',
        'xuwwwwwux',
        'xuuuuuuux',
        'xuuuuruux',
        'xuuuuruux',
        'xuuuuuuux',
        'xuuuuuuux',
        'xxxxxxxxx',
    ],
    'sort': [
        '.xxxxxx.',
        'xssssssx',
        'xsnnnnsx',
        'xsnssnsx',
        'xsnnnnsx',
        'xssssssx',
        'xSSSSSSx',
        'xSSSSSSx',
        'xSSSSSSx',
        '.xxxxxx.',
    ],
    'apron': [
        '...x....x...',
        '...x....x...',
        '..xxxxxxxx..',
        '..xwwwwwwx..',
        '..xwwnwwwx..',
        'xxxwwwwwwxxx',
        '..xwwwwnwx..',
        '..xwnwwwwx..',
        '..xwwwwwwx..',
        '..xwwwnwwx..',
        '..xxxxxxxx..',
    ],
    'seal': [
        '...xxxx...',
        '..xOooOx..',
        '..xOooOx..',
        '...xOOx...',
        '...xOOx...',
        '..xxxxxx..',
        '.xrrrrrrx.',
        '.xRRRRRRx.',
        '..xxxxxx..',
    ],
    'brush': [
        '.........xx',
        '........xox',
        '.......xox.',
        '......xox..',
        '.....xox...',
        '....xox....',
        '...xsx.....',
        '..xhhx.....',
        '.xhhx......',
        '.xhx.......',
        '..x........',
    ],
    'coin': [
        '..xxxxx..',
        '.xyyyyyx.',
        'xyYyyyyYx',
        'xyyYYYyyx',
        'xyyYyYyyx',
        'xyyYYYyyx',
        'xyYyyyyYx',
        '.xYYYYYx.',
        '..xxxxx..',
    ],
    'pebble': [
        '...xxxxx...',
        '.xxcccccxx.',
        'xcccpcccccx',
        'xcccccccCCx',
        'xccccccCCCx',
        '.xCCCCCCCx.',
        '..xxxxxxx..',
    ],
    'screw': [
        '.xxxxx.',
        'xsssssx',
        'xsxxxsx',
        '.xsssx.',
        '..xsx..',
        '.xSsx..',
        '..xsSx.',
        '.xSsx..',
        '..xsSx.',
        '..xsx..',
        '...x...',
    ],
    'radio': [
        '..........x.',
        '.........x..',
        'xxxxxxxxxxxx',
        'xoooooooooox',
        'xoggggxoyyox',
        'xogkgkxooOox',
        'xoggggxoyyox',
        'xogkgkxooOox',
        'xoooooooooox',
        'xxxxxxxxxxxx',
    ],
    'watch': [
        '....xxx....',
        '....x.x....',
        '...xxxxx...',
        '..xyyyyyx..',
        '.xywwwwwyx.',
        'xywwwnwwwyx',
        'xywwwnwwwyx',
        'xywwwnnnwyx',
        'xywwwwwwwyx',
        '.xywwwwwyx.',
        '..xyyyyyx..',
        '...xxxxx...',
    ],
}


def grid(rows):
    img = Image.new('RGBA', (max(len(r) for r in rows), len(rows)), (0, 0, 0, 0))
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            if ch != '.':
                img.putpixel((x, y), COLOURS[ch])
    return img


def build():
    strip = Image.new('RGBA', (SIZE * len(SPRITES), SIZE), (0, 0, 0, 0))
    for i, rows in enumerate(SPRITES.values()):
        thing = grid(rows)
        # Standing on the bottom of its frame, in the middle.
        strip.paste(thing, (i * SIZE + (SIZE - thing.width) // 2, SIZE - 1 - thing.height))
    strip.save(OUT)


if __name__ == '__main__':
    build()
    print(f'{len(SPRITES)} keepsakes in {OUT.name}')
