"""What the shop gathers as commissions get done together (plan.md R2), and the icons on the works shelf.

Growth pieces come from LimeZu Modern Interiors singles (assets/vendor/, not in the repo); each becomes a
transparent 320x180 overlay laid over cafe.png by the game, like the holiday decorations (decor.py).
The works-shelf icons are drawn here by hand.
Writes assets/sprites/grow-<id>.png and assets/sprites/works.png.
Run: python3 scripts/art/growth.py
"""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SINGLES = ROOT / 'assets/vendor/1_Interiors/16x16/Theme_Sorter_Shadowless_Singles'
OUT = ROOT / 'assets/sprites'
W, H = 320, 180


def single(folder, name):
    img = Image.open(SINGLES / folder / name).convert('RGBA')
    return img.crop(img.getbbox())


ART = '7_Art_Singles_Shadowless'
LIVING = '2_Living_Room_Singles_Shadowless'
MUSIC = '6_Music_and_Sport_Shadowless'
CLASSROOM = '5_Classroom_and_Library_Singles_Shadowless'

# Drawn by hand where the pack has nothing small enough. x outline, G gold; the rest as COLORS below.
DRAWN = {
    'calendar': ['xxxxxxxxxxxx', 'xrrrrrrrrrrx', 'xrrwrrrrwrrx', 'xxxxxxxxxxxx', 'xwwwwwwwwwwx', 'xwlwlwlwlwwx',
                 'xwwwwwwwwwwx', 'xwlwlwrwlwwx', 'xwwwwwwwwwwx', 'xwlwlwlwwwwx', 'xwwwwwwwwwwx', 'xxxxxxxxxxxx'],
    'letters': ['xxxxxxxxxxxxxx', 'xoooooooooooox', 'xowwwwwoooooox', 'xowlllwoppppox', 'xowwwwwoprrpox', 'xoooooooppppox',
                'xooooyyyyyooox', 'xooooylllyooox', 'xooooyyyyyooox', 'xoooooooooooox', 'xxxxxxxxxxxxxx'],
    'album': ['xxxxxxxxxxxxxx', 'xwwwwwwxwwwwwx', 'xwuuuuwxwgggwx', 'xwuyuuwxwgsgwx', 'xwuuuuwxwgggwx', 'xwwwwwwxwwwwwx',
              'xbbbbbbxbbbbbx', 'xxxxxxxxxxxxxx'],
    'ledger': ['xxxxxxxxxxxx', 'xgggggggggwx', 'xgyyyyyyggwx', 'xgggggggggwx', 'xgggggggggwx', 'xgggggggggwx',
               'xwwwwwwwwwwx', 'xxxxxxxxxxxx'],
    'monitor': ['xxxxxxxxxxxxxx', 'xddddddddddddx', 'xdxxxxxxxxxxdx', 'xdxuuuuuuuuxdx', 'xdxuwwwuuuuxdx', 'xdxuuuuwwuuxdx',
                'xdxuwwuuuuuxdx', 'xdxxxxxxxxxxdx', 'xddddddddddddx', 'xxxxxxxxxxxxxx', '....xddddx....', '..xxxxxxxxxx..',
                '..xddddddddx..', '..xxxxxxxxxx..'],
    'books': ['..xxxxxxxxxx..', '..xrrrrrrrrx..', '..xrryyrrrwx..', '.xxxxxxxxxxxx.', '.xuuuuuuuuuux.', '.xuyyuuuuuuwx.',
              'xxxxxxxxxxxxxx', 'xggggggggggggx', 'xgggyyggggggwx', 'xxxxxxxxxxxxxx'],
    'star': ['xxxxxxxxxxxx', 'xbbbbbbbbbbx', 'xbuuuuGuuubx', 'xbuuuGGGuubx', 'xbGGGGGGGGbx', 'xbuGGGGGGubx', 'xbuuGGGGuubx',
             'xbuGGuuGGubx', 'xbGuuuuuuGbx', 'xbbbbbbbbbbx', 'xxxxxxxxxxxx'],
    'briefcase': ['....xxxxx....', '....x...x....', 'xxxxxxxxxxxxx', 'xbbbbbbbbbbbx', 'xbbbbbbbbbbbx', 'xxxxxxGxxxxxx',
                  'xbbbbbGbbbbbx', 'xbbbbbbbbbbbx', 'xbbbbbbbbbbbx', 'xxxxxxxxxxxxx'],
    'readinglamp': ['..xxxxx..', '.xgggggx.', 'xgggggggx', 'xxxxxxxxx', '...yyy...', '....x....', '....x....', '....x....',
                    '...xxx...', '.xxGGGxx.', '.xGGGGGx.', '.xxxxxxx.'],
    'postcards': ['xxxxrxxxx....', 'xuuuuuuux....', 'xuuuuuGux....', 'xgguuuggx....', 'xgggxxxxxrxxx', 'xgggxyyyyyssx',
                  'xxxxxyllllssx', '....xyyyyyyyx', '....xylllllyx', '....xxxxxxxxx'],
    'toolbox': ['.....xxxx.....', '.....x..x.....', '..xxxxxxxxxx..', '.xrrrrrrrrrrx.', 'xxxxxxxxxxxxxx', 'xrrrrrrrrrrrrx',
                'xrrrrrlllrrrrx', 'xrrrrrrrrrrrrx', 'xrrrrrrrrrrrrx', 'xxxxxxxxxxxxxx'],
    # Past fifty (road-to-1.1.md A9). c glass, a water, f goldfish, h brass shadow, m plum, t straw shadow; the rest as COLORS.
    'chime': ['...x...', '...x...', '.xxxxx.', 'xcccccx', 'xcrcrcx', 'xcccccx', 'xxxxxxx', '.l.l.l.', '.l.l.l.', '.l.l.l.',
              '...x...', '...x...', '..xwx..', '..xwx..', '..xwx..', '..xrx..', '..xxx..'],
    'scroll': ['....x....', '...x.x...', '..x...x..', 'xkkkkkkkx', '.xyyyyyx.', '.xywwwyx.', '.xywxwyx.', '.xyxxxyx.',
               '.xywxwyx.', '.xywwwyx.', '.xywxwyx.', '.xywxxyx.', '.xywxwyx.', '.xywwwyx.', '.xyxwwyx.', '.xywxxyx.',
               '.xywwwyx.', '.xywwryx.', '.xyyyyyx.', 'xkkkkkkkx', '.x.....x.'],
    'teapot': ['......xx.....', '....xxkkxx...', 'x..xkkkkkkxx.', 'xx.xoooooox.x', '.xxoyooooox.x', '..xoyooooooxx', '..xooooooox..', '...xxxxxxx...'],
    'cushion': ['....xxxxxxxxxx....', '..xxmmmmmmmmmmxx..', 'Gxmmmmpmmmmpmmmmx.', 'xmmmmmmmmmmmmmmmmx',
                '.xmmmmpmmmmpmmmmxG', '..xxmmmmmmmmmmxx..', '....xxxxxxxxxx....'],
    'hat': ['......x......', '.....xx......', '....xxxxx....', '...xyyyyyx...', '...xyyyyyx...', '..xrrrrrrrx..',
            'xxyyyyyyyyyxx', 'xyyoyyoyyoyyx', '.xxyyyyyyyxx.', '...xxxxxxx...'],
    'plaque': [
        '..rr...........................................rr..',
        '.rrrr.........................................rrrr.',
        'xxrrxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxrrxx',
        'xkrrkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkrrkx',
        'xkkrxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxrkkx',
        'xkxnnnnnnGGnnnnnnnnnnnnnnGnnnnnnnnnnnnnnGGnnnnnnxkx',
        'xkxnnnnnGnnGnnnnnnnnnnnnGGGnnnnnnnnnnnnGnnGnnnnnxkx',
        'xkxnnnnnGnGnGGnnnnnnnnnGyyyGnnnnnnnnnGGnGnGnnnnnxkx',
        'xkxnnnnnnGnnGnnnnnnnnnnGyyyGnnnnnnnnnnGnnGnnnnnnxkx',
        'xkxnnnnnnnGGnnnnnnnnnnnnGGGnnnnnnnnnnnnGGnnnnnnnxkx',
        'xkkxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxkkx',
        'xkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkx',
        'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    ],
    'aquarium': [
        '.xxxxxxxxxxxxxxxxxxxxxxxxxxx.',
        'xcccccccccccccccccccccccccccx',
        'xcaaaaaaaaaaaaaaaaaaaaaaaaacx',
        'xcaaawaaaaaaaaaaaaaaaaaaaaacx',
        'xcaaaaaagaaaaaaaaaaawaaaaaacx',
        'xcaawaaagaaaaffaaaaaaaaaaaacx',
        'xcaaaaagaaaaffwfaaaaaawaaaacx',
        'xcaaaaagaaaaaffaaaaaaaaaaaacx',
        'xcaaaaaagaaaaaaaaaaaaffaaaacx',
        'xcaaaaaagaaaaaaaaaaafwffaaacx',
        'xcaaaaagagaaaaaaaaaaaffaaaacx',
        'xcoosooogooooosoooooooooosocx',
        'xccccccccccccccccccccccccccxx'[:29],
        'xxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        'xkbbbbbbbbbbbbbbbbbbbbbbbbbkx',
        'xkbbbbbbbbbxGxbbbbbbbbbbbbbkx',
        'xkbbbbbbbbbbbbbbbbbbbbbbbbbkx',
        'xxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        '.xkx.....................xkx.',
        '.xxx.....................xxx.',
    ],
    'gramophone': [
        '..xxxxxx................',
        '.xGGGGGGxx..............',
        'xGhhhhhhGGx.............',
        'xGhxxxxhhGGx............',
        'xGhxxxxxhhGGx...........',
        '.xGhhxxxhhsGGx..........',
        '..xGGhhhhssGGx..........',
        '...xxGGGsssGGx..........',
        '.....xxGGsssGx..........',
        '.......xxGssGx..........',
        '.........xGsGx..........',
        '..........xGsx..........',
        '..........xGsx..........',
        '..xxxxxxxxxGsxxxxxxx....',
        '..xkkkkkxxxxxxxkkkkx....',
        '..xkkkkxxxxrxxxxkkkx....',
        '..xkkkkkxxxxxxxkkkkx....',
        '..xxxxxxxxxxxxxxxxxx....',
        '..xbbbbbbbbbbbbbbbbxx...',
        '..xbbbbbbbbbbbbbbbbxGx..',
        '..xbbbbbbbGGbbbbbbbxx...',
        '..xbbbbbbbbbbbbbbbbx....',
        '..xkbbbbbbbbbbbbbbkx....',
        '..xxxxxxxxxxxxxxxxxx....',
        '...xkx..........xkx.....',
        '...xxx..........xxx.....',
    ],
}


def drawn(name):
    rows = DRAWN[name]
    img = Image.new('RGBA', (len(rows[0]), len(rows)), (0, 0, 0, 0))
    for y, row in enumerate(rows):
        assert len(row) == len(rows[0]), (name, row)
        for x, c in enumerate(row):
            if c != '.':
                img.putpixel((x, y), COLORS[c])
    return img


# Growth id -> pieces: (single, top-left of its trimmed image on the canvas). Kept clear of the anchors and
# walking paths in layout.ts, and of the holiday decorations where they can be (decor.py).
def pieces_by_id():
    return {
        'painting': [(single(ART, 'Art_Singles_Shadowless_46.png'), (226, 24))],  # a little landscape between the doors
        'plant': [(single(LIVING, 'Living_Room_Singles_Shadowless_15.png'), (215, 71))],  # a pot plant at the front end of the counter, clear of Adeng's face
        'lights': [(single(LIVING, 'Living_Room_Singles_Shadowless_12.png'), (x, 18)) for x in (19, 55)],  # fairy lights over the windows
        'fruit': [(single(LIVING, 'Living_Room_Singles_Shadowless_49.png'), (166, 82))],  # a bowl of fruit on the big table
        'guitar': [(single(MUSIC, 'Music_and_Sport_Singles_Shadowless_206.png'), (246, 22))],  # Laoshi's mended guitar in the corner
        'bonsai': [(single(ART, 'Art_Singles_Shadowless_21.png'), (27, 93))],  # a bonsai on top of the bookcase
        'easel': [(single(ART, 'Art_Singles_Shadowless_38.png'), (302, 72))],  # Qingdai's easel by the front wall
        'trophy': [(single(MUSIC, 'Music_and_Sport_Singles_Shadowless_140.png'), (44, 97))],  # a small cup beside the bonsai
        'portrait': [(single(ART, 'Art_Singles_Shadowless_44.png'), (262, 24))],  # Qingdai's little portrait past the guitar
        'sunset': [(single(ART, 'Art_Singles_Shadowless_45.png'), (275, 24))],  # and her sunset beside it
        'star': [(drawn('star'), (164, 19))],  # fifty commissions: a gold star over the works shelf
        # Pieces that come from a kind of work (shared/growth.ts).
        'album': [(drawn('album'), (134, 84))],  # an open album on the big table
        'calendar': [(drawn('calendar'), (129, 19))],  # a calendar over the works shelf
        'books': [(drawn('books'), (12, 103))],  # a stack on top of the bookcase; the study has its own globe
        'letters': [(drawn('letters'), (146, 19))],  # a board of letters beside the calendar
        'ledger': [(drawn('ledger'), (155, 85))],  # a ledger on the big table
        'monitor': [(drawn('monitor'), (129, 133))],  # an old computer on the little table
        'briefcase': [(drawn('briefcase'), (3, 77))],  # a briefcase on the floor by the left wall, under the pot plant
        'readinglamp': [(drawn('readinglamp'), (125, 81))],  # a reading lamp at the left end of the big table, beside the album
        'postcards': [(drawn('postcards'), (2, 22))],  # postcards pinned on the wall left of the windows
        'toolbox': [(drawn('toolbox'), (36, 159))],  # a toolbox on the floor at the foot of the bookcase
        # Past fifty (road-to-1.1.md A9): hung on what wall there is left, on the counter, and in two corners nobody walks
        # through (tests/routes.test.ts). Each sits the same in the cafe and the study.
        'chime': [(drawn('chime'), (44, 17))],  # wind chimes between the two windows
        'aquarium': [(drawn('aquarium'), (4, 156))],  # sixty: a tank of goldfish in the corner below the bookcase
        'scroll': [(drawn('scroll'), (82, 16))],  # Laoshi's calligraphy between the window and the blackboard
        'teapot': [(drawn('teapot'), (227, 75))],  # a clay teapot on the counter, clear of the coffee machine
        'gramophone': [(drawn('gramophone'), (30, 50))],  # seventy-five: a gramophone against the wall under the first window
        'cushion': [(drawn('cushion'), (217, 99))],  # Chestnut's cushion, where the cat lies by the counter
        'hat': [(drawn('hat'), (305, 18))],  # a straw hat on a peg right of the front door
        'plaque': [(drawn('plaque'), (125, 1))],  # a hundred: a carved sign high on the back wall, red silk on its corners
    }

# Works-shelf icons, 8x8 each, in this order (shared/growth.ts WORK_ICONS):
# page (a framed picture), research (a blue book), edit (a letter), tidy (a wooden box), demo (a green ledger),
# letter (a sealed envelope), sheet (a ruled table), plan (a calendar page), album (an instant photo),
# resume (a sheet with a photo), notes (an open book with a bookmark), travel (a suitcase), tool (a wrench).
ICONS = {
    'page': ['bbbbbbbb', 'byyyyyyb', 'byyssyyb', 'bygsssyb', 'bggggggb', 'bggggggb', 'bbbbbbbb', '........'],
    'research': ['.uuuuuu.', '.uwwwwuu', '.uuuuuuu', '.uyyyyuu', '.uuuuuuu', '.uuuuuuu', '.wwwwwwu', '.uuuuuu.'],
    'edit': ['........', 'ddddddd.', 'dwwwwwd.', 'ddwwwdd.', 'dwdrdwd.', 'dwwwwwd.', 'ddddddd.', '........'],
    'tidy': ['........', 'kkkkkkkk', 'koooooook'[:8], 'kkkkkkkk', 'kooookok', 'koooooook'[:8], 'kkkkkkkk', '........'],
    'demo': ['.gggggg.', '.gwwwwgg', '.gwllwgg', '.gwwwwgg', '.gwllwgg', '.gwwwwgg', '.gggggg.', '........'],
    'letter': ['........', 'pppppppp', 'ppwwwwpp', 'pwpwwpwp', 'pwwrrwwp', 'pwwrrwwp', 'pppppppp', '........'],
    'sheet': ['gggggggg', 'gwlwwlwg', 'llllllll', 'gwlwwlwg', 'llllllll', 'gwlwwlwg', 'gggggggg', '........'],
    'plan': ['.r.rr.r.', 'rrrrrrrr', 'rwwwwwwr', 'rwlwlwlr', 'rwwwwwwr', 'rwlwrwlr', 'rrrrrrrr', '........'],
    'album': ['.wwwwww.', '.wuuuyw.', '.wuuuuw.', '.wgguuw.', '.wggggw.', '.wwwwww.', '.wwwwww.', '........'],
    'resume': ['.dddddd.', '.dwwwwd.', '.duuwld.', '.duuwwd.', '.dwwwwd.', '.dlllld.', '.dwwwwd.', '.dddddd.'],
    'notes': ['........', 'uwwddwwu', 'ullddllu', 'uwwddwwu', 'ullddlru', 'uwwddwru', 'uuuuuuru', '......r.'],
    'travel': ['..kkkk..', '..k..k..', 'kkkkkkkk', 'kokookok', 'kokoskok', 'kokookok', 'kkkkkkkk', '.k....k.'],
    'tool': ['.....l.l', '.....lll', '....lll.', '...lll..', '..lll...', '.lll....', '.ll.....', '........'],
}
COLORS = {
    'b': (122, 82, 54, 255), 'y': (243, 226, 178, 255), 's': (226, 156, 84, 255), 'g': (104, 150, 96, 255),
    'u': (72, 104, 160, 255), 'w': (250, 246, 236, 255), 'd': (150, 130, 110, 255), 'r': (200, 72, 60, 255),
    'k': (120, 80, 48, 255), 'o': (176, 128, 80, 255), 'l': (150, 150, 150, 255), 'p': (214, 150, 150, 255),
    'x': (42, 34, 51, 255), 'G': (232, 184, 74, 255),
    'c': (196, 226, 236, 255), 'a': (112, 172, 204, 255), 'f': (236, 116, 44, 255), 'h': (168, 120, 48, 255),
    'm': (150, 70, 96, 255), 'n': (138, 44, 36, 255),
}
ORDER = ['page', 'research', 'edit', 'tidy', 'demo', 'letter', 'sheet', 'plan', 'album', 'resume', 'notes', 'travel', 'tool']


def overlay(pieces):
    img = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    for piece, at in pieces:
        img.alpha_composite(piece, at)
    return img


def icons():
    img = Image.new('RGBA', (8 * len(ORDER), 8), (0, 0, 0, 0))
    for i, name in enumerate(ORDER):
        for y, row in enumerate(ICONS[name]):
            for x, c in enumerate(row):
                if c in COLORS:
                    img.putpixel((i * 8 + x, y), COLORS[c])
    return img


if __name__ == '__main__':
    import sys
    if '--icons' in sys.argv:  # only the works-shelf icons, which need no vendor art
        icons().save(OUT / 'works.png', optimize=True)
        sys.exit(print('wrote works.png'))
    PIECES = pieces_by_id()
    for gid, pieces in PIECES.items():
        overlay(pieces).save(OUT / f'grow-{gid}.png', optimize=True)
    icons().save(OUT / 'works.png', optimize=True)
    print('wrote', len(PIECES), 'growth overlays and works.png')
