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


# ---------------------------------------------------------------------------------------------------------------------
# The three shops along the street (road-to-1.4.md D6): shops-decor.png, a row per shop and a column per festival, each
# frame a whole room. What all three have hangs on the wall right of the window (SLOT), stands on the big table
# (TABLE_PIECE) or in the corner by the door that walkers already go round; each shop adds one thing of its own at
# SHOP_PIECE: the print shop a poster it printed, the studio a little painting, the workshop a sign cut from wood.
SHOPS = ['print', 'studio', 'workshop']
HOLIDAY_ORDER = ['halloween', 'christmas', 'new_year', 'lantern', 'dragon_boat', 'mid_autumn']  # weather.ts HOLIDAYS
SHOP_PIECE = (180, 18)  # top-left of each shop's own piece, on the wall clear of the press, the drying line, the pegboard
# The festival's piece on the wall: the narrow strip right of the window, before what the shop grows there (D5) from x 234.
SLOT = (224, 16)
BAT = ['....s....', '....s....', 'k..kkk..k', 'kk.kgk.kk', 'kkkkkkkkk', '.kk.k.kk.', '.k.....k.']


def SMALL_LANTERN_OF(colour):
    return [row.replace('R', colour) for row in SMALL_LANTERN]
# A little picture of each festival, for the poster, the painting and the wooden sign: k black, n green-white.
MOTIFS = {
    'halloween': ['....t....', '...t.....', '.ooooooo.', 'oooooooo.', 'okoookoo.', 'oooooooo.', 'ookkkkoo.', '.ooooooo.', '.........'],
    'christmas': ['....y....', '....L....', '...LLL...', '..LrLLL..', '...LLL...', '..LLLyL..', '.LrLLLLL.', '....b....', '...bbb...'],
    'new_year': ['....r....', '...rrr...', '..rrgrr..', '.rrgggrr.', 'rrgggggrr', '.rrgggrr.', '..rrgrr..', '...rrr...', '....r....'],
    'lantern': ['....s....', '...ggg...', '.rrrrrrr.', 'rrdrrrdrr', 'rrdrrrdrr', 'rrdrrrdrr', '.rrrrrrr.', '...ggg...', '....w....'],
    'dragon_boat': ['....L....', '...LL....', '...LDL...', '..LDLLL..', '..rrrrr..', '.LLDLLDL.', '.LDLLLDL.', 'LLLLLLLLL', '.........'],
    'mid_autumn': ['...mmm...', '.mmmmmm..', 'mmmmmwmm.', 'mmmmmmmm.', 'mmwmmmmm.', 'mmmmmmmm.', '.mmmmmm..', '...mmm...', '.........'],
}
COLORS.update({'k': (58, 30, 24, 255), 'n': (236, 240, 226, 255), 'e': (196, 154, 104, 255), 'E': (232, 200, 146, 255)})


def poster(motif):
    """A printed sheet: white paper in an outline, a red band along the top, the festival in the middle."""
    rows = ['xxxxxxxxxxxxx'] + ['xrrrrrrrrrrrx'] + ['xwwwwwwwwwwwx'] * 12 + ['xxxxxxxxxxxxx']
    rows = [list(r) for r in rows]
    for dy, row in enumerate(motif):
        for dx, c in enumerate(row):
            if c != '.':
                rows[3 + dy][2 + dx] = c
    rows[13][3:10] = list('wxwxxwx')  # a line of type under the picture
    return [''.join(r) for r in rows]


def painting(motif):
    """A small canvas in a wooden frame, hung from a nail."""
    rows = ['......s......', '.....s.s.....', '....s...s....', 'bbbbbbbbbbbbb'] + ['bnnnnnnnnnnnb'] * 11 + ['bbbbbbbbbbbbb']
    rows = [list(r) for r in rows]
    for dy, row in enumerate(motif):
        for dx, c in enumerate(row):
            if c != '.':
                rows[5 + dy][2 + dx] = c
    return [''.join(r) for r in rows]


