"""Draw the flower shop's flowers (plan-2.0.md J12), all by hand: the packs have a few vases of flowers, never the same
bunch at three ages, and the stand needs nineteen kinds.

  <flower>-bud, <flower>-open, <flower>-wilting
               a blue vase on the stand with a bunch in it: closed and green, open, and drooping on its last day
  vase         the same vase with only water in it, once the bunch is sold
  card         a little folded card standing on the counter, "today's flowers" pencilled on it
  wallcard-0..3
               a flower card pinned on the wall, one of the shop's finished flower-card commissions, each with a
               different flower painted on it

The flowers are those of app/shared/flowers.ts, in its order. Writes assets/sprites/flowers.png (one row) and
flowers.json (where each is on it), read by app/renderer/game/FlowerStand.ts.
Run: py -3.12 scripts/art/flowers.py
"""
import json
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'assets/sprites'

W, H = 13, 24  # a vase with its bunch; the vase is the bottom VASE_H rows
VASE_H = 8

VASE, VASE_D, VASE_HI, WATER = (70, 112, 176, 255), (42, 72, 124, 255), (128, 172, 222, 255), (150, 196, 226, 255)
STEM, STEM_D, LEAF, LEAF_D = (92, 150, 70, 255), (62, 108, 52, 255), (104, 164, 78, 255), (66, 112, 56, 255)
BRANCH, BRANCH_D = (120, 86, 62, 255), (84, 58, 44, 255)
INK = (64, 52, 48, 255)
PAPER, PAPER_D = (248, 242, 228, 255), (206, 192, 168, 255)

# Each flower: its look and its colours, petal and the darker edge, and a centre where it has one.
# Looks: cup (a rounded head), ball (a big round head), disc (petals round a centre), spray (many tiny dots),
# spike (small heads up a stem), trumpet (a flared bell), branch (flowers along a bare twig).
FLOWERS = [
    ('rose', 'cup', (204, 44, 64), (148, 24, 44), None),
    ('carnation', 'cup', (238, 128, 156), (196, 84, 116), None),
    ('babysbreath', 'spray', (250, 250, 246), (210, 214, 214), None),
    ('tulip', 'cup', (232, 84, 64), (176, 52, 44), None),
    ('peony', 'ball', (242, 156, 178), (206, 108, 140), None),
    ('freesia', 'spike', (246, 212, 82), (212, 168, 52), None),
    ('cherry', 'branch', (250, 204, 216), (226, 160, 182), None),
    ('sunflower', 'disc', (248, 200, 52), (214, 150, 30), (110, 68, 40)),
    ('lily', 'trumpet', (246, 244, 236), (212, 206, 196), (236, 184, 72)),
    ('hydrangea', 'ball', (128, 156, 232), (88, 112, 196), None),
    ('lotus', 'cup', (242, 172, 192), (210, 120, 150), None),
    ('chrysanthemum', 'disc', (242, 192, 62), (206, 146, 40), (196, 132, 40)),
    ('cosmos', 'disc', (222, 124, 204), (176, 84, 166), (240, 204, 80)),
    ('dahlia', 'ball', (224, 84, 52), (172, 52, 36), None),
    ('osmanthus', 'branch', (242, 174, 62), (208, 132, 40), None),
    ('plum', 'branch', (204, 42, 72), (150, 24, 52), None),
    ('narcissus', 'trumpet', (248, 248, 240), (214, 214, 204), (246, 196, 52)),
    ('camellia', 'cup', (212, 40, 60), (156, 22, 40), None),
    ('wintersweet', 'branch', (242, 212, 92), (204, 170, 56), None),
]
STAGES = ['bud', 'open', 'wilting']


def faded(c, by=0.62):
    """A colour gone dull and brown with age."""
    r, g, b = c[:3]
    grey = (r + g + b) / 3
    return (int((r * 0.55 + grey * 0.25 + 70 * 0.2) * by + 30), int((g * 0.5 + grey * 0.3 + 50 * 0.2) * by + 24),
            int((b * 0.45 + grey * 0.3 + 30 * 0.25) * by + 18), 255)


class Pen:
    def __init__(self, w=W, h=H):
        self.img = Image.new('RGBA', (w, h), (0, 0, 0, 0))

    def dot(self, x, y, c):
        if 0 <= x < self.img.width and 0 <= y < self.img.height:
            self.img.putpixel((x, y), tuple(c) if len(c) == 4 else (*c, 255))

    def fill(self, x0, y0, x1, y1, c):
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                self.dot(x, y, c)

    def line(self, x0, y0, x1, y1, c):
        steps = max(abs(x1 - x0), abs(y1 - y0), 1)
        for i in range(steps + 1):
            self.dot(round(x0 + (x1 - x0) * i / steps), round(y0 + (y1 - y0) * i / steps), c)


