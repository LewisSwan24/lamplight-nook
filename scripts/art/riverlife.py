"""Draw what lives on the river in front of the river street (plan-2.0.md J5), all by hand: no pack has these.

  duck-0, duck-1   a mallard paddling, two pictures, facing right (turned round in the game to face left)
  boat             a little rowing boat with someone at the oars
  dragonboat       the dragon boat: a red hull with a gold stripe, six rowers, a drummer and the dragon's head at the bow
  lantern          a pink lotus lantern on a green leaf, for the lantern festival
  moonlantern      a round paper lantern on a little float, for mid-autumn
  glint            a glint of sun on the water
  ripple-0..2      a raindrop's ring as it spreads
  ice              the thin ice over the river in the winter's snow, from the bridge to the end of the river street

Writes assets/sprites/river-life.png (the pieces packed into one sheet) and river-life.json (where each is on it),
read by app/renderer/game/RiverView.ts; where they go on the water is app/renderer/game/riverlife.ts.
Run: py -3.12 scripts/art/riverlife.py
"""
import json
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'assets/sprites'
_RIVER = json.loads((OUT / 'river.json').read_text(encoding='utf-8'))
# The ice reaches from where the bridge ends (its shadow lies on the water under it) to the end of the river street.
RIVER_W = _RIVER['width'] - (_RIVER['bridge']['x'] + _RIVER['bridge']['w'])
WATER_H = 180 - (152 + 4)  # town.py H, ROAD; the water starts 4 rows under the road line (river.py)

C = {
    'k': (42, 34, 51, 255), 'b': (146, 104, 66, 255), 'B': (100, 70, 44, 255), 'g': (46, 120, 78, 255),
    'y': (232, 184, 74, 255), 'w': (250, 246, 236, 255), 'r': (200, 72, 60, 255), 'R': (140, 44, 38, 255),
    'p': (230, 132, 160, 255), 'P': (250, 196, 210, 255), 'l': (255, 232, 150, 255), 'L': (236, 140, 56, 255),
    's': (236, 190, 150, 255), 'u': (72, 104, 160, 255), 'm': (170, 122, 78, 255), 'M': (108, 74, 46, 255),
    'G': (96, 160, 96, 255), 'o': (226, 176, 64, 255),
}
DUCK = [
    '......kkk..',
    '.....kgggk.',
    '.....kgkgyy',
    'kk...kwwk..',
    'kbbbbbbbbk.',
    'kbBBbbbbbk.',
    '.kkkkkkkk..',
]
# The second picture: the tail up a little and the feet pushing back under the water.
DUCK_1 = DUCK[:3] + ['.k...kwwk..', 'kkbbbbbbbk.', 'kbBBbbbbbk.', '..kkkkkkk..']
LOTUS = [
    '....l....',
    '..p.l.p..',
    '.pPplpPp.',
    'pPPpPpPPp',
    '.GGGGGGG.',
    '..GGGGG..',
]
MOON = [
    '...k...',
    '..LLL..',
    '.LlllL.',
    '.LlllL.',
    '.LlllL.',
    '..LLL..',
    '...r...',
    '.mmmmm.',
]
GLINT = ['..w..', '.www.', 'wwwww', '.www.', '..w..']


def rows(art):
    assert len({len(r) for r in art}) == 1, art
    img = Image.new('RGBA', (len(art[0]), len(art)), (0, 0, 0, 0))
    for y, row in enumerate(art):
        for x, c in enumerate(row):
            if c != '.':
                img.putpixel((x, y), C[c])
    return img


