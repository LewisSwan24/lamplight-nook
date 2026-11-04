"""Holiday decorations and weather touches for the cafe: transparent 320x180 overlays laid over cafe.png by the game.

Halloween and Christmas pieces come from LimeZu Modern Interiors (assets/vendor/, not in the repo);
the Lunar New Year lanterns and couplets and the weather touches are drawn here.
Writes assets/sprites/decor-<holiday>.png and assets/sprites/weather-<sky>.png.
Run: python3 scripts/art/decor.py
"""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
THEMES = ROOT / 'assets/vendor/1_Interiors/16x16/Theme_Sorter'
OUT = ROOT / 'assets/sprites'
W, H = 320, 180

halloween = Image.open(THEMES / '11_Halloween_16x16.png').convert('RGBA')
christmas = Image.open(THEMES / '15_Christmas_16x16.png').convert('RGBA')

# Holiday -> pieces: (sheet, pixel rect on it, top-left on the canvas). Kept clear of the anchors in layout.ts.
PIECES = {
    'halloween': [
        (halloween, (14, 4, 62, 22), (128, 17)),  # bunting with bats and ghosts, on the wall
        (halloween, (128, 8, 160, 24), (24, 26)),  # two jack-o'-lanterns on the window sill
        (halloween, (83, 7, 93, 22), (28, 97)),  # a small pumpkin beside the pile
        (halloween, (163, 6, 189, 28), (2, 90)),  # a pile of pumpkins by the bookshelf
    ],
    'christmas': [
        (christmas, (17, 12, 47, 47), (288, 143)),  # the tree, in the corner past the lamp
        (christmas, (0, 100, 30, 140), (288, 139)),  # its lights and star
        (christmas, (174, 6, 194, 28), (264, 18)),  # a wreath on the wall by the door
        (christmas, (226, 109, 238, 128), (150, 66)),  # a little tree on the big table
        (christmas, (147, 10, 157, 25), (136, 22)),  # stockings along the wall
        (christmas, (163, 10, 173, 25), (150, 22)),
        (christmas, (147, 10, 157, 25), (164, 22)),
    ],
}

# Lunar New Year, drawn by hand: r red, d dark red, g gold, s string.
LANTERN = [
    '....s....',
    '....s....',
    '...ggg...',
    '.rrrrrrr.',
    'rrdrrrdrr',
    'rrdrrrdrr',
    'rrdrrrdrr',
    '.rrrrrrr.',
    '...ggg...',
    '....g....',
    '...g.g...',
    '...g.g...',
]
# A diamond of red paper with a gold dot, the 'fu' sign hung upside down on the door.
FU = ['...r...', '..rrr..', '.rrgrr.', 'rrgggrr', '.rrgrr.', '..rrr..', '...r...']
COLORS = {'r': (210, 60, 42, 255), 'd': (160, 38, 28, 255), 'g': (226, 176, 74, 255), 's': (90, 59, 40, 255)}
# Couplets either side of the door: red strips with gold flecks.
COUPLETS = [(283, 18), (305, 18)]


def draw(img, rows, x, y):
    for dy, row in enumerate(rows):
        for dx, c in enumerate(row):
            if c in COLORS:
                img.putpixel((x + dx, y + dy), COLORS[c])


def new_year():
    img = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    for x in (132, 168):
        draw(img, LANTERN, x, 16)
    draw(img, FU, 292, 22)
    for x, y in COUPLETS:
        for dy in range(26):
            for dx in range(3):
                img.putpixel((x + dx, y + dy), COLORS['r'])
            if dy % 5 == 2:
                img.putpixel((x + 1, y + dy), COLORS['g'])
    return img


# Weather touches, drawn by hand: u umbrella, h handle, w water, l leaf, o dark leaf, p petal.
UMBRELLA = [
    '..hh.',
    '.h..h',
    '....h',
    '...u.',
    '..uuu',
    '..udu',
    '.uudu',
    '.uudu',
    '.uudu',
    '..udu',
    '..uuu',
    '...u.',
    '...h.',
]
WEATHER_COLORS = {
    'u': (74, 110, 168, 255), 'd': (52, 80, 130, 255), 'h': (90, 59, 40, 255),
    'w': (159, 184, 214, 150), 'l': (217, 130, 43, 255), 'o': (166, 84, 34, 255), 'p': (246, 193, 207, 255),
}
# A wet umbrella leaning right of the door, with a puddle under it.
UMBRELLA_POS = (306, 34)
# Fallen leaves and petals: (x, y, colour) for little two-pixel pieces on the floor and the window sills.
LEAVES = [(286, 54, 'l'), (299, 58, 'o'), (308, 52, 'l'), (276, 60, 'o'), (292, 63, 'l'), (281, 50, 'o'), (30, 27, 'l'), (66, 27, 'o'), (209, 27, 'l')]
PETALS = [(26, 27, 'p'), (40, 27, 'p'), (62, 27, 'p'), (74, 27, 'p'), (205, 27, 'p'), (217, 27, 'p'), (34, 50, 'p'), (58, 54, 'p'), (88, 48, 'p'), (46, 58, 'p'), (22, 62, 'p')]
# The window sills in cafe.png: the x range of the windows, the row of the sill's top and its wood colours.
SILLS = (range(16, 84), range(197, 225))
SILL_Y = 29
SILL_WOOD = {(181, 117, 77), (199, 140, 89)}
SNOW = (255, 255, 255, 255)


def put(img, x, y, c, w=1):
    for dx in range(w):
        img.putpixel((x + dx, y), WEATHER_COLORS[c])


def weather():
    rain = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    draw_with(rain, UMBRELLA, *UMBRELLA_POS, WEATHER_COLORS)
    x, y = UMBRELLA_POS
    for dx in range(-2, 8):
        rain.putpixel((x + dx, y + len(UMBRELLA)), WEATHER_COLORS['w'])
    for dx in range(0, 5):
        rain.putpixel((x + dx, y + len(UMBRELLA) + 1), WEATHER_COLORS['w'])

    snow = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    cafe = Image.open(OUT / 'cafe.png').convert('RGB')
    # Snow piles on the window sills: wherever the sill's wood shows, a white line on top, a little higher here and there.
    for sill in SILLS:
        for x in sill:
            if cafe.getpixel((x, SILL_Y)) in SILL_WOOD:
                snow.putpixel((x, SILL_Y - 1), SNOW)
                if x % 4 == 1:
                    snow.putpixel((x, SILL_Y - 2), SNOW)

    leaves = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    for x, y, c in LEAVES:
        put(leaves, x, y, c, 2)
    petals = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    for x, y, c in PETALS:
        put(petals, x, y, c, 2)
    return {'rain': rain, 'snow': snow, 'leaves': leaves, 'petals': petals}


def draw_with(img, rows, x, y, colors):
    for dy, row in enumerate(rows):
        for dx, c in enumerate(row):
            if c in colors:
                img.putpixel((x + dx, y + dy), colors[c])


def build():
    OUT.mkdir(parents=True, exist_ok=True)
    for name, pieces in PIECES.items():
        img = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        for sheet, rect, pos in pieces:
            img.alpha_composite(sheet.crop(rect), pos)
        img.save(OUT / f'decor-{name}.png')
    new_year().save(OUT / 'decor-new_year.png')
    for sky, img in weather().items():
        img.save(OUT / f'weather-{sky}.png')


if __name__ == '__main__':
    build()
    print('built decor-*.png and weather-*.png')
