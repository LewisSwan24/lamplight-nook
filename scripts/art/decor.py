"""Holiday decorations and weather touches for the cafe: transparent 320x180 overlays laid over cafe.png by the game.

Halloween and Christmas pieces come from LimeZu Modern Interiors (assets/vendor/, not in the repo);
the Lunar New Year lanterns and couplets, the other lunar festivals, the seasons' pieces on the side window's sill
and the weather touches are drawn here.
Writes assets/sprites/decor-<holiday>.png, season-<season>.png and weather-<sky>.png.
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
COLORS = {
    'r': (210, 60, 42, 255), 'd': (160, 38, 28, 255), 'g': (226, 176, 74, 255), 's': (90, 59, 40, 255),
    # For the other festivals and the seasons: x outline, w paper white, o orange, p pink, L leaf, D dark leaf,
    # m moon yellow, c mooncake, b wood, u porcelain blue, t twig, y wintersweet.
    'x': (42, 34, 51, 255), 'w': (250, 246, 236, 255), 'o': (232, 128, 52, 255), 'p': (240, 156, 176, 255),
    'L': (112, 168, 84, 255), 'D': (62, 112, 64, 255), 'm': (246, 216, 112, 255), 'c': (176, 112, 52, 255),
    'b': (122, 82, 54, 255), 'u': (72, 104, 160, 255), 't': (92, 62, 44, 255), 'y': (244, 214, 80, 255),
}
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


# The other lunar festivals (Q-A5): something hung on the wall, something on the side window's sill (SILL_PIECE), and
# for two of them something to eat where the season's vase stands on the big table, since that is put away meanwhile.
SILL_PIECE = (198, 28)  # left edge and bottom row of what stands on the side window's sill
# Lantern Festival: a string of little lanterns with riddle slips under the back wall's top, and a lotus lantern on the sill.
SMALL_LANTERN = ['...s...', '..ggg..', '.RRRRR.', 'RRdRdRR', 'RRdRdRR', '.RRRRR.', '..ggg..', '...g...', '..g.g..', '...w...', '...w...']
LOTUS = ['....p.....', '..p.pp.p..', '.pppwppp..', 'pppppppppp', '.pLLLLLLp.', '..xxxxxx..']
# Dragon Boat Festival: mugwort and calamus hung by the blackboard, zongzi on the big table, a dragon boat on the sill.
MUGWORT = ['...s....', '..s.s...', '...tt...', '...tt...', '..rrrr..', '..tDDt..', '.DLDDLD.', 'DLDLLDLD', '.DLLLLD.',
           'DLDLLDLD', '.DLDDLD.', 'DLLDDLLD', '.D.LL.D.', 'D..LL..D', '...D....']
ZONGZI_PLATE = ['..xL.xL.xL...', '.xLLxLLxLLx..', 'xLwLxLwLxLwLx', 'xxxxxxxxxxxxx', '.xwwwwwwwwwx.', '..xxxxxxxxx..']
DRAGON_BOAT = ['LL..................', 'LDL.................', '.LrL..............r.', '..xrrrrrrrrrrrrrrrx.',
               '..xgggggggggggggggx.', '...xrrrrrrrrrrrrrx..', '....xxxxxxxxxxxxx...']
# Mid-Autumn: a round moon lantern by the blackboard, mooncakes on the big table, a rabbit lantern on the sill.
MOON_LANTERN = ['...s...', '...s...', '..xxx..', '.xmmmx.', 'xmmmmmx', 'xmmwmmx', 'xmmmmmx', '.xmmmx.', '..xxx..', '...r...', '..r.r..']
MOONCAKES = ['..xxx..xxx..', '.xcyccxcycx.', '.xcccxxxccx.', 'xxxxxcycxxxx', 'xwwwxcccxwwx', '.xwwwxxxwwx.', '..xxxxxxxx..']
RABBIT = ['.p..p......', '.pw.pw.....', '.wwwwww....', 'wrwwwwwwww.', 'wwwwwwwwwww', '.wwwwwwwwww', '..x.x..x.x.']


def draw_at(img, rows, x, y):
    """Draw rows whose bottom-left corner is (x, y)."""
    draw(img, rows, x, y - len(rows) + 1)


def lantern():
    img = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    for x in range(122, 179):  # the string, sagging a pixel between the lanterns
        img.putpixel((x, 13 + (1 if (x - 123) % 14 in range(7, 14) else 0)), COLORS['s'])
    for x, colour in zip((123, 137, 151, 165), 'ropr'):
        draw(img, [row.replace('R', colour) for row in SMALL_LANTERN], x, 13)
    draw_at(img, LOTUS, SILL_PIECE[0] + 9, SILL_PIECE[1])
    return img


def dragon_boat():
    img = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    draw(img, MUGWORT, 121, 15)
    draw_at(img, ZONGZI_PLATE, TABLE_PIECE[0] - 3, TABLE_PIECE[1])
    draw_at(img, DRAGON_BOAT, SILL_PIECE[0] + 4, SILL_PIECE[1])
    return img


def mid_autumn():
    img = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    draw(img, MOON_LANTERN, 121, 15)
    draw_at(img, MOONCAKES, TABLE_PIECE[0] - 2, TABLE_PIECE[1])
    draw_at(img, RABBIT, SILL_PIECE[0] + 8, SILL_PIECE[1])
    return img


# The season's piece: a blue-and-white vase in the middle of the big table, with what is in season in it. A festival's
# own things stand there instead while it is up (TABLE_PIECE), as the little Christmas tree does.
VASE = ['..xxx..', '.xuwux.', '..xux..', '.xwuwx.', 'xuwuwux', 'xwuwuwx', '.xxxxx.']
TABLE_PIECE = (149, 85)  # left edge and bottom row, clear of the album and the ledger
SEASON_SPRIGS = {
    # peach blossom
    'spring': ['..pp.....pp..', '.pwp....pwpp.', '..pt.....tp..', '...t..pp.t...', 'pp.t.pwp.t...', 'pwpt..t.t..pp',
               '.p.tt.t.t.pwp', '....t.ttt..tp', '.....ttt..t..', '......tttt...', '......t......', '......t......'],
    # a lotus flower and its leaves
    'summer': ['......p......', '.....ppp.....', '....ppwpp....', '....ppppp....', '.....ppp..LL.', '..LL..L..LDDL',
               '.LDDL.L..LDLL', '.LLDL.L...L..', '..LL..L..L...', '....L.L.L....', '.....LLL.....', '......L......'],
    # red maple leaves
    'autumn': ['...r.....o...', '..rrr...ooo..', '.rrdrr.ooroo.', '..rrr...ooo..', '...t..r..t...', '....t.rr.t...',
               'r...t.t.t..o.', 'rr..tt.tt.oo.', '.rt..ttt..t..', '..tt..t..t...', '....ttt.t....', '......t......'],
    # wintersweet
    'winter': ['..y.....y....', '.yty...yty...', '..t..y..t..y.', '..t.yty.t.yty', '...t.t..t..t.', '.y.t.t.t..t..',
               'yty.tt.t.t...', '.t...t.tt....', '..t..ttt.....', '...t..t......', '....ttt......', '......t......'],
}


def season(name):
    img = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    sprig = SEASON_SPRIGS[name]
    vx, vy = TABLE_PIECE
    # The sprig stands in the vase's mouth, centred on it.
    draw_at(img, sprig, vx + len(VASE[0]) // 2 - len(sprig[0]) // 2, vy - len(VASE) + 1)
    draw_at(img, VASE, vx, vy)
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
    lantern().save(OUT / 'decor-lantern.png')
    dragon_boat().save(OUT / 'decor-dragon_boat.png')
    mid_autumn().save(OUT / 'decor-mid_autumn.png')
    for name in SEASON_SPRIGS:
        season(name).save(OUT / f'season-{name}.png')
    for sky, img in weather().items():
        img.save(OUT / f'weather-{sky}.png')


if __name__ == '__main__':
    build()
    print('built decor-*.png, season-*.png and weather-*.png')
