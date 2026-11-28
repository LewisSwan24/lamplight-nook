"""Compose the street along the river (plan-2.0.md J1), past the bridge at the far end of the first street (town.py).

Left to right: the bridge over the canal, the florist, the old clock tower that stopped long ago, the bookshop, and a
stretch of riverbank. The street is in front of the buildings as on the first street; where the first street has the
road, this one has the river. Fronts, trees, lamps and benches come from LimeZu Modern Exteriors (as town.py); the sky,
the water and the bridge's railing are drawn here by hand (plan-2.0.md Q-J7). The clock tower is tower.py's (J6), which
draws it in each look as it is mended; this only leaves it its plot.

Reads the raw pack from assets/vendor/ (not in the repo) and writes, into assets/sprites/:
  river-street.png  the ground: sky and the far bank behind, the bridge, roofs, pavement, the river in front
  river-fronts.png  the florist's and the bookshop's fronts, on a transparent strip as wide as the river street
  river-props.png   lamps, benches, trees and flowers, on a transparent strip
  river.json        where the bridge, each front, door, ground floor and the tower is, and the ground each prop stands on, read by
                    app/renderer/game/town.ts, which puts the whole strip on at the end of the first street
Run: py -3.12 scripts/art/river.py
"""
import json

from PIL import Image, ImageDraw

from tower import H as TOWER_H, W as TOWER_W
from town import ALLEY, ALLEY_COLOUR, GRASS, H, KERB, OUT, ROAD, T, UPPER, city, fences, garden, modular, terrain

W = 784
BRIDGE = {'x': 0, 'w': 112}
# Ground floors from the modular sheet: the florist's has striped awnings over two windows of flowers, the bookshop's
# one wide arched window in grey stone. An upper floor to match each: red brick as on the first street, and grey stone.
FRONTS = [
    ('flowershop', 120, (0, 1328, 144, 1376), UPPER),
    ('bookshop', 376, (160, 1856, 272, 1920), (0, 1696, 288, 1746)),
]
# The plot between them where the old clock tower stands.
PLOT = {'x': 272, 'w': 96}
BANK = 496

SKY_TOP = (176, 204, 226, 255)
SKY_LOW = (214, 226, 232, 255)
FAR_TREES = (92, 124, 108, 255)
CANAL = (96, 138, 168, 255)
WATER = (64, 112, 150, 255)
WATER_LIGHT = (122, 166, 196, 255)
WATER_DARK = (48, 88, 124, 255)
EDGE = (178, 172, 164, 255)
EDGE_DARK = (120, 114, 112, 255)
STONE = (196, 190, 182, 255)
STONE_DARK = (132, 126, 124, 255)


