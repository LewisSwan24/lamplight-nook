"""Compose the street outside the shop (a strip seen through a small inset) from LimeZu Modern Exteriors.

Reads the raw pack from assets/vendor/ (not in the repo) and writes assets/sprites/street.png.
Run: python3 scripts/art/street.py
"""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
VENDOR = ROOT / 'assets/vendor/Modern_Exteriors_16x16'
PACK = VENDOR / 'ME_Theme_Sorter_16x16'
SINGLES = VENDOR / 'Modern_Exteriors_Complete_Singles_16x16'
OUT = ROOT / 'assets/sprites'
T = 16
# The strip is wider than the inset; the inset pans along it to follow whoever is out.
W, H = 560, 58
# Where the facades stand on the pavement (strip y of their bottom edge); the pavement is below.
KERB = 44

modular = Image.open(PACK / '5_Floor_Modular_Buildings_16x16.png').convert('RGBA')
post = Image.open(PACK / '22_Post_Office_16x16.png').convert('RGBA')
terrain = Image.open(PACK / '2_City_Terrains_16x16.png').convert('RGBA')

# Shop fronts: sheet, pixel rect on it -> left x on the strip. The lower part of each ground floor shows.
# Door positions must match STOPS in app/renderer/game/street.ts.
FRONTS = [
    ('nook', modular, (312, 656, 424, 704), 0),
    ('bakery', modular, (0, 1005, 144, 1072), 128),
    ('library', modular, (304, 592, 448, 640), 288),
    ('post', post, (256, 176, 384, 272), 432),
]

# Street furniture: single sprite file -> where its bottom-left stands on the strip.
PROPS = [
    ('ME_Singles_City_Props_16x16_Street_Lamp_5.png', (114, KERB + 2)),
    ('ME_Singles_City_Props_16x16_Pot_1.png', (54, KERB + 4)),
    ('ME_Singles_City_Props_16x16_Pot_1.png', (82, KERB + 4)),
    ('ME_Singles_City_Props_16x16_Bench_1.png', (298, KERB + 6)),
    ('ME_Singles_City_Props_16x16_Tree_1.png', (264, KERB + 4)),
    ('ME_Singles_City_Props_16x16_Flower_Bush_1.png', (402, KERB + 4)),
    ('22_Post_Office_16x16_Red_Mailbox_1_Front.png', (418, KERB + 6)),
]
# The gaps between buildings: a shaded alley.
ALLEY = (104, 84, 78, 255)


def build():
    img = Image.new('RGBA', (W, H), ALLEY)
    pave = terrain.crop((240, 160, 256, 176))
    for x in range(0, W, T):
        for y in range(KERB - 4, H, T):
            img.alpha_composite(pave, (x, y))
    for _name, sheet, rect, x in FRONTS:
        part = sheet.crop(rect)
        # Only the lower part fits under the top of the strip.
        part = part.crop((0, max(0, part.height - KERB), part.width, part.height))
        img.alpha_composite(part, (x, KERB - part.height))
    for name, (x, bottom) in PROPS:
        part = Image.open(SINGLES / name).convert('RGBA')
        part = part.crop(part.getbbox())
        part = part.crop((0, max(0, part.height - bottom), part.width, part.height))
        img.alpha_composite(part, (x, bottom - part.height))
    OUT.mkdir(parents=True, exist_ok=True)
    img.save(OUT / 'street.png')
    return img


if __name__ == '__main__':
    build()
    print('built street.png')
