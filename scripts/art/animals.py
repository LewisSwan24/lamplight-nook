"""Cut the back garden's animals out of LimeZu Modern Farm: Malt the dog and three hens; and the street shops'.

Reads the raw pack from assets/vendor/ (not in the repo) and writes assets/sprites/dog.png,
assets/sprites/dog-sleep.png and assets/sprites/hens.png. Frame layouts match app/renderer/game/animals.ts.
Run: python3 scripts/art/animals.py
"""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
ANIMALS = ROOT / 'assets/vendor/Modern_Farm/16x16/Animals_16x16'
OUT = ROOT / 'assets/sprites'

# Dog sheets: 48x32 frames, 24 to a row (6 each facing right, up, left, down; barking has 3 each).
# Rows of frames sit under a label strip, every 64 pixels: idle, walk, run, eat, bark, then the doghouse.
DOG = ANIMALS / 'Dogs/Dog_Labrador_Brown_16x16.png'
DOG_ROWS = {'idle': 64, 'walk': 128, 'eat': 256, 'bark': 320}
# The same dog asleep in its doghouse: 32x48 frames, 8 to a row, one row per dog.
DOGHOUSE = ANIMALS / 'Dogs/Dogs_Doghouse_Sleeping_16x16.png'
DOGHOUSE_ROW = 0
# Hens: 16x16 frames, 24 to a row (6 each facing right, up, left, down); rows: idle, walk, then
# pecking (2 frames each way) and sitting.
HENS = ['Chicken_Brown_16x16.png', 'Chicken_White_16x16.png', 'Chicken_Golden_16x16.png']


def build():
    OUT.mkdir(parents=True, exist_ok=True)
    src = Image.open(DOG).convert('RGBA')
    dog = Image.new('RGBA', (48 * 24, 32 * len(DOG_ROWS)))
    for i, y in enumerate(DOG_ROWS.values()):
        dog.alpha_composite(src.crop((0, y, 48 * 24, y + 32)), (0, i * 32))
    dog.save(OUT / 'dog.png')
    house = Image.open(DOGHOUSE).convert('RGBA')
    house.crop((0, DOGHOUSE_ROW * 48, 32 * 8, DOGHOUSE_ROW * 48 + 48)).save(OUT / 'dog-sleep.png')
    hens = Image.new('RGBA', (16 * 24, 16 * 3 * len(HENS)))
    for i, name in enumerate(HENS):
        sheet = Image.open(ANIMALS / 'Chickens_and_Roosters' / name).convert('RGBA')
        hens.alpha_composite(sheet.crop((0, 16, 16 * 24, 64)), (0, i * 48))
    hens.save(OUT / 'hens.png')


# The street shops' animals (plan-1.9.md I3), written as shop-dog.png, pigeon.png and fishbowl.png.
# Bun, the bakery's dog: the pack's orange Basenji, 32x32 frames, 24 to a row (6 each facing right, up, left, down).
# Its sheet has rows every 64 pixels under label strips: idle, walk, run, eat, bark (3 frames each way), impatient
# (6 frames, facing down) and asleep (8 frames, curled up). Kept: idle, bark, impatient and asleep.
BASENJI = ANIMALS / 'Dogs/Dog_Basenji_Orange_16x16.png'
BASENJI_ROWS = {'idle': 64, 'bark': 320, 'look': 384, 'sleep': 448}
# Stamp, the post office's pigeon: the pack's crow, dyed pigeon grey with a green ring at the neck. 32x32 frames,
# 6 to a row: sitting facing left, sitting facing right, flying left, flying right.
CROWS = ROOT / 'assets/vendor/Modern_Exteriors_16x16/Animated_16x16/Animated_sheets_16x16'
CROW_ROWS = ['Crow_idle_Left_16x16.png', 'Crow_idle_Right_16x16.png', 'Crow_Flap_Left_16x16.png', 'Crow_Flap_Right_16x16.png']
# The crow's greys, darkest first, and the pigeon's in their place; its pale eye turns orange, its dark feet pink.
CROW_GREYS = [(58, 58, 80), (70, 70, 94), (86, 89, 114), (108, 110, 133), (125, 127, 153), (139, 139, 171)]
PIGEON_GREYS = [(66, 70, 84), (118, 124, 138), (148, 154, 166), (176, 181, 191), (202, 206, 214), (228, 231, 236)]
PIGEON_EYE, PIGEON_FEET, PIGEON_RING = (232, 140, 60), (200, 122, 122), (86, 170, 120)


