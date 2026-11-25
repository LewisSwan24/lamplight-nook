"""Compose the town's street (road-to-1.4.md D1) from LimeZu Modern Exteriors, with the shop signs drawn by hand.

Reads the raw pack from assets/vendor/ (not in the repo) and writes, into assets/sprites/:
  town-street.png  the ground: roofs behind, pavement and road in front
  town-fronts.png  the seven shop fronts, on a transparent strip as wide as the street
  town-props.png   lamps, benches, pots, trees, a bus stop sign, on a transparent strip
  town-signs.png   the seven signs over the doors, on a transparent strip
  town.json        where each front, door and the empty lot is and the ground each prop stands on, read by app/renderer/game/town.ts
Run: python scripts/art/town.py
"""
import json
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
VENDOR = ROOT / 'assets/vendor/Modern_Exteriors_16x16'
PACK = VENDOR / 'ME_Theme_Sorter_16x16'
OUT = ROOT / 'assets/sprites'
T = 16

modular = Image.open(PACK / '5_Floor_Modular_Buildings_16x16.png').convert('RGBA')
post = Image.open(PACK / '22_Post_Office_16x16.png').convert('RGBA')
terrain = Image.open(PACK / '2_City_Terrains_16x16.png').convert('RGBA')
fences = Image.open(PACK / '1_Terrains_and_Fences_16x16.png').convert('RGBA')
PROPS_DIR = PACK / '3_City_Props_Singles_16x16'

H = 180
# The bottom of the ground floors, where the pavement starts; the road starts at ROAD.
KERB = 124
ROAD = 152
ALLEY = 8
# The shaded gap between two buildings.
ALLEY_COLOUR = (64, 58, 66, 255)
# An upper floor of brick and windows, cut to each front's width.
UPPER = (0, 482, 288, 532)

# Shop fronts, left to right: id, sheet, rect of the ground floor (with its sign where the sheet has one).
FRONTS = [
    ('cafe', modular, (0, 720, 144, 768)),
    ('study', modular, (312, 656, 424, 704)),
    ('print', modular, (0, 850, 112, 898)),
    ('studio', modular, (128, 850, 240, 898)),
    ('workshop', modular, (0, 785, 144, 833)),
    ('bakery', modular, (0, 1005, 144, 1072)),
    ('post', post, (256, 176, 384, 272)),
]

# Street furniture: single sprite file -> x of its left edge and y of its bottom on the street.
PROPS = [
    ('ME_Singles_City_Props_16x16_Street_Lamp_5.png', 150, KERB + 10),
    ('ME_Singles_City_Props_16x16_Bench_1.png', 270, KERB + 14),
    ('ME_Singles_City_Props_16x16_Street_Lamp_5.png', 420, KERB + 10),
    ('ME_Singles_City_Props_16x16_Tree_1.png', 560, KERB + 12),
    ('ME_Singles_City_Props_16x16_Pot_1.png', 868, KERB + 10),
    ('ME_Singles_City_Props_16x16_Street_Lamp_5.png', 1008, KERB + 10),
]

# The empty lot between the workshop and the bakery (road-to-1.4.md D5): grass behind a stone edge, where the town's
# market stall, park and fountain grow (towngrow.py). Its grass starts LOT_TOP down; behind it, roofs further back.
LOT_AFTER = 'workshop'
LOT_W = 160
LOT_TOP = 76
GRASS = (0, 256)