def sky(img, left, right):
    """Sky from the top down to the far bank, lighter towards it, and a soft line of trees over there."""
    far = 92
    for y in range(0, far):
        t = y / far
        c = tuple(round(a + (b - a) * t) for a, b in zip(SKY_TOP, SKY_LOW))
        img.paste(c, (left, y, right, y + 1))
    for x in range(left, right):
        # Treetops on the far bank: a gentle wave, a few pixels high.
        top = far - 6 - round(3 * abs(((x * 7) % 23) / 11.5 - 1)) - (2 if (x // 9) % 3 == 0 else 0)
        img.paste(FAR_TREES, (x, top, x + 1, far + 4))


def canal(img, left, right):
    """The canal the bridge goes over, between the far bank and the railing, with light on it."""
    img.paste(CANAL, (left, 96, right, KERB))
    for y in range(98, KERB, 5):
        for x in range(left + (y * 3) % 11, right, 13):
            img.paste(WATER_LIGHT, (x, y, min(x + 4, right), y + 1))


def railing(img, left, right):
    """A low stone railing along the back of the bridge: a rail on posts."""
    img.paste(STONE, (left, KERB - 12, right, KERB - 9))
    img.paste(STONE_DARK, (left, KERB - 9, right, KERB - 8))
    for x in range(left + 2, right - 3, 12):
        img.paste(STONE, (x, KERB - 8, x + 4, KERB))
        img.paste(STONE_DARK, (x + 3, KERB - 8, x + 4, KERB))


def lawn(img, left, right):
    """Grass from the far bank down to the pavement, behind the tower and along the bank, with a stone edge at the front."""
    gx, gy = GRASS
    grass = fences.crop((gx + T, gy + T, gx + 2 * T, gy + 2 * T))
    for x in range(left, right, T):
        for y in range(92, KERB, T):
            img.alpha_composite(grass.crop((0, 0, min(T, right - x), min(T, KERB - y))), (x, y))
    img.paste(STONE, (left, KERB - 3, right, KERB - 1))
    img.paste(STONE_DARK, (left, KERB - 1, right, KERB))


def road_end(img, right):
    """The first street's road runs on over the bridge and stops at a stone kerb, where the river begins."""
    asphalt = terrain.crop((32, 32, 48, 48))
    for x in range(0, right, T):
        for y in range(ROAD, H, T):
            img.alpha_composite(asphalt.crop((0, 0, min(T, right - x), T)), (x, y))
    img.paste(STONE, (right - 4, ROAD, right, H))
    img.paste(STONE_DARK, (right - 1, ROAD, right, H))


def river(img):
    """The river in front: a stone edge along the pavement, then the water, with ripples of light."""
    img.paste(EDGE, (0, ROAD, W, ROAD + 3))
    img.paste(EDGE_DARK, (0, ROAD + 3, W, ROAD + 4))
    img.paste(WATER, (0, ROAD + 4, W, H))
    img.paste(WATER_DARK, (0, ROAD + 4, W, ROAD + 6))
    for y in range(ROAD + 8, H, 4):
        for x in range((y * 5) % 17, W, 19):
            img.paste(WATER_LIGHT, (x, y, x + 5, y + 1))


# Street furniture: (sprite, x of its left edge, y of its bottom), as on the first street.
PROPS = [
    (lambda: city('Street_Lamp_5'), 92, KERB + 10),
    (lambda: garden('Big_Red_Flower_Vase'), 126, KERB + 6),
    (lambda: garden('Big_Yellow_Flower_Vase'), 142, KERB + 6),
    (lambda: garden('Big_Pink_Flower_Vase'), 158, KERB + 6),
    (lambda: city('Flower_Bush_4'), 214, KERB + 9),
    (lambda: city('Pot_1'), 450, KERB + 10),
    (lambda: city('Street_Lamp_5'), 500, KERB + 10),
    (lambda: city('Tree_11'), 536, KERB + 12),
    (lambda: city('Bench_2'), 590, KERB + 14),
    (lambda: city('Flowers_1'), 650, KERB + 8),
    (lambda: city('Tree_11'), 680, KERB + 12),
    (lambda: city('Flowers_3'), 736, KERB + 8),
]


def build():
    ground = Image.new('RGBA', (W, H), (90, 84, 92, 255))
    sky(ground, 0, W)
    canal(ground, BRIDGE['x'], BRIDGE['x'] + BRIDGE['w'])
    roof = modular.crop((330, 40, 346, 56))
    pave = terrain.crop((240, 160, 256, 176))
    for x in range(0, W, T):
        for y in range(KERB, ROAD, T):
            ground.alpha_composite(pave, (x, y))
    # The bridge's deck: the same paving, a shade darker, and the railing at its back.
    deck = Image.new('RGBA', (BRIDGE['w'], ROAD - KERB), (40, 36, 48, 60))
    ground.alpha_composite(deck, (BRIDGE['x'], KERB))
    railing(ground, BRIDGE['x'], BRIDGE['x'] + BRIDGE['w'])
    river(ground)
    road_end(ground, BRIDGE['x'] + BRIDGE['w'])
    lawn(ground, BRIDGE['x'] + BRIDGE['w'], W)

    strip = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    fronts = []
    for name, x, rect, upper_rect in FRONTS:
        part = modular.crop(rect)
        w = part.width
        upper = modular.crop(upper_rect).crop((0, 0, w, upper_rect[3] - upper_rect[1]))
        top = KERB - part.height
        # Roofs behind each building, from the top down to its upper floor, and the shaded alleys on either side.
        for rx in range(x - ALLEY, x + w + ALLEY, T):
            for ry in range(0, top - upper.height, T):
                ground.alpha_composite(roof.crop((0, 0, min(T, x + w + ALLEY - rx), T)), (rx, ry))
        for ax in (x - ALLEY, x + w):
            ground.paste(ALLEY_COLOUR, (ax, 0, ax + ALLEY, KERB))
        strip.alpha_composite(upper, (x, top - upper.height))
        strip.alpha_composite(part, (x, top))
        # `top`: where the ground floor starts, which the pieces a front grows hang from (town.py, plan-2.0.md J5).
        fronts.append({'id': name, 'x': x, 'w': w, 'door': x + w // 2, 'top': top})

    at = {'x': PLOT['x'] + (PLOT['w'] - TOWER_W) // 2, 'y': KERB - TOWER_H, 'w': TOWER_W, 'h': TOWER_H}

    props = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    stands = []
    for make, x, bottom in PROPS:
        part = make()
        props.alpha_composite(part, (x, bottom - part.height))
        foot = part.crop((0, part.height - 4, part.width, part.height)).getbbox()
        stands.append({'left': x + foot[0], 'right': x + foot[2], 'top': bottom - 4, 'bottom': bottom})

    OUT.mkdir(parents=True, exist_ok=True)
    ground.save(OUT / 'river-street.png')
    strip.save(OUT / 'river-fronts.png')
    props.save(OUT / 'river-props.png')
    data = {'width': W, 'height': H, 'kerb': KERB, 'road': ROAD, 'bridge': BRIDGE, 'fronts': fronts, 'tower': at, 'props': stands}
    (OUT / 'river.json').write_text(json.dumps(data, indent=1) + '\n', encoding='utf8')
    return data


if __name__ == '__main__':
    print(json.dumps({k: v for k, v in build().items() if k != 'props'}))