def wooden_sign(motif):
    """The festival's shape cut from a board: every pixel of it in wood, the outline darker, on a string from a nail."""
    shape = {(dx, dy) for dy, row in enumerate(motif) for dx, c in enumerate(row) if c != '.'}
    w, h = len(motif[0]) + 2, len(motif) + 2
    rows = [['.'] * w for _ in range(h + 3)]
    rows[0][w // 2] = 's'
    rows[1][w // 2 - 1] = rows[1][w // 2 + 1] = 's'
    rows[2][w // 2 - 2] = rows[2][w // 2 + 2] = 's'
    for dx, dy in shape:
        edge = any((dx + ax, dy + ay) not in shape for ax, ay in ((1, 0), (-1, 0), (0, 1), (0, -1)))
        rows[3 + dy + 1][dx + 1] = 'b' if edge else ('E' if (dx + dy) % 3 else 'e')
    return [''.join(r) for r in rows]


OWN_PIECE = {'print': poster, 'studio': painting, 'workshop': wooden_sign}


def shop_frame(shop, holiday):
    img = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    tx, ty = TABLE_PIECE
    sx, sy = SLOT
    if holiday == 'halloween':
        draw(img, BAT, sx, sy)
        img.alpha_composite(halloween.crop((163, 6, 189, 28)), (290, 154))  # a pile of pumpkins in the corner by the door
        img.alpha_composite(halloween.crop((83, 7, 93, 22)), (tx - 2, ty - 14))  # a small pumpkin on the big table
    elif holiday == 'christmas':
        img.alpha_composite(christmas.crop((17, 12, 47, 47)), (288, 143))  # the tree in the corner, as in the cafe
        img.alpha_composite(christmas.crop((0, 100, 30, 140)), (288, 139))
        img.alpha_composite(christmas.crop((147, 10, 157, 25)), (sx, sy + 6))  # a stocking on the wall
        img.alpha_composite(christmas.crop((226, 109, 238, 128)), (tx + 1, ty - 19))  # a little tree on the table
    elif holiday == 'new_year':
        draw(img, LANTERN, sx, sy)
        draw(img, FU, 292, 22)
        for x, y in COUPLETS:
            for dy in range(26):
                for dx in range(3):
                    img.putpixel((x + dx, y + dy), COLORS['r'])
                if dy % 5 == 2:
                    img.putpixel((x + 1, y + dy), COLORS['g'])
    elif holiday == 'lantern':
        draw(img, SMALL_LANTERN_OF('r'), sx + 1, sy - 2)
        draw_at(img, LOTUS, tx - 1, ty)
    elif holiday == 'dragon_boat':
        draw(img, MUGWORT, sx + 1, sy - 1)
        draw_at(img, ZONGZI_PLATE, tx - 3, ty)
    elif holiday == 'mid_autumn':
        draw(img, MOON_LANTERN, sx + 1, sy - 1)
        draw_at(img, MOONCAKES, tx - 2, ty)
    draw(img, OWN_PIECE[shop](MOTIFS[holiday]), *SHOP_PIECE)
    return img


def shops_decor():
    sheet = Image.new('RGBA', (W * len(HOLIDAY_ORDER), H * len(SHOPS)), (0, 0, 0, 0))
    for row, shop in enumerate(SHOPS):
        for col, holiday in enumerate(HOLIDAY_ORDER):
            sheet.alpha_composite(shop_frame(shop, holiday), (col * W, row * H))
    return sheet


# ---------------------------------------------------------------------------------------------------------------------
# The town's street through the year (road-to-1.4.md D6): town-decor.png, the pieces packed into one sheet, and
# town-decor.json, where each piece stands on the street. Read after scripts/art/town.py has drawn the street.
EXTERIORS = ROOT / 'assets/vendor/Modern_Exteriors_16x16/ME_Theme_Sorter_16x16'
# The doors as drawn on each front: left x, right x, top. town.json's door is where walkers go in, not always the door.
DOORS = {'cafe': (97, 127, 92), 'study': (212, 234, 89), 'print': (368, 392, 90), 'studio': (488, 512, 90),
         'workshop': (608, 640, 92), 'bakery': (928, 960, 88), 'post': (1028, 1084, 95)}
# The pumpkin goes right of the door, except where something grows there.
PUMPKIN_LEFT = {'bakery'}
# Where the cart stands in the lot (town.json grow 'stall'): a festival's own piece takes its place.
SPOT = (674, 712)
SPOT_BOTTOM = 121
# 'k' kerb snow, 'W' snow, 'B' snow's blue shade, 'P' puddle, 'Q' puddle's shine, 'S' summer shade.
STREET_COLORS = {'W': (246, 248, 252, 255), 'B': (206, 218, 236, 255), 'P': (138, 166, 200, 150), 'Q': (206, 222, 240, 190),
                 'S': (22, 44, 26, 72)}
# The umbrella the one on an errand opens in rain or snow: c canopy, C its shade, h handle.
UMBRELLA_UP = [
    '........c........',
    '.....ccCcCcc.....',
    '...cccCcccCccc...',
    '.ccccCcccccCcccc.',
    'cccccCcccccCccccc',
    'CcCcCcCcCcCcCcCcC',
    '........h........',
    '........h........',
    '........h........',
    '........h........',
    '........h........',
    '........h........',
    '........h........',
    '........h........',
    '........h........',
    '........h........',
    '.......hh........',
]
UMBRELLA_COLORS = {'c': (204, 76, 70, 255), 'C': (150, 46, 44, 255), 'h': (70, 50, 40, 255)}
# Where its top-left goes from the walker's feet, the middle of her bottom edge: the canopy just over her head (about
# 22 pixels up), the handle down her side to her hand.
UMBRELLA_AT = (-4, -29)
WREATH = ['...LDL...', '..DLyLD..', '.LD...DL.', '.D.....D.', '.L.....L.', '.DL...LD.', '..LDrDL..', '...rrr...', '..r...r..']


def lcg(seed):
    """The same scatter every build."""
    while True:
        seed = (seed * 1103515245 + 12345) & 0x7fffffff
        yield seed


def street_canvas(town):
    return Image.new('RGBA', (town['width'], town['height']), (0, 0, 0, 0))


def is_leaf(px):
    r, g, b, a = px
    return a > 0 and g > r + 6 and g >= b


def trees(town):
    """Each tree along the street: its picture, its top-left, and the growth piece it comes with (None: always there)."""
    props = Image.open(OUT / 'town-props.png').convert('RGBA')
    out = []
    for p in town['props']:
        if p['name'].startswith('Tree'):
            l, t, r, b = props.crop((p['left'] - 24, 0, p['right'] + 24, p['bottom'])).getbbox()
            x, y = p['left'] - 24 + l, t
            out.append((props.crop((x, y, x + r - l, b)), x, y, None))
    grow = Image.open(OUT / 'town-grow.png').convert('RGBA')
    for p in town['grow']:
        if p['id'] == 'park' and p['h'] > 30:
            out.append((grow.crop((p['sx'], p['sy'], p['sx'] + p['w'], p['sy'] + p['h'])), p['x'], p['y'], 'park'))
    return out


def tree_season(season, tree, x, y, img):
    """What the season does to one tree: blossom, shade, red leaves or snow on top."""
    w, h = tree.size
    leaf = {(i, j) for j in range(h) for i in range(w) if is_leaf(tree.getpixel((i, j)))}
    for i, j in leaf:
        if season == 'spring' and i % 4 == (j // 4) % 4 and j % 4 == 1 and ((i * 7 + j * 13) % 5) < 3:
            for dx, dy in ((0, 0), (-1, 0), (1, 0), (0, -1), (0, 1)):
                if (i + dx, j + dy) in leaf:
                    img.putpixel((x + i + dx, y + j + dy), (252, 236, 240, 255) if (dx, dy) == (0, 0) else COLORS['p'])
        elif season == 'autumn':
            r, g, b, _ = tree.getpixel((i, j))
            lum = (r + g + b) / 3
            colour = (150, 60, 30) if lum < 80 else (205, 96, 40) if lum < 115 else (232, 140, 52) if lum < 150 else (246, 196, 84)
            img.putpixel((x + i, y + j), colour + (255,))
        elif season == 'winter' and (i, j - 1) not in leaf:
            img.putpixel((x + i, y + j), STREET_COLORS['W'])
            if (i, j + 1) in leaf and (i + j) % 2:
                img.putpixel((x + i, y + j + 1), STREET_COLORS['B'])


def ellipse(img, cx, cy, rx, ry, colour):
    for yy in range(cy - ry, cy + ry + 1):
        for xx in range(cx - rx, cx + rx + 1):
            if ((xx - cx) / max(rx, 1)) ** 2 + ((yy - cy) / max(ry, 1)) ** 2 <= 1 and 0 <= xx < img.width and 0 <= yy < img.height:
                img.putpixel((xx, yy), colour)


def bits(img, seed, n, area, colours):
    """Little two-pixel pieces (petals, leaves) scattered over an area: x0, x1, y0, y1."""
    x0, x1, y0, y1 = area
    roll = lcg(seed)
    for _ in range(n):
        x, y, c = x0 + next(roll) % (x1 - x0), y0 + next(roll) % (y1 - y0), colours[next(roll) % len(colours)]
        img.putpixel((x, y), COLORS[c])
        img.putpixel((x + 1, y), COLORS[c])


def roof_snow(town, img):
    """Snow over the roof tiles above the fronts: white, the edges of the tiles showing light blue, thick along the eaves."""
    street = Image.open(OUT / 'town-street.png').convert('RGBA')
    fronts = Image.open(OUT / 'town-fronts.png').convert('RGBA')
    tile = street.crop((32, 0, 48, 16))  # a roof tile above the cafe; the street starts with an alley
    light = sorted(range(16), key=lambda j: -sum(sum(tile.getpixel((i, j))[:3]) for i in range(16)))[:8]
    for x in range(town['width']):
        roof = [y for y in range(town['kerb']) if fronts.getpixel((x, y))[3] == 0 and street.getpixel((x, y)) == tile.getpixel((x % 16, y % 16))]
        if not roof or roof[0] != 0:
            continue
        end = 0
        while end + 1 < len(roof) and roof[end + 1] == roof[end] + 1:
            end += 1
        for y in roof[:end + 1]:
            img.putpixel((x, y), STREET_COLORS['W'] if y % 16 in light or y >= roof[end] - 1 else STREET_COLORS['B'])


def stall(awning, goods, lantern_rows=None):
    """A festival stall for the lot: a striped awning on two posts over a wooden counter, the goods on top."""
    w, h = 36, 34
    rows = [['.'] * w for _ in range(h)]
    for x in range(w):
        rows[0][x] = 'x'
        for y in range(1, 5):
            rows[y][x] = awning[(x // 4) % 2]
        rows[5][x] = awning[(x // 4) % 2] if (x // 2) % 2 == 0 else '.'
    for y in range(6, h):
        for x in (1, 2, w - 3, w - 2):
            rows[y][x] = 'b'
    for x in range(w):
        rows[22][x] = 'c'
        rows[23][x] = 'c'
        for y in range(24, h - 1):
            rows[y][x] = 't' if x in (0, w - 1) or y == 28 else 'b'
        rows[h - 1][x] = 'x'
    for dy, row in enumerate(goods):
        for dx, c in enumerate(row):
            if c != '.':
                rows[22 - len(goods) + dy][4 + dx] = c
    if lantern_rows:
        for dy, row in enumerate(lantern_rows):
            for dx, c in enumerate(row):
                if c != '.':
                    rows[6 + dy][w - 11 + dx] = c
    return [''.join(r) for r in rows]


ZONGZI = ['...L.....L.....L.....L...', '..LDL...LDL...LDL...LDL..', '.LwLDL.LwLDL.LwLDL.LwLDL.', 'LLrLLLLLLrLLLLLLrLLLLLLrL']
MOONCAKE_ROW = ['.xxx..xxx..xxx..xxx..xxx', 'xcycx.xcycxxcycx.xcycxcyc', 'xcccx.xcccxxcccx.xcccxccc', '.xxx..xxx..xxx..xxx..xxx']


def riddle_lanterns():
    """Two bamboo poles with a rope between them, little lanterns hanging off it, each with a riddle slip."""
    w, h = 38, 42
    img = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    for y in range(h):
        for x in (1, w - 2):
            img.putpixel((x, y), COLORS['e'] if y % 6 else COLORS['t'])
            img.putpixel((x + 1, y), COLORS['b'])
    for x in range(3, w - 2):
        img.putpixel((x, 3 + (1 if 8 <= x <= w - 9 else 0)), COLORS['s'])
    for x, colour in zip((5, 13, 21, 29), 'roro'):
        draw(img, [row.replace('R', colour) for row in SMALL_LANTERN], x, 4)
        for y in range(15, 19):
            img.putpixel((x + 3, y), COLORS['w'])
    return img


def pumpkin_pile():
    def graveyard(name):
        p = Image.open(EXTERIORS / '19_Graveyard_Singles_16x16' / f'ME_Singles_Graveyard_16x16_{name}.png').convert('RGBA')
        return p.crop(p.getbbox())
    pile, lit, small = halloween.crop((163, 6, 189, 28)), graveyard('Little_Yellow_Lights_Pumpkin_1'), graveyard('Little_Pumpkin_1')
    w, h = SPOT[1] - SPOT[0], 24
    img = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    img.alpha_composite(small, (0, h - small.height))
    img.alpha_composite(pile, (w - pile.width - 2, h - pile.height))
    img.alpha_composite(lit, (w // 2 - 6, h - lit.height))
    return img.crop(img.getbbox())


def jack_o_lantern():
    p = Image.open(EXTERIORS / '19_Graveyard_Singles_16x16' / 'ME_Singles_Graveyard_16x16_Little_Yellow_Lights_Pumpkin_1.png').convert('RGBA')
    return p.crop(p.getbbox())


def street_layers(town):
    """Every layer of the street's decorations: (id, flags, full-street picture)."""
    layers = []
    kerb, road, width = town['kerb'], town['road'], town['width']
    lot = town['lot']
    pavement = (4, width - 6, kerb + 2, road - 2)
    grass = (lot['x'] + 2, lot['x'] + lot['w'] - 4, kerb - 14, kerb - 2)
    standing = trees(town)

    def layer(id_, ground=False, **flags):
        img = street_canvas(town)
        layers.append((id_, dict(flags, ground=ground), img))
        return img

    for season in ('spring', 'summer', 'autumn', 'winter'):
        on_ground = layer(season, ground=True)
        for tree, x, y, with_ in standing:
            up = layer(season, **({'with': with_} if with_ else {}))
            tree_season(season, tree, x, y, up)
            if season == 'summer':
                shade = layer(season, ground=True, **({'with': with_} if with_ else {}))
                ellipse(shade, x + tree.width // 2, y + tree.height - 1, tree.width // 2 + 2, 3, STREET_COLORS['S'])
        if season == 'spring':
            bits(on_ground, 11, 80, pavement, 'ppw')
        if season == 'autumn':
            bits(on_ground, 23, 110, pavement, 'ordc')
            bits(on_ground, 29, 30, grass, 'ordc')
        if season == 'winter':
            roof_snow(town, on_ground)

    # The New Year: two red lanterns at every door. Christmas: a wreath on it. Halloween: a pumpkin lantern beside it.
    new_year, xmas, halloween_ = layer('new_year'), layer('christmas'), layer('halloween')
    jack = jack_o_lantern()
    signs = [g for g in town['grow'] if g['id'] == 'sign']
    for shop, (left, right, top) in DOORS.items():
        for x in (left - 11, right + 2):
            # A lantern that would hang over the shop's new sign (D5) hangs just inside it instead.
            sign = next((g for g in signs if x < g['x'] + g['w'] and g['x'] < x + 9), None)
            draw(new_year, LANTERN, sign['x'] - 10 if sign else x, top - 9)
        draw(xmas, WREATH, (left + right) // 2 - 4, top + 2)
        jx = left - 2 - jack.width if shop in PUMPKIN_LEFT else right + 2
        halloween_.alpha_composite(jack, (jx, kerb + 3 - jack.height))

    # In the lot, where the cart stands: a tree, a pile of pumpkins, the lantern riddles, a zongzi and a mooncake stall.
    def in_lot(id_, img):
        layer(id_, lot=True).alpha_composite(img, (SPOT[0] + (SPOT[1] - SPOT[0] - img.width) // 2, SPOT_BOTTOM - img.height + 1))

    tree = Image.new('RGBA', (30, 40), (0, 0, 0, 0))
    tree.alpha_composite(christmas.crop((17, 12, 47, 47)), (0, 5))
    tree.alpha_composite(christmas.crop((0, 100, 30, 140)), (0, 1))
    in_lot('christmas', tree.crop(tree.getbbox()))
    in_lot('halloween', pumpkin_pile())
    in_lot('lantern', riddle_lanterns())
    zongzi = Image.new('RGBA', (36, 34), (0, 0, 0, 0))
    draw(zongzi, stall('Ln', ZONGZI), 0, 0)
    in_lot('dragon_boat', zongzi)
    mooncakes = Image.new('RGBA', (36, 34), (0, 0, 0, 0))
    draw(mooncakes, stall('rg', MOONCAKE_ROW, MOON_LANTERN), 0, 0)
    in_lot('mid_autumn', mooncakes)

    # Rain leaves puddles on the pavement and the road; snow lies along the kerb and in drifts on the pavement.
    rain = layer('rain', ground=True)
    roll = lcg(37)
    for i in range(34):
        x = 8 + next(roll) % (width - 30)
        y = (kerb + 5 + next(roll) % 20) if i % 2 else (road + 6 + next(roll) % 18)
        rx = 4 + next(roll) % 6
        ellipse(rain, x, y, rx, 1 + i % 2, STREET_COLORS['P'])
        for dx in range(-rx // 2, 1):
            rain.putpixel((x + dx, y - 1 + (i % 2 == 0)), STREET_COLORS['Q'])
    snow = layer('snow', ground=True)
    roll = lcg(41)
    for x in range(width):
        snow.putpixel((x, kerb), STREET_COLORS['W'])
        if next(roll) % 3:
            snow.putpixel((x, kerb + 1), STREET_COLORS['W'])
        if next(roll) % 4 == 0:
            snow.putpixel((x, road - 1), STREET_COLORS['W'])
    for i in range(46):
        x = 10 + next(roll) % (width - 30)
        y = kerb + 4 + next(roll) % 22
        ellipse(snow, x, y, 5 + next(roll) % 9, 1 + next(roll) % 2, STREET_COLORS['W'])
        for dx in range(-3, 4):
            snow.putpixel((x + dx, y + 2), STREET_COLORS['B'])
    for i in range(20):
        ellipse(snow, 10 + next(roll) % (width - 30), road + 3 + next(roll) % 22, 4 + next(roll) % 6, 1, STREET_COLORS['W'])
    return layers


def town_decor():
    """Cut every layer into pieces no wider than CHUNK, pack them into one sheet, and say where each one goes."""
    import json
    town = json.loads((OUT / 'town.json').read_text('utf8'))
    CHUNK = 192
    pieces = []
    for id_, flags, img in street_layers(town):
        for cx in range(0, img.width, CHUNK):
            chunk = img.crop((cx, 0, min(cx + CHUNK, img.width), img.height))
            box = chunk.getbbox()
            if box:
                pieces.append((id_, flags, chunk.crop(box), cx + box[0], box[1]))
    umbrella = Image.new('RGBA', (len(UMBRELLA_UP[0]), len(UMBRELLA_UP)), (0, 0, 0, 0))
    draw_with(umbrella, UMBRELLA_UP, 0, 0, UMBRELLA_COLORS)
    # Shelf packing, tallest first, a pixel apart.
    SHEET_W = 512
    order = sorted(range(len(pieces)), key=lambda i: -pieces[i][2].height)
    at, x, y, shelf = {}, 0, 0, 0
    for i in order + ['umbrella']:
        img = umbrella if i == 'umbrella' else pieces[i][2]
        if x + img.width > SHEET_W:
            x, y, shelf = 0, y + shelf + 1, 0
        at[i] = (x, y)
        x += img.width + 1
        shelf = max(shelf, img.height)
    sheet = Image.new('RGBA', (SHEET_W, y + shelf), (0, 0, 0, 0))
    parts = []
    for i, (id_, flags, img, px, py) in enumerate(pieces):
        sheet.alpha_composite(img, at[i])
        part = {'id': id_, 'sx': at[i][0], 'sy': at[i][1], 'w': img.width, 'h': img.height, 'x': px, 'y': py}
        if flags.get('ground'):
            part['ground'] = True
        if flags.get('with'):
            part['with'] = flags['with']
        if flags.get('lot'):
            part['lot'] = True
        parts.append(part)
    sheet.alpha_composite(umbrella, at['umbrella'])
    parts.sort(key=lambda p: (not p.get('ground', False), p['y'] + p['h']))
    data = {'parts': parts, 'umbrella': {'sx': at['umbrella'][0], 'sy': at['umbrella'][1], 'w': umbrella.width,
                                         'h': umbrella.height, 'x': UMBRELLA_AT[0], 'y': UMBRELLA_AT[1]}}
    sheet.save(OUT / 'town-decor.png', optimize=True)
    with open(OUT / 'town-decor.json', 'w', encoding='utf-8', newline='\n') as f:
        json.dump(data, f, indent=1)
        f.write('\n')


def build():
    OUT.mkdir(parents=True, exist_ok=True)
    shops_decor().save(OUT / 'shops-decor.png', optimize=True)
    town_decor()
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
    print('built decor-*.png, season-*.png, weather-*.png, shops-decor.png, town-decor.png and town-decor.json')
