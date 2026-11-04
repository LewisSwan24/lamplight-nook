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

# Growth id -> pieces: (single, top-left of its trimmed image on the canvas). Kept clear of the anchors and
# walking paths in layout.ts, and of the holiday decorations where they can be (decor.py).
def pieces_by_id():
    return {
        'painting': [(single(ART, 'Art_Singles_Shadowless_46.png'), (226, 24))],  # a little landscape between the doors
        'plant': [(single(LIVING, 'Living_Room_Singles_Shadowless_15.png'), (218, 64))],  # a pot plant at the end of the counter
        'lights': [(single(LIVING, 'Living_Room_Singles_Shadowless_12.png'), (x, 18)) for x in (19, 55)],  # fairy lights over the windows
        'fruit': [(single(LIVING, 'Living_Room_Singles_Shadowless_49.png'), (166, 82))],  # a bowl of fruit on the big table
        'guitar': [(single(MUSIC, 'Music_and_Sport_Singles_Shadowless_206.png'), (246, 22))],  # Laoshi's mended guitar in the corner
        'bonsai': [(single(ART, 'Art_Singles_Shadowless_21.png'), (27, 93))],  # a bonsai on top of the bookcase
        'easel': [(single(ART, 'Art_Singles_Shadowless_38.png'), (302, 72))],  # Qingdai's easel by the front wall
        'trophy': [(single(MUSIC, 'Music_and_Sport_Singles_Shadowless_140.png'), (44, 97))],  # a small cup beside the bonsai
    }

# Works-shelf icons, 8x8 each, in this order (shared/growth.ts WORK_ICONS):
# page (a framed picture), research (a blue book), edit (a letter), tidy (a wooden box), demo (a green ledger),
# letter (a sealed envelope), sheet (a ruled table), plan (a calendar page), album (an instant photo).
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
}
COLORS = {
    'b': (122, 82, 54, 255), 'y': (243, 226, 178, 255), 's': (226, 156, 84, 255), 'g': (104, 150, 96, 255),
    'u': (72, 104, 160, 255), 'w': (250, 246, 236, 255), 'd': (150, 130, 110, 255), 'r': (200, 72, 60, 255),
    'k': (120, 80, 48, 255), 'o': (176, 128, 80, 255), 'l': (150, 150, 150, 255), 'p': (214, 150, 150, 255),
}
ORDER = ['page', 'research', 'edit', 'tidy', 'demo', 'letter', 'sheet', 'plan', 'album']


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
