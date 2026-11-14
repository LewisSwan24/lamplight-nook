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
# Once the beds are full they follow the seasons (shared/growth.ts, bedFrame): young spring plants and autumn's crops
# from the growth-stage sheets (file, frame), and straw over the soil in winter.
GROWTH_STAGES = FARM / 'Crops_Growth_16x16'
SPRING = [('Cabbage', 3), ('Carrot', 2), ('Radish', 3), ('Strawberry', 3), ('Cauliflower', 3), ('Wheat', 2), ('Radish', 2), ('Strawberry', 2)]
AUTUMN = [('Pumpkin', 6), ('Wheat', 6), ('Carrot', 6), ('Cabbage', 6), ('Pepper', 6), ('Wheat', 5), ('Cauliflower', 6), ('Pumpkin', 5)]
# Straw: pale and dark stalks lying every which way over a low mound.
STRAW_LIGHT, STRAW_DARK = (222, 190, 112, 255), (176, 136, 72, 255)
STRAW = ['...dl.ld.l....', '.ldlldlldldl..', 'ldlldldlldlldl', 'dlldlldldlldld', '.dldlldldldld.']
# A sprout, drawn here: a stem and two leaves.
LEAF, STEM = (112, 176, 84, 255), (70, 124, 60, 255)
SPROUT = {(3, 15): STEM, (3, 14): STEM, (3, 13): STEM, (2, 12): LEAF, (1, 12): LEAF, (1, 11): LEAF, (4, 12): LEAF, (5, 12): LEAF, (5, 11): LEAF, (4, 11): LEAF, (2, 11): LEAF}
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
    for name, pos in [HENHOUSE, DOGHOUSE, BOWL]:
        img.alpha_composite(Image.open(FARM_SINGLES / name).convert('RGBA'), pos)
    for name, pos in [TREE, BENCH, *FLOWERS]:
        img.alpha_composite(single(name), pos)
    fence = fences.crop(FENCE)
    for x in range(-8, W, fence.width - 3):
        img.alpha_composite(fence, (x, H - fence.height + 2))
    OUT.mkdir(parents=True, exist_ok=True)
    img.save(OUT / 'garden.png')
    crop_sheet(crops)
    return img


def stage(name, frame):
    """One growth stage, cropped to what is drawn: the sheets keep the plants in their top half, labels below. A plant
    taller than a cell keeps its bottom (the pumpkin and its leaves, without the tallest leaf)."""
    sheet = Image.open(GROWTH_STAGES / f'{name}_Growth_Stages_16x16.png').convert('RGBA')
    cell = sheet.crop((frame * 16, 0, frame * 16 + 16, sheet.height // 2))
    plant = cell.crop(cell.getbbox())
    return plant.crop((0, max(0, plant.height - 16), plant.width, plant.height))


def crop_sheet(crops):
    """What grows in the beds (app/shared/growth.ts, BEDS and bedFrame): the eight summer plants, a sprout, eight young
    spring plants, eight autumn crops and straw, each with its feet at the bottom left of a 16x16 cell."""
    sheet = Image.new('RGBA', (16 * 26, 16), (0, 0, 0, 0))
    for i in range(8):
        veg = crops.crop(VEG[i % len(VEG)])
        sheet.alpha_composite(veg, (i * 16, 16 - veg.height))
    for (x, y), colour in SPROUT.items():
        sheet.putpixel((8 * 16 + x, y), colour)
    for first, plants in ((9, SPRING), (17, AUTUMN)):
        for i, (name, frame) in enumerate(plants):
            plant = stage(name, frame)
            sheet.alpha_composite(plant, ((first + i) * 16, 16 - plant.height))
    for y, row in enumerate(STRAW):
        for x, c in enumerate(row):
            if c != '.':
                sheet.putpixel((25 * 16 + x, 16 - len(STRAW) + y), STRAW_LIGHT if c == 'l' else STRAW_DARK)
    sheet.save(OUT / 'garden-crops.png')


if __name__ == '__main__':
    build()
    print('built garden.png')
