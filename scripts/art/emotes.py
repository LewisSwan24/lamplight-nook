"""Build the mood bubble strip from the LimeZu thinking emotes sheet.

Reads assets/vendor/4_User_Interface_Elements/UI_thinking_emotes_animation_16x16.png (not in the repo)
and writes assets/ui/emotes.png: one 32x16 cell per bubble (two 16x16 frames side by side), in the
order of EMOTES. The tea cup is drawn here; the pack has none.
Run: python3 scripts/art/emotes.py
"""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SHEET = ROOT / 'assets/vendor/4_User_Interface_Elements/UI_thinking_emotes_animation_16x16.png'
OUT = ROOT / 'assets/ui/emotes.png'
CELL = 16

# Bubble name -> (row, column) of the first frame on the sheet; the second frame is the next column.
# Rows 0-3 hold the pop-up animation (two cells tall each); the bubble icons start at row 4.
# Keep the order in sync with EMOTES in app/renderer/ui/emotes.ts.
EMOTES = {
    'idea': (6, 4),
    'sweat': (9, 6),
    'question': (5, 2),
    'note': (6, 6),
    'tea': (4, 6),  # an empty bubble; the cup is painted in below
    'alert': (5, 0),
    'dots': (9, 2),
    'zzz': (5, 6),
    'heart': (5, 4),
}

# A small cup of tea, drawn into the empty bubble: . = leave, 1 = outline, 2 = cup, 3 = tea, 4 = steam.
# The two steam rows alternate between frames so the steam drifts.
STEAM = [['...4.4....', '....4.....'], ['....4.4...', '...4......']]
CUP = [
    '1111111...',
    '1333331111',
    '1222221..1',
    '1222221111',
    '.12221....',
    '..111.....',
]
CUP_COLOURS = {'1': (59, 42, 30, 255), '2': (251, 246, 236, 255), '3': (160, 112, 75, 255), '4': (150, 150, 168, 255)}


def cell(sheet, row, col):
    return sheet.crop((col * CELL, row * CELL, (col + 1) * CELL, (row + 1) * CELL))


def paint_cup(frame, f):
    px = frame.load()
    for y, line in enumerate(STEAM[f] + CUP):
        for x, ch in enumerate(line):
            if ch in CUP_COLOURS:
                px[3 + x, 3 + y] = CUP_COLOURS[ch]


def main():
    sheet = Image.open(SHEET).convert('RGBA')
    out = Image.new('RGBA', (CELL * 2 * len(EMOTES), CELL))
    for i, (name, (row, col)) in enumerate(EMOTES.items()):
        for f in range(2):
            frame = cell(sheet, row, col + f)
            if name == 'tea':
                paint_cup(frame, f)
            out.paste(frame, (i * CELL * 2 + f * CELL, 0))
    OUT.parent.mkdir(parents=True, exist_ok=True)
    out.save(OUT)
    print('wrote', OUT.relative_to(ROOT))


if __name__ == '__main__':
    main()
