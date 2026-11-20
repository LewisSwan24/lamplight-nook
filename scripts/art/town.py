"""Compose the town's street (road-to-1.4.md D1) from LimeZu Modern Exteriors, with the shop signs drawn by hand.

Reads the raw pack from assets/vendor/ (not in the repo) and writes, into assets/sprites/:
  town-street.png  the ground: roofs behind, pavement and road in front
  town-fronts.png  the seven shop fronts, on a transparent strip as wide as the street
  town-props.png   lamps, benches, pots, trees, a bus stop sign, on a transparent strip
  town-signs.png   the seven signs over the doors, on a transparent strip
  town.json        where each front and door is and the ground each prop stands on, read by app/renderer/game/town.ts
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
    ('ME_Singles_City_Props_16x16_Pot_1.png', 700, KERB + 10),
    ('ME_Singles_City_Props_16x16_Street_Lamp_5.png', 840, KERB + 10),
]


def layout():
    """Each front's left x, width and door x, laid out with an alley between them."""
    out, x = [], ALLEY
    for name, _sheet, (l, t, r, b) in FRONTS:
        w = r - l
        out.append({'id': name, 'x': x, 'w': w, 'door': x + w // 2})
        x += w + ALLEY
    return out, x


def build():
    fronts, width = layout()
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

    OUT.mkdir(parents=True, exist_ok=True)
    ground.save(OUT / 'town-street.png')
    strip.save(OUT / 'town-fronts.png')
    props.save(OUT / 'town-props.png')
    signs.save(OUT / 'town-signs.png')
    data = {'width': width, 'height': H, 'kerb': KERB, 'road': ROAD, 'fronts': fronts, 'props': stands}
    (OUT / 'town.json').write_text(json.dumps(data, indent=1) + '\n', encoding='utf8')
    return fronts, width


if __name__ == '__main__':
    fronts, width = build()
    print(json.dumps({'width': width, 'fronts': fronts}))
