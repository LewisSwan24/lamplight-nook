"""Build the staff portraits (head and shoulders, five expressions) from our staff sprite sheets.

Reads assets/sprites/<staff>.png (made by characters.py) and writes assets/ui/portraits.png:
one row per staff member in STAFF order, one 16x16 cell per expression in EXPRESSIONS order.
The UI draws them at whole-pixel scale (64x64 at x4). Faces have no mouth in the sprites, so
expressions are made by redrawing eyes, brows and a small mouth.
Run: python3 scripts/art/portraits.py
"""
from pathlib import Path

from PIL import Image

from characters import save

ROOT = Path(__file__).resolve().parents[2]
SPRITES = ROOT / 'assets/sprites'
OUT = ROOT / 'assets/ui/portraits.png'
CELL = 16

# Keep both orders in sync with app/renderer/ui/portraits.ts.
# The shops' staff (road-to-1.4.md D2) come after the home shop's, so the rows above them keep their places.
STAFF = ['adeng', 'xiaoju', 'laoshi', 'qingdai', 'xiaodou', 'aqian', 'xiaozhe', 'xiaoding', 'guiyi', 'axin', 'fangjie', 'jianbo']
EXPRESSIONS = ['calm', 'happy', 'troubled', 'unsure', 'serious']

# Front-facing idle frame: row 1, direction slot 3 (down), first of 6 frames; 16x32 cells.
FRAME = (3 * 6 * 16, 32)
# Rows of the frame that make the portrait: top of the head to the shoulders.
TOP = 9

# Per staff: the two eyes (x, y of the upper eye pixel, in frame coordinates), and whether glasses
# cover them (then eyes are left alone and only brows and mouth change).
FACES = {
    'adeng': {'eyes': [(5, 20), (10, 20)], 'glasses': False},
    'xiaoju': {'eyes': [(5, 20), (10, 20)], 'glasses': False},
    'laoshi': {'eyes': [(5, 20), (10, 20)], 'glasses': True},
    'qingdai': {'eyes': [(5, 20), (10, 20)], 'glasses': False},
    'xiaodou': {'eyes': [(5, 20), (10, 20)], 'glasses': False},
    'aqian': {'eyes': [(5, 20), (10, 20)], 'glasses': True},
    'xiaozhe': {'eyes': [(5, 20), (10, 20)], 'glasses': False},
    'xiaoding': {'eyes': [(5, 20), (10, 20)], 'glasses': False},
    'guiyi': {'eyes': [(5, 20), (10, 20)], 'glasses': False},
    'axin': {'eyes': [(5, 20), (10, 20)], 'glasses': False},
    'fangjie': {'eyes': [(5, 20), (10, 20)], 'glasses': False},
    'jianbo': {'eyes': [(5, 20), (10, 20)], 'glasses': True},
}
INK = (58, 58, 80, 255)
BROW = (72, 54, 50, 255)
MOUTH = (150, 62, 62, 255)
BLUSH = (232, 120, 120, 255)
SWEAT = (124, 188, 248, 255)
SWEAT_HI = (232, 246, 255, 255)
MOUTH_ROW = 22


def express(frame, name, face):
    """Redraw one face for an expression, in place."""
    px = frame.load()
    eyes, glasses = face['eyes'], face['glasses']
    skin = px[7, 19]

    def put(x, y, c):
        px[x, y] = c

    def clear_eye(x, y):
        put(x, y, skin)
        put(x, y + 1, skin)

    if name == 'happy':
        if not glasses:
            for x, y in eyes:
                clear_eye(x, y)
                put(x - 1, y + 1, INK)  # an upturned arc: ^
                put(x, y, INK)
                put(x + 1, y + 1, INK)
        put(7, MOUTH_ROW, MOUTH)
        put(8, MOUTH_ROW, MOUTH)
        if glasses:
            put(4, MOUTH_ROW, BLUSH)
            put(11, MOUTH_ROW, BLUSH)
    elif name == 'troubled':
        if not glasses:
            for x, y in eyes:
                clear_eye(x, y)
                put(x, y + 1, INK)  # squeezed shut: a low dash
                put(x + (1 if x < 8 else -1), y + 1, INK)
        for x, _ in eyes:  # worried brows, inner ends raised
            put(x + (1 if x < 8 else -1), 18, BROW)
        put(8, MOUTH_ROW, MOUTH)
        put(13, 14, SWEAT_HI)
        put(13, 15, SWEAT)
        put(13, 16, SWEAT)
    elif name == 'unsure':
        if not glasses:
            for x, y in eyes:  # glancing aside
                clear_eye(x, y)
                put(x + 1, y, INK)
                put(x + 1, y + 1, BROW)
        put(eyes[1][0], 18, BROW)  # one brow up
        put(eyes[1][0] - 1, 18, BROW)
        put(8, MOUTH_ROW, MOUTH)
    elif name == 'serious':
        for x, _ in eyes:  # level brows
            put(x, 18, BROW)
            put(x + (-1 if x < 8 else 1), 18, BROW)
        put(7, MOUTH_ROW, MOUTH)
        put(8, MOUTH_ROW, MOUTH)


def main():
    out = Image.new('RGBA', (CELL * len(EXPRESSIONS), CELL * len(STAFF)))
    for row, staff in enumerate(STAFF):
        sheet = Image.open(SPRITES / f'{staff}.png').convert('RGBA')
        fx, fy = FRAME
        for col, name in enumerate(EXPRESSIONS):
            frame = sheet.crop((fx, fy, fx + 16, fy + 32))
            express(frame, name, FACES[staff])
            out.paste(frame.crop((0, TOP, 16, TOP + CELL)), (col * CELL, row * CELL))
    OUT.parent.mkdir(parents=True, exist_ok=True)
    save(out, OUT)
    print('wrote', OUT.relative_to(ROOT))
    write_players()


# The player's looks (characters.py, PLAYERS): one front-facing 16x32 frame each, side by side, in
# assets/ui/you.png. The look picker shows them whole; the player's portrait is the head, cropped
# by CSS at the same TOP row as the staff portraits (app/renderer/ui/portraits.ts).
PLAYER_COUNT = 8
PLAYERS_OUT = ROOT / 'assets/ui/you.png'


def write_players():
    out = Image.new('RGBA', (16 * PLAYER_COUNT, 32))
    fx, fy = FRAME
    for n in range(PLAYER_COUNT):
        sheet = Image.open(SPRITES / f'you-{n + 1}.png').convert('RGBA')
        out.paste(sheet.crop((fx, fy, fx + 16, fy + 32)), (n * 16, 0))
    save(out, PLAYERS_OUT)
    print('wrote', PLAYERS_OUT.relative_to(ROOT))


if __name__ == '__main__':
    main()
