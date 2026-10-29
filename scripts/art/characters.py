"""Build the shop staff sprite sheets from the LimeZu character generator layers.

Reads the raw pack from assets/vendor/ (not in the repo) and writes our modified sheets to
assets/sprites/. Run: python3 scripts/art/characters.py
"""
import colorsys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
GEN = ROOT / 'assets/vendor/2_Characters/Character_Generator'
CAT = ROOT / 'assets/vendor/3_Animated_objects/16x16/spritesheets/animated_cat.png'
OUT = ROOT / 'assets/sprites'
# Every generator sheet is 56 x 20.5 frames of 16 x 32; some body sheets carry extra columns.
SHEET_SIZE = (896, 656)

# Layers are drawn bottom to top. `recolor` shifts every pixel whose hue falls in
# [from_lo, from_hi] (degrees) of that layer to the target colour, keeping its shading.
STAFF = {
    'adeng': {
        'layers': ['Bodies/16x16/Body_03.png', 'Eyes/16x16/Eyes_01.png',
                   'Outfits/16x16/Outfit_09_01.png', 'Hairstyles/16x16/Hairstyle_04_04.png'],
        'recolor': {'Outfits/16x16/Outfit_09_01.png': [((340, 20), '#B5653B')]},
    },
    'xiaoju': {
        'layers': ['Bodies/16x16/Body_02.png', 'Eyes/16x16/Eyes_01.png',
                   'Outfits/16x16/Outfit_08_01.png', 'Hairstyles/16x16/Hairstyle_11_03.png'],
        'scarf': '#E98A3A',
    },
    'laoshi': {
        'layers': ['Bodies/16x16/Body_04.png', 'Eyes/16x16/Eyes_01.png',
                   'Outfits/16x16/Outfit_05_01.png', 'Hairstyles/16x16/Hairstyle_06_05.png',
                   'Accessories/16x16/Accessory_15_Glasses_01.png'],
    },
}

# Neighbours who drop in now and then (app/renderer/game/guests.ts): Auntie Gui from the bakery and
# Axin the postman, with his mail bag.
GUESTS = {
    'baker': {
        'layers': ['Bodies/16x16/Body_01.png', 'Eyes/16x16/Eyes_01.png',
                   'Outfits/16x16/Outfit_33_01.png', 'Hairstyles/16x16/Hairstyle_11_05.png'],
    },
    'postman': {
        'layers': ['Bodies/16x16/Body_02.png', 'Eyes/16x16/Eyes_01.png',
                   'Outfits/16x16/Outfit_19_01.png', 'Hairstyles/16x16/Hairstyle_05_04.png',
                   'Accessories/16x16/Accessory_03_Backpack_01.png'],
    },
}


def hex_rgb(h):
    return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))


def in_range(hue, lo, hi):
    return lo <= hue <= hi if lo <= hi else hue >= lo or hue <= hi


def recolor(img, rules):
    px = img.load()
    for (lo, hi), target in rules:
        th, ts, tv = colorsys.rgb_to_hsv(*(c / 255 for c in hex_rgb(target)))
        for y in range(img.height):
            for x in range(img.width):
                r, g, b, a = px[x, y]
                if not a:
                    continue
                h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
                if s < 0.25 or not in_range(h * 360, lo, hi):
                    continue
                # Keep the source shading: scale the target brightness by how bright this pixel is.
                nr, ng, nb = colorsys.hsv_to_rgb(th, ts, min(1, tv * v / 0.75))
                px[x, y] = (round(nr * 255), round(ng * 255), round(nb * 255), a)
    return img


def add_scarf(sheet, outfit, colour):
    """Paint the top row of the outfit in every frame (the collar) as a scarf."""
    rgb = hex_rgb(colour)
    dark = tuple(round(c * 0.72) for c in rgb)
    o, s = outfit.load(), sheet.load()
    for fy in range(0, sheet.height - 31, 32):
        for fx in range(0, sheet.width, 16):
            tops = {}
            for x in range(fx, fx + 16):
                for y in range(fy, fy + 32):
                    if o[x, y][3]:
                        tops[x] = y
                        break
            if not tops:
                continue
            row = min(tops.values())
            for x, y in tops.items():
                if y <= row + 1:
                    s[x, y] = (*rgb, 255)
                    if o[x, y + 1][3] and y + 1 <= row + 1:
                        s[x, y + 1] = (*dark, 255)


def build(name, recipe):
    sheet = None
    outfit = None
    for rel in recipe['layers']:
        layer = Image.open(GEN / rel).convert('RGBA').crop((0, 0, *SHEET_SIZE))
        if rel in recipe.get('recolor', {}):
            layer = recolor(layer, recipe['recolor'][rel])
        if 'Outfits' in rel:
            outfit = layer
        sheet = layer.copy() if sheet is None else Image.alpha_composite(sheet, layer)
    if 'scarf' in recipe:
        add_scarf(sheet, outfit, recipe['scarf'])
    OUT.mkdir(parents=True, exist_ok=True)
    sheet.save(OUT / f'{name}.png')
    return sheet


# Chestnut fur ramp for the shop cat, dark to light; the pack's cat is blue-grey.
CHESTNUT = ['#3E2A20', '#6B432C', '#7A4E33', '#8A5A3C', '#A87550']


def build_cat():
    """Recolour the pack's grey cat (12 frames of 48x16, lying and wagging its tail) to chestnut."""
    img = Image.open(CAT).convert('RGBA')
    ramp = [hex_rgb(c) for c in CHESTNUT]
    greys = sorted({p[:3] for p in img.getdata() if p[3] and p[2] > p[0] + 10}, key=sum)
    lut = {g: ramp[min(len(ramp) - 1, i * len(ramp) // len(greys))] for i, g in enumerate(greys)}
    px = img.load()
    for y in range(img.height):
        for x in range(img.width):
            r, g, b, a = px[x, y]
            if a and (r, g, b) in lut:
                px[x, y] = (*lut[(r, g, b)], a)
    img.save(OUT / 'cat.png')


if __name__ == '__main__':
    for name, recipe in {**STAFF, **GUESTS}.items():
        build(name, recipe)
        print('built', name)
    build_cat()
    print('built cat')
