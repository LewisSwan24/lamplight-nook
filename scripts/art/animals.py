"""Cut the back garden's animals out of LimeZu Modern Farm: Malt the dog and three hens.

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


if __name__ == '__main__':
    build()
    print('built dog.png, dog-sleep.png, hens.png')