def vase(p, water=False):
    """A round-bellied blue vase, a narrow neck, a highlight on its left; water showing at the neck when it is empty."""
    top = H - VASE_H
    p.fill(4, top, 8, top, VASE_D)
    p.fill(4, top + 1, 8, top + 1, WATER if water else VASE_D)
    p.fill(3, top + 2, 9, H - 2, VASE)
    p.fill(2, top + 4, 10, H - 3, VASE)
    for y in range(top + 2, H - 1):
        p.dot(2 if top + 4 <= y <= H - 3 else 3, y, VASE_D)
        p.dot(10 if top + 4 <= y <= H - 3 else 9, y, VASE_D)
    p.fill(4, H - 1, 8, H - 1, VASE_D)
    p.fill(4, top + 3, 4, top + 5, VASE_HI)
    p.dot(5, top + 3, VASE_HI)


# Where the three heads of a bunch stand (x, y of the head's middle), and the stems run from the neck at (6, H - VASE_H).
HEADS = [(3, 6), (6, 3), (9, 6)]


def stems(p, heads, droop=0, colour=STEM):
    neck = H - VASE_H
    for hx, hy in heads:
        p.line(6, neck, hx, hy + 2 + droop, colour)
    # a leaf or two at the neck
    p.dot(4, neck - 2, LEAF)
    p.dot(3, neck - 3, LEAF_D)
    p.dot(8, neck - 2, LEAF)
    p.dot(9, neck - 3, LEAF_D)


def head(p, look, x, y, petal, edge, centre, stage):
    if stage == 'bud':
        # Closed: a small tight head, green at its base, the colour just showing at the tip.
        p.dot(x, y + 1, LEAF_D)
        p.dot(x, y, petal)
        if look in ('ball', 'cup', 'disc'):
            p.dot(x - 1, y + 1, LEAF)
            p.dot(x + 1, y + 1, LEAF)
        return
    if look == 'cup':
        p.fill(x - 1, y - 1, x + 1, y, petal)
        p.dot(x - 1, y - 1, edge)
        p.dot(x + 1, y - 1, edge)
        p.dot(x, y + 1, edge)
    elif look == 'ball':
        p.fill(x - 1, y - 1, x + 1, y, petal)
        p.dot(x, y - 2, petal)
        p.dot(x, y + 1, edge)
        p.dot(x + 1, y, edge)
        p.dot(x - 1, y - 1, edge)
    elif look == 'disc':
        for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1), (-1, -1), (1, 1)):
            p.dot(x + dx, y + dy, petal if (dx + dy) % 2 == 0 else edge)
        p.dot(x, y, centre or edge)
    elif look == 'trumpet':
        p.fill(x - 1, y - 1, x + 1, y - 1, petal)
        p.dot(x, y, petal)
        p.dot(x - 2, y - 2, edge)
        p.dot(x + 2, y - 2, edge)
        p.dot(x, y - 1, centre or edge)
    elif look == 'spike':
        for i in range(3):
            p.dot(x + (i % 2), y - i, petal if i != 1 else edge)
        p.dot(x - 1, y + 1, petal)


def spray(p, petal, edge, stage):
    """Baby's breath: a cloud of tiny white dots over thin green stems."""
    neck = H - VASE_H
    for hx in (3, 6, 9):
        p.line(6, neck, hx, 6, STEM_D)
    dots = [(1, 4), (3, 3), (5, 2), (7, 3), (9, 2), (11, 4), (2, 6), (4, 5), (6, 4), (8, 5), (10, 6), (5, 7), (7, 6)]
    for i, (x, y) in enumerate(dots):
        if stage == 'bud' and i % 3:
            continue
        p.dot(x, y + (2 if stage == 'wilting' and i % 2 else 0), petal if i % 4 else edge)