def boat():
    img = Image.new('RGBA', (28, 12), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.polygon([(1, 6), (26, 6), (22, 11), (5, 11)], fill=C['m'], outline=C['M'])
    d.line((2, 7, 25, 7), fill=C['M'])
    # The rower, facing the stern, and the oars dipping on this side.
    d.rectangle((12, 0, 14, 2), fill=C['s'])
    d.line((12, 0, 14, 0), fill=C['B'])
    d.rectangle((11, 3, 15, 6), fill=C['u'])
    d.line((10, 4, 3, 11), fill=C['M'])
    d.line((16, 4, 23, 11), fill=C['M'])
    return img


def dragon_boat():
    img = Image.new('RGBA', (64, 14), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.polygon([(3, 8), (57, 8), (53, 13), (8, 13)], fill=C['r'], outline=C['R'])
    d.line((5, 10, 55, 10), fill=C['o'])
    # The dragon's tail curling up at the stern, its neck and head at the bow.
    d.line((3, 8, 1, 4), fill=C['g'])
    d.point((2, 3), fill=C['g'])
    d.line((56, 8, 59, 3), fill=C['g'], width=2)
    d.rectangle((58, 1, 63, 4), fill=C['g'])
    d.point((61, 2), fill=C['r'])
    d.line((60, 0, 62, 0), fill=C['o'])
    d.line((62, 4, 63, 5), fill=C['y'])
    # Six rowers in red and gold, paddles in the water; the drummer at the back.
    for i, x in enumerate(range(13, 50, 7)):
        d.rectangle((x - 1, 2, x + 1, 3), fill=C['s'])
        d.point((x, 2), fill=C['k'])
        d.rectangle((x - 1, 4, x + 1, 7), fill=C['y'] if i % 2 else C['r'])
        d.line((x - 1, 6, x - 4, 12), fill=C['M'])
    d.ellipse((5, 3, 9, 7), fill=C['R'], outline=C['k'])
    return img


def ripple(w, h):
    img = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    ImageDraw.Draw(img).ellipse((0, 0, w - 1, h - 1), outline=(200, 222, 236, 210))
    return img


def ice():
    """Pale ice from bank to bank, a lighter line along its edge, cracks and a few drifts of snow on it."""
    img = Image.new('RGBA', (RIVER_W, WATER_H), (214, 230, 240, 238))
    d = ImageDraw.Draw(img)
    d.line((0, 0, RIVER_W, 0), fill=(240, 248, 252, 255))
    d.line((0, 1, RIVER_W, 1), fill=(190, 212, 228, 240))
    seed = 7
    for x in range(10, RIVER_W - 10, 37):
        seed = (seed * 1103515245 + 12345) & 0x7FFFFFFF
        y = 4 + seed % (WATER_H - 8)
        ln = 6 + (seed >> 8) % 10
        d.line((x, y, x + ln, y + (1 if seed & 256 else -1)), fill=(170, 196, 216, 255))
        d.line((x + ln // 2, y, x + ln // 2 + 2, y + 3), fill=(170, 196, 216, 255))
        if seed % 3 == 0:
            d.ellipse((x + 12, y - 1, x + 22, y + 2), fill=(246, 250, 252, 255))
    return img


def main():
    pieces = [
        ('duck-0', rows(DUCK)), ('duck-1', rows(DUCK_1)), ('boat', boat()), ('dragonboat', dragon_boat()),
        ('lantern', rows(LOTUS)), ('moonlantern', rows(MOON)), ('glint', rows(GLINT)),
        ('ripple-0', ripple(5, 2)), ('ripple-1', ripple(9, 3)), ('ripple-2', ripple(13, 4)),
    ]
    row_h = max(p.height for _, p in pieces)
    width = max(RIVER_W, sum(p.width + 1 for _, p in pieces))
    sheet = Image.new('RGBA', (width, row_h + 1 + WATER_H), (0, 0, 0, 0))
    frames, x = {}, 0
    for name, p in pieces:
        sheet.alpha_composite(p, (x, 0))
        frames[name] = [x, 0, p.width, p.height]
        x += p.width + 1
    sheet.alpha_composite(ice(), (0, row_h + 1))
    frames['ice'] = [0, row_h + 1, RIVER_W, WATER_H]
    sheet.save(OUT / 'river-life.png')
    (OUT / 'river-life.json').write_text(json.dumps({'frames': frames}, indent=1) + '\n', encoding='utf-8')
    print('wrote river-life.png and river-life.json')


if __name__ == '__main__':
    main()