def layout():
    """Each front's left x, width and door x, laid out with an alley between them, and the lot's left x and width."""
    out, x, lot = [], ALLEY, None
    for name, _sheet, (l, t, r, b) in FRONTS:
        w = r - l
        out.append({'id': name, 'x': x, 'w': w, 'door': x + w // 2})
        x += w + ALLEY
        if name == LOT_AFTER:
            lot = {'x': x, 'w': LOT_W, 'top': LOT_TOP}
            x += LOT_W + ALLEY
    return out, lot, x


def grass_lot(ground, lot):
    """
    Stone-edged grass, nine tiles from the terrain sheet: corners, edges and the middle repeated. Behind it the upper
    floor of a building set further back, in its shade.
    """
    back = modular.crop(UPPER).crop((0, 0, lot['w'], modular.crop(UPPER).height))
    shade = Image.new('RGBA', back.size, (40, 30, 50, 90))
    back.alpha_composite(shade)
    ground.paste(back, (lot['x'], lot['top'] - back.height))
    gx, gy = GRASS
    tile = lambda c, r: fences.crop((gx + c * T, gy + r * T, gx + c * T + T, gy + r * T + T))
    cols = lot['w'] // T
    rows = (KERB - lot['top']) // T
    for r in range(rows):
        for c in range(cols):
            cc = 0 if c == 0 else 2 if c == cols - 1 else 1
            rr = 0 if r == 0 else 2 if r == rows - 1 else 1
            ground.paste(tile(cc, rr), (lot['x'] + c * T, lot['top'] + r * T))


GARDEN_DIR = PACK / '17_Garden_Singles_16x16'


def city(name):
    return trimmed(PROPS_DIR / f'ME_Singles_City_Props_16x16_{name}.png')


def garden(name):
    return trimmed(GARDEN_DIR / f'ME_Singles_Garden_16x16_{name}.png')


def trimmed(path):
    img = Image.open(path).convert('RGBA')
    return img.crop(img.getbbox())


# Hand-drawn: a hanging sign for each shop that does well (x outline, k wood, G gold, the rest the icon), and a string
# of little flags. One icon per shop: a cup, a book, a printed page, a palette, a wrench, a loaf for the bakery once it
# opens (plan-1.6.md F1), and an envelope for the post office (F2).
SIGN_ICONS = {
    'cafe': ['.......', '.wwwww.', '.wwwwwww', '.wwwww.w', '.wwwwww.', '..www..', '.xxxxx.'],
    'study': ['.......', 'ww...ww', 'wlwxwlw', 'wwwxwww', 'wlwxwlw', 'wwwxwww', 'uuuuuuu'],
    'print': ['.wwwww.', '.wxxxw.', '.wwwww.', '.wxxww.', '.wwwww.', '.wxxxw.', '.wwwww.'],
    'studio': ['..ooo..', '.ooooo.', 'oroooro', 'oooo.oo', 'ouooo..', '.ooo...', '.......'],
    'workshop': ['.....ll', '....l.l', '...lll.', '..lll..', '.lll...', 'lll....', 'll.....'],
    'bakery': ['.......', '.kkkkk.', 'koooook', 'kokokok', 'koooook', '.kkkkk.', '.......'],
    'post': ['.......', 'xxxxxxx', 'xwxwxwx', 'xwwxwwx', 'xwwwwwx', 'xxxxxxx', '.......'],
}
SIGN_COLORS = {'x': (42, 34, 51, 255), 'k': (120, 80, 48, 255), 'G': (232, 184, 74, 255), 'w': (250, 246, 236, 255),
               'u': (72, 104, 160, 255), 'o': (226, 196, 150, 255), 'r': (200, 72, 60, 255), 'l': (190, 190, 196, 255)}
# The workshop's pot goes right of its door, clear of the tree in front of it.
POT_SIDE = {'workshop': 14}
FLAGS = [(200, 72, 60, 255), (232, 184, 74, 255), (104, 150, 96, 255), (72, 104, 160, 255)]


def sign(shop):
    """A wooden board with a gold edge and the shop's icon, hanging from an iron bracket: 13 wide, 18 high."""
    img = Image.new('RGBA', (13, 18), (0, 0, 0, 0))
    px = lambda x, y, c: img.putpixel((x, y), SIGN_COLORS[c])
    for x in range(0, 13):
        px(x, 0, 'x')  # the bracket
    for y in (1, 2):
        px(2, y, 'x')
        px(10, y, 'x')
    for y in range(3, 18):
        for x in range(0, 13):
            edge = x in (0, 12) or y in (3, 17)
            gold = x in (1, 11) or y in (4, 16)
            px(x, y, 'x' if edge else 'G' if gold else 'k')
    for y, row in enumerate(SIGN_ICONS[shop]):
        for x, c in enumerate(row):
            if c != '.':
                px(3 + x, 7 + y, c)
    return img


def bunting(width):
    """Little flags on a string that sags between its two ends."""
    img = Image.new('RGBA', (width, 6), (0, 0, 0, 0))
    for x in range(width):
        sag = round(2 * (1 - ((2 * x / (width - 1)) - 1) ** 2))
        img.putpixel((x, sag), SIGN_COLORS['x'])
        # A flag every eight pixels: four wide under the string, two wide below that.
        step = x % 8
        if 2 <= step <= 5:
            colour = FLAGS[(x // 8) % len(FLAGS)]
            img.putpixel((x, sag + 1), colour)
            img.putpixel((x, sag + 2), colour)
            if step in (3, 4):
                img.putpixel((x, sag + 3), colour)
    return img


def grow_pieces(fronts, lot):
    """
    What the town gathers (road-to-1.4.md D5), as (piece, image, x of its left, y of its bottom, shop or None). The street
    pieces stand on the pavement or in the lot; each shop front gets a pot by the door, a new sign and a string of flags.
    """
    L = lot['x']
    out = [
        ('lamps', city('Street_Lamp_5'), 510, KERB + 10, None),
        ('lamps', city('Street_Lamp_5'), 662, KERB + 10, None),
        ('bench', city('Bench_1'), 476, KERB + 14, None),
        ('flowers', garden('Big_Red_Flower_Vase'), 28, KERB + 12, None),
        ('flowers', garden('Big_Yellow_Flower_Vase'), 364, KERB + 12, None),
        ('flowers', garden('Big_Pink_Flower_Vase'), 948, KERB + 12, None),
        ('stall', garden('Big_Wood_Cart_Full_1'), L + 6, 121, None),
        ('park', city('Tree_2'), L + 40, 104, None),
        ('park', city('Tree_3'), L + 118, 104, None),
        ('park', city('Flower_Bush_1'), L + 42, 122, None),
        ('park', city('Flower_Bush_2'), L + 116, 122, None),
        ('fountain', city('Fountain_1'), L + 64, 119, None),
    ]
    for f in fronts:
        if f['id'] not in SIGN_ICONS:
            continue
        out.append(('pot', city('Pot_3'), f['door'] + POT_SIDE.get(f['id'], -24), KERB + 1, f['id']))
        out.append(('sign', sign(f['id']), f['x'] + f['w'] - 18, 98, f['id']))
        flags = bunting(f['w'] - 8)
        out.append(('bunting', flags, f['x'] + 4, 74 + flags.height, f['id']))
    return out


def grow_sheet(fronts, lot):
    """Pack the pieces into one sheet, row by row, and say where each is cut from and where it stands."""
    pieces = grow_pieces(fronts, lot)
    sheet_w = 256
    x = y = row = 0
    placed = []
    for piece, img, left, bottom, shop in pieces:
        if x + img.width > sheet_w:
            x, y, row = 0, y + row + 1, 0
        placed.append((piece, img, x, y, left, bottom, shop))
        x += img.width + 1
        row = max(row, img.height)
    sheet = Image.new('RGBA', (sheet_w, y + row), (0, 0, 0, 0))
    out = []
    for piece, img, sx, sy, left, bottom, shop in placed:
        sheet.alpha_composite(img, (sx, sy))
        part = {'id': piece, 'sx': sx, 'sy': sy, 'w': img.width, 'h': img.height, 'x': left, 'y': bottom - img.height}
        if shop:
            part['shop'] = shop
        # On the pavement a walker goes round it, grown or not, so a walk stays the same as the town grows.
        if bottom > KERB + 4:
            foot = img.crop((0, img.height - 4, img.width, img.height)).getbbox()
            part['foot'] = {'left': left + foot[0], 'right': left + foot[2], 'top': bottom - 4, 'bottom': bottom}
        out.append(part)
    return sheet, out


def build():
    fronts, lot, width = layout()
    ground = Image.new('RGBA', (width, H), (90, 84, 92, 255))
    roof = modular.crop((330, 40, 346, 56))
    pave = terrain.crop((240, 160, 256, 176))
    asphalt = terrain.crop((32, 32, 48, 48))
    for x in range(0, width, T):
        for y in range(0, KERB, T):
            ground.alpha_composite(roof, (x, y))
        for y in range(KERB, ROAD, T):
            ground.alpha_composite(pave, (x, y))
        for y in range(ROAD, H, T):
            ground.alpha_composite(asphalt, (x, y))
    grass_lot(ground, lot)

    strip = Image.new('RGBA', (width, H), (0, 0, 0, 0))
    upper = modular.crop(UPPER)
    tops = []
    for f, (_name, sheet, rect) in zip(fronts, FRONTS):
        part = sheet.crop(rect)
        top = KERB - part.height
        up = upper.crop((0, 0, f['w'], upper.height))
        strip.alpha_composite(up, (f['x'], top - up.height))
        strip.alpha_composite(part, (f['x'], top))
        tops.append(top - up.height)
    # The alleys, from the lowest roof line down to the pavement.
    for f in fronts:
        for x in (f['x'] - ALLEY, f['x'] + f['w']):
            if 0 <= x < width:
                ground.paste(ALLEY_COLOUR, (x, min(tops), min(x + ALLEY, width), KERB))

    props = Image.new('RGBA', (width, H), (0, 0, 0, 0))
    stands = []
    for name, x, bottom in PROPS:
        part = Image.open(PROPS_DIR / name).convert('RGBA')
        part = part.crop(part.getbbox())
        props.alpha_composite(part, (x, bottom - part.height))
        # What a walker bumps into: the bottom few rows of what is drawn there.
        foot = part.crop((0, part.height - 4, part.width, part.height)).getbbox()
        stands.append({'name': name.split('16x16_')[-1][:-4], 'left': x + foot[0], 'right': x + foot[2], 'top': bottom - 4, 'bottom': bottom})

    signs = Image.new('RGBA', (width, H), (0, 0, 0, 0))
    sheet, grow = grow_sheet(fronts, lot)

    OUT.mkdir(parents=True, exist_ok=True)
    ground.save(OUT / 'town-street.png')
    strip.save(OUT / 'town-fronts.png')
    props.save(OUT / 'town-props.png')
    signs.save(OUT / 'town-signs.png')
    sheet.save(OUT / 'town-grow.png')
    data = {'width': width, 'height': H, 'kerb': KERB, 'road': ROAD, 'fronts': fronts, 'lot': lot, 'props': stands, 'grow': grow}
    (OUT / 'town.json').write_text(json.dumps(data, indent=1) + '\n', encoding='utf8')
    return fronts, lot, width


if __name__ == '__main__':
    fronts, lot, width = build()
    print(json.dumps({'width': width, 'lot': lot, 'fronts': fronts}))