def branch(p, petal, edge, stage):
    """A bare twig, flowers along it: plum, cherry, osmanthus and wintersweet are cut this way."""
    neck = H - VASE_H
    twig = [(6, neck), (6, neck - 4), (4, neck - 8), (3, neck - 12), (2, 1)]
    for (x0, y0), (x1, y1) in zip(twig, twig[1:]):
        p.line(x0, y0, x1, y1, BRANCH)
    p.line(6, neck - 4, 9, neck - 9, BRANCH_D)
    p.line(9, neck - 9, 10, 2, BRANCH_D)
    spots = [(3, 11), (5, 8), (2, 4), (4, 2), (8, 8), (10, 5), (9, 2), (7, 12)]
    for i, (x, y) in enumerate(spots):
        if stage == 'bud':
            p.dot(x, y, edge if i % 2 else petal)
        elif stage == 'open':
            p.dot(x, y, petal)
            p.dot(x + 1, y, edge if i % 2 else petal)
            p.dot(x, y - 1, petal)
        elif i % 2 == 0:
            p.dot(x, y + 1, faded(petal))


def bunch(flower, stage):
    name, look, petal, edge, centre = flower
    p = Pen()
    if look == 'spray':
        spray(p, petal if stage != 'wilting' else faded(petal, 0.9), edge, stage)
    elif look == 'branch':
        branch(p, petal, edge, stage)
    else:
        droop = 2 if stage == 'wilting' else 0
        heads = [(x + (1 if droop and x < 6 else -1 if droop and x > 6 else 0), y + droop) for x, y in HEADS]
        if look == 'spike':
            heads = [(3, 7), (6, 4), (9, 6)]
        elif look == 'ball':
            heads = [(3, 7 + droop), (6, 3 + droop), (9, 7 + droop)]
        stems(p, heads, droop, STEM_D if stage == 'wilting' else STEM)
        colour = (faded(petal), faded(edge)) if stage == 'wilting' else (petal, edge)
        for hx, hy in heads:
            head(p, look, hx, hy, *colour, centre, stage)
    if stage == 'wilting':
        # a petal fallen beside the vase
        p.dot(11, H - 1, faded(petal))
    vase(p)
    return p.img


def empty_vase():
    p = Pen()
    vase(p, water=True)
    return p.img


def counter_card():
    """A folded card standing on the counter, a pencilled line and a tiny pink flower on its face."""
    p = Pen(9, 7)
    p.fill(0, 1, 8, 5, PAPER)
    p.line(0, 1, 8, 1, PAPER_D)
    p.line(0, 6, 8, 6, PAPER_D)
    p.dot(0, 5, PAPER_D)
    p.dot(8, 5, PAPER_D)
    p.line(1, 3, 5, 3, INK)
    p.line(1, 4, 4, 4, (140, 128, 120, 255))
    p.dot(7, 3, (226, 108, 140, 255))
    p.dot(6, 4, LEAF)
    return p.img


WALL_FLOWERS = [(204, 44, 64), (246, 212, 82), (128, 156, 232), (222, 124, 204)]


def wall_card(i):
    """A flower card pinned to the wall: cream, a red pin, a flower in one corner, a line of writing."""
    p = Pen(8, 10)
    p.fill(1, 1, 7, 9, (42, 34, 51, 80))
    p.fill(0, 0, 6, 8, PAPER)
    p.line(0, 8, 6, 8, PAPER_D)
    p.line(6, 0, 6, 8, PAPER_D)
    petal = WALL_FLOWERS[i]
    p.dot(2, 3, petal)
    p.dot(1, 3, petal)
    p.dot(3, 3, petal)
    p.dot(2, 2, petal)
    p.dot(2, 4, LEAF_D)
    p.dot(2, 5, LEAF)
    p.line(1, 6, 4, 6, (150, 138, 128, 255))
    p.dot(3, 0, (200, 72, 60, 255))
    return p.img


def main():
    pieces = [(f'{f[0]}-{s}', bunch(f, s)) for f in FLOWERS for s in STAGES]
    pieces += [('vase', empty_vase()), ('card', counter_card())] + [(f'wallcard-{i}', wall_card(i)) for i in range(4)]
    width = sum(p.width + 1 for _, p in pieces)
    sheet = Image.new('RGBA', (width, max(p.height for _, p in pieces)), (0, 0, 0, 0))
    frames, x = {}, 0
    for name, p in pieces:
        sheet.alpha_composite(p, (x, 0))
        frames[name] = [x, 0, p.width, p.height]
        x += p.width + 1
    sheet.save(OUT / 'flowers.png')
    (OUT / 'flowers.json').write_text(json.dumps({'frames': frames}, indent=1) + '\n', encoding='utf-8')
    print(f'wrote flowers.png ({len(pieces)} pictures) and flowers.json')


if __name__ == '__main__':
    main()