def pigeon_frame(frame, facing):
    """One crow frame, dyed; then the two body pixels just behind the eye, and the two under them, go green."""
    out = frame.copy()
    px = out.load()
    eye = None
    for y in range(out.height):
        for x in range(out.width):
            r, g, b, a = px[x, y]
            if not a:
                continue
            if (r, g, b) in CROW_GREYS:
                px[x, y] = (*PIGEON_GREYS[CROW_GREYS.index((r, g, b))], a)
            elif r > 200 and g > 200:
                px[x, y] = (*PIGEON_EYE, a)
                eye = (x, y)
            elif r > g + 8:
                px[x, y] = (*PIGEON_FEET, a)
    if eye:
        back = 1 if facing == 'left' else -1
        for dx in (2 * back, 3 * back):
            for dy in (1, 2):
                x, y = eye[0] + dx, eye[1] + dy
                if 0 <= x < out.width and 0 <= y < out.height and px[x, y][3] and px[x, y][:3] != PIGEON_GREYS[0]:
                    px[x, y] = (*PIGEON_RING, 255)
    return out


# Cinnabar, the studio's goldfish, in a round bowl on Umber's windowsill: drawn here, 16x16, 12 frames of one swim
# across and back. The pack's fish are shadows under water, which a bowl this small cannot show.
GLASS, GLASS_HI = (196, 222, 230, 255), (240, 250, 252, 255)
WATER, WATER_D = (150, 200, 222, 255), (124, 178, 204, 255)
SAND, WEED = (214, 190, 140, 255), (92, 150, 96, 255)
FISH, FISH_D, FISH_HI = (226, 72, 40, 255), (176, 44, 30, 255), (250, 150, 96, 255)
OUTLINE = (66, 70, 84, 255)


def fishbowl_frame(i):
    img = Image.new('RGBA', (16, 16))
    px = img.load()
    cx, cy, r = 7.5, 9, 6.6
    for y in range(16):
        for x in range(16):
            d = ((x - cx) ** 2 + (y - cy) ** 2) ** 0.5
            if y < 4:
                continue
            if d <= r - 1:
                px[x, y] = WATER if y > 5 else GLASS
            elif d <= r + 0.4:
                px[x, y] = OUTLINE
    for x in range(5, 11):
        px[x, 3] = OUTLINE  # the rim
        px[x, 4] = GLASS_HI
    for y in range(13, 15):
        for x in range(3, 13):
            if px[x, y] == WATER:
                px[x, y] = SAND
    for y in (10, 11, 12):
        px[4 if y != 11 else 5, y] = WEED
    for y in range(7, 13):
        if px[2, y] == WATER:
            px[2, y] = WATER_D
    px[11, 6], px[12, 7] = GLASS_HI, GLASS_HI
    # Over to the right in six frames, then back.
    xs = [4, 5, 6, 7, 8, 9, 9, 8, 7, 6, 5, 4]
    right = i < 6
    fx, fy = xs[i], 9 if i % 3 else 8
    body = [(0, 0), (1, 0), (2, 0), (0, 1), (1, 1), (2, 1)]
    for dx, dy in body:
        x = fx + (dx if right else 2 - dx)
        px[x, fy + dy] = FISH if dy == 0 else FISH_D
    px[fx + (2 if right else 0), fy] = FISH_HI
    tail = fx - 1 if right else fx + 3
    px[tail, fy + (i % 2)] = FISH
    if i in (2, 3, 8, 9):
        px[fx + 1, fy - 2 - (i % 2)] = GLASS_HI  # a bubble
    return img


def build_shop_animals():
    src = Image.open(BASENJI).convert('RGBA')
    dog = Image.new('RGBA', (32 * 24, 32 * len(BASENJI_ROWS)))
    for i, y in enumerate(BASENJI_ROWS.values()):
        dog.alpha_composite(src.crop((0, y, 32 * 24, y + 32)), (0, i * 32))
    dog.save(OUT / 'shop-dog.png')
    pigeon = Image.new('RGBA', (32 * 6, 32 * len(CROW_ROWS)))
    for row, name in enumerate(CROW_ROWS):
        sheet = Image.open(CROWS / name).convert('RGBA')
        facing = 'left' if 'Left' in name else 'right'
        for i in range(6):
            frame = sheet.crop((i * 32, 0, i * 32 + 32, sheet.height))
            pigeon.alpha_composite(pigeon_frame(frame, facing), (i * 32, row * 32 + 32 - frame.height))
    pigeon.save(OUT / 'pigeon.png')
    bowl = Image.new('RGBA', (16 * 12, 16))
    for i in range(12):
        bowl.alpha_composite(fishbowl_frame(i), (i * 16, 0))
    bowl.save(OUT / 'fishbowl.png')


if __name__ == '__main__':
    build()
    build_shop_animals()
    print('built dog.png, dog-sleep.png, hens.png, shop-dog.png, pigeon.png, fishbowl.png')
