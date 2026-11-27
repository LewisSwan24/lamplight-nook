"""Compose the street along the river (plan-2.0.md J1), past the bridge at the far end of the first street (town.py).

Left to right: the bridge over the canal, the florist, the old clock tower that stopped long ago, the bookshop, and a
stretch of riverbank. The street is in front of the buildings as on the first street; where the first street has the
road, this one has the river. Fronts, trees, lamps and benches come from LimeZu Modern Exteriors (as town.py); the sky,
the water, the bridge's railing and the clock tower are drawn here by hand (plan-2.0.md Q-J7).

Reads the raw pack from assets/vendor/ (not in the repo) and writes, into assets/sprites/:
  river-street.png  the ground: sky and the far bank behind, the bridge, roofs, pavement, the river in front
  river-fronts.png  the florist's and the bookshop's fronts, on a transparent strip as wide as the river street
  river-props.png   lamps, benches, trees and flowers, on a transparent strip
  river-tower.png   the clock tower as it stands at first: stopped, its roof half gone, its door boarded up
  river.json        where the bridge, each front, door and the tower is, and the ground each prop stands on, read by
                    app/renderer/game/town.ts, which puts the whole strip on at the end of the first street
Run: py -3.12 scripts/art/river.py
"""
import json

from PIL import Image, ImageDraw

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


def tower():
    """
    The clock tower as it stands when 2.0 opens: grey stone, a wooden belfry whose roof has half fallen in, a clock face
    with no hands, the door boarded up and ivy up one side. J6 draws it mended, stage by stage.
    """
    w, h = 56, KERB - 2
    img = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    body_top = 40
    # The stone body, its courses picked out every six rows, each row of blocks offset from the one below.
    d.rectangle((8, body_top, 47, h - 1), fill=(150, 146, 150, 255))
    for i, y in enumerate(range(body_top + 5, h, 6)):
        d.line((8, y, 47, y), fill=(118, 114, 120, 255))
        for x in range(8 + (6 if i % 2 else 0), 48, 12):
            d.line((x, y - 5, x, y - 1), fill=(118, 114, 120, 255))
    d.rectangle((8, body_top, 8, h - 1), fill=(96, 92, 100, 255))
    d.rectangle((47, body_top, 47, h - 1), fill=(96, 92, 100, 255))
    # A wider base, darker.
    d.rectangle((4, h - 14, 51, h - 1), fill=(120, 116, 122, 255))
    d.line((4, h - 14, 51, h - 14), fill=(176, 172, 176, 255))
    # The door, arched and boarded up.
    d.rectangle((22, h - 24, 33, h - 1), fill=(104, 72, 48, 255))
    d.pieslice((22, h - 30, 33, h - 19), 180, 360, fill=(104, 72, 48, 255))
    for x in (25, 28, 31):
        d.line((x, h - 27, x, h - 1), fill=(84, 56, 38, 255))
    d.line((21, h - 22, 34, h - 12), fill=(164, 128, 88, 255), width=2)
    d.line((21, h - 12, 34, h - 22), fill=(164, 128, 88, 255), width=2)
    # The clock face: no hands, a crack across it.
    cx, cy, r = 27, 60, 11
    d.ellipse((cx - r - 2, cy - r - 2, cx + r + 2, cy + r + 2), fill=(84, 80, 88, 255))
    d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=(214, 206, 184, 255))
    for dx, dy in ((0, -r + 2), (r - 2, 0), (0, r - 2), (-r + 2, 0)):
        d.point((cx + dx, cy + dy), fill=(84, 80, 88, 255))
    d.line((cx - 7, cy - 6, cx - 1, cy + 1, cx + 2, cy - 1, cx + 8, cy + 6), fill=(132, 124, 112, 255))
    # The belfry: bare wooden posts with a cross brace, the roof half fallen in.
    for x in (10, 27, 44):
        d.rectangle((x, 14, x + 1, body_top), fill=(108, 76, 52, 255))
    d.line((11, 16, 27, body_top - 2), fill=(108, 76, 52, 255))
    d.line((45, 16, 28, body_top - 2), fill=(108, 76, 52, 255))
    d.rectangle((6, body_top - 2, 49, body_top), fill=(96, 92, 100, 255))
    # What is left of the roof: the left slope, slates missing, the ridge beam bare on the right.
    for y in range(2, 15):
        left = 27 - round(y * 1.6)
        for x in range(left, 28):
            if (x + y) % 7 == 3 and y > 6:
                continue
            img.putpixel((x, y), (70, 74, 92, 255) if (x + 2 * y) % 5 else (90, 96, 116, 255))
    d.line((28, 2, 48, 14), fill=(108, 76, 52, 255))
    d.line((27, 1, 28, 1), fill=(108, 76, 52, 255))
    # Ivy up the left side.
    for y in range(body_top + 6, h - 14, 2):
        x = 9 + ((y * 5) % 4)
        img.putpixel((x, y), (74, 120, 70, 255))
        if y % 6 == 0:
            img.putpixel((x + 1, y + 1), (98, 146, 84, 255))
    return img


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
        fronts.append({'id': name, 'x': x, 'w': w, 'door': x + w // 2})

    clock = tower()
    at = {'x': PLOT['x'] + (PLOT['w'] - clock.width) // 2, 'y': KERB - clock.height, 'w': clock.width, 'h': clock.height}

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
    clock.save(OUT / 'river-tower.png')
    data = {'width': W, 'height': H, 'kerb': KERB, 'road': ROAD, 'bridge': BRIDGE, 'fronts': fronts, 'tower': at, 'props': stands}
    (OUT / 'river.json').write_text(json.dumps(data, indent=1) + '\n', encoding='utf8')
    return data


if __name__ == '__main__':
    print(json.dumps({k: v for k, v in build().items() if k != 'props'}))
