"""Compose the back garden (320x180) from LimeZu Modern Farm and Modern Exteriors.

Reads the raw packs from assets/vendor/ (not in the repo) and writes assets/sprites/garden.png.
Places where the staff stand and sit match app/renderer/game/garden.ts.
Run: python3 scripts/art/garden.py
"""
import random
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
FARM = ROOT / 'assets/vendor/Modern_Farm/16x16'
EXT = ROOT / 'assets/vendor/Modern_Exteriors_16x16'
SINGLES = EXT / 'Modern_Exteriors_Complete_Singles_16x16'
OUT = ROOT / 'assets/sprites'
T = 16
W, H = 320, 180
GRASS = (71, 151, 87, 255)

terrain = Image.open(FARM / '1_Terrains_16x16.png').convert('RGBA')
fences = Image.open(FARM / '2_Fences_16x16.png').convert('RGBA')
props = Image.open(FARM / '3_Props_and_Buildings_16x16.png').convert('RGBA')
crops = Image.open(FARM / '4_Crops_16x16.png').convert('RGBA')
modular = Image.open(EXT / 'ME_Theme_Sorter_16x16/5_Floor_Modular_Buildings_16x16.png').convert('RGBA')
city = Image.open(EXT / 'ME_Theme_Sorter_16x16/2_City_Terrains_16x16.png').convert('RGBA')

# The shop's back wall along the top, and the back door in it (an animated sprite the game places here).
WALL = (312, 656, 352, 704)
WALL_H = 48
BACK_DOOR = (152, 16)
# A paved path from the back door down to a little square in the middle of the lawn.
PAVE = (240, 160, 256, 176)
PATH = [(152, y) for y in range(48, 112, T)] + [(x, 112) for x in range(120, 216, T)]

# Planter boxes with vegetables, left of the path.
PLANTER = (80, 234, 112, 256)
PLANTERS = [(20, 70), (54, 70), (20, 98), (54, 98)]
VEG = [(65, 178, 78, 192), (97, 178, 110, 192), (81, 83, 92, 93), (64, 84, 77, 94), (113, 81, 128, 96), (96, 81, 112, 96)]
# A tree with a bench under it, right of the path; flowers along the front.
TREE = ('ME_Singles_City_Props_16x16_Tree_11.png', (236, 46))
BENCH = ('ME_Singles_Garden_16x16_Small_Bench_Vertical.png', (288, 98))
FLOWERS = [
    ('ME_Singles_City_Props_16x16_Flower_Bush_1.png', (112, 136)),
    ('ME_Singles_City_Props_16x16_Flower_Bush_3.png', (132, 138)),
    ('ME_Singles_City_Props_16x16_Flower_Bush_5.png', (152, 136)),
    ('ME_Singles_City_Props_16x16_Flowers_1.png', (112, 48)),
    ('ME_Singles_City_Props_16x16_Flowers_3.png', (96, 64)),
]
# The animals' homes (app/renderer/game/animals.ts): a henhouse against the wall right of the path,
# Malt's doghouse in the corner beyond the tree, with a bowl.
FARM_SINGLES = FARM / 'Single_Files_16x16/Props_and_Buildings_16x16'
HENHOUSE = ('Henhouse_16x16.png', (172, 22))
DOGHOUSE = ('Doghouse_16x16.png', (284, 42))
BOWL = ('Dog_Bowl_Red_Full_16x16.png', (266, 82))
# Grass tufts and a fence along the bottom.
TUFTS = [(453, 17, 460, 30), (469, 17, 476, 30), (389, 21, 396, 29), (452, 38, 460, 44), (468, 38, 476, 44), (404, 53, 411, 59)]
FENCE = (288, 96, 391, 120)


def single(name):
    img = Image.open(SINGLES / name).convert('RGBA')
    return img.crop(img.getbbox())


def build():
    img = Image.new('RGBA', (W, H), GRASS)
    rng = random.Random(7)
    for _ in range(46):
        tuft = props.crop(rng.choice(TUFTS))
        img.alpha_composite(tuft, (rng.randrange(0, W - 8), rng.randrange(WALL_H + 4, H - 20)))
    wall = modular.crop(WALL)
    for x in range(0, W, wall.width):
        img.alpha_composite(wall, (x, 0))
    # The doorway behind the animated door: warm light from inside the shop.
    img.paste((235, 196, 140, 255), (BACK_DOOR[0] + 1, BACK_DOOR[1] + 2, BACK_DOOR[0] + 15, BACK_DOOR[1] + 32))
    pave = city.crop(PAVE)
    for pos in PATH:
        img.alpha_composite(pave, pos)
    planter = fences.crop(PLANTER)
    for i, (x, y) in enumerate(PLANTERS):
        img.alpha_composite(planter, (x, y))
        for j in range(2):
            veg = crops.crop(VEG[(i * 2 + j) % len(VEG)])
            img.alpha_composite(veg, (x + 2 + j * 14, y + 14 - veg.height))
    for name, pos in [HENHOUSE, DOGHOUSE, BOWL]:
        img.alpha_composite(Image.open(FARM_SINGLES / name).convert('RGBA'), pos)
    for name, pos in [TREE, BENCH, *FLOWERS]:
        img.alpha_composite(single(name), pos)
    fence = fences.crop(FENCE)
    for x in range(-8, W, fence.width - 3):
        img.alpha_composite(fence, (x, H - fence.height + 2))
    OUT.mkdir(parents=True, exist_ok=True)
    img.save(OUT / 'garden.png')
    return img


if __name__ == '__main__':
    build()
    print('built garden.png')
