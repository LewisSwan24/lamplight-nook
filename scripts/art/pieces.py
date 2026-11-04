"""Split each scene into its empty room and the furniture standing in it, so the staff can walk behind things.

The finished picture (cafe.png, study.png) stays the truth: a piece is whatever the picture has inside that piece's
box and the room does not, so room + pieces gives the picture back pixel for pixel (tests/pieces.test.ts). The game
draws each piece at the depth of its foot; anyone whose feet are higher up the screen goes behind it.

A chair's depth is half a pixel behind the person sitting in it. A piece's inside is solid: where a table happens to
match the rug behind it, nobody shows through.

An overlay image (a growth piece, the holiday decorations, the weather's touches) that lies on a piece goes just above
the highest one it touches; pieces.json lists them under `on`.

Writes assets/sprites/<scene>-room.png, <scene>-pieces.png (one sheet, top to bottom) and pieces.json.
Run after every other art script: python3 scripts/art/pieces.py
"""
import json
import re
from pathlib import Path

from PIL import Image

import rug
import scene
import study

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'assets/sprites'
W, H = scene.W, scene.H
# Seats drawn into a bigger piece: its depth is half a pixel behind the sitters (layout.ts, SEATS), not at its foot.
SEAT_BASE = {'bench': 121.5, 'sofa': 124.5}
# How much of a piece's height on screen is floor it stands on, counted from its foot; the rest rises in front of
# whoever walks behind it. Walkers go round this part only (game/pieces.ts).
FOOT = {'cafe': {'table': 26, 'bench': 16, 'counter': 8, 'shelf': 16, 'workbench': 14, 'lamp': 6, 'plant_l': 8, 'plant_r': 8},
        'study': {'table': 12, 'sofa': 20, 'counter': 8, 'shelf': 16, 'workbench': 14, 'lamp': 8, 'plant_l': 8, 'plant_r': 8}}
CHAIR_FOOT = 12
WALL = ('window', 'window2', 'window3', 'board')
# Where the floor starts: what ends higher up hangs on the wall.
FLOOR_TOP = 50


def box_of(image, pos):
    return (pos[0], pos[1], pos[0] + image.width, pos[1] + image.height)


def union(a, b):
    return (min(a[0], b[0]), min(a[1], b[1]), max(a[2], b[2]), max(a[3], b[3]))


def chair_boxes():
    """(name, box, the sitter's y) for each chair."""
    out = []
    for i, ((col, row), (x, y)) in enumerate(sorted(scene.CHAIRS, key=lambda c: c[1][1])):
        cell = scene.tiles(scene.interiors, col, row, 1, 2)
        l, t, r, b = cell.getbbox()
        out.append((f'chair{i}', (x - 8 + l, y - 24 + t, x - 8 + r, y - 24 + b), y))
    return out


def cafe_boxes():
    boxes = {}
    for name, rect, pos in scene.FURNITURE:
        if name in WALL:
            continue
        # The coffee machine stands on the counter: one piece.
        key = 'counter' if name == 'coffee' else name
        box = box_of(scene.obj(*rect), pos)
        boxes[key] = union(boxes[key], box) if key in boxes else box
    # The bench's top edge is painted one row above the pack's piece (rug.py).
    l, t, r, b = boxes['bench']
    boxes['bench'] = (l, rug.BENCH_TOP, r, b)
    return boxes


def study_boxes():
    boxes = {}
    for name, sheet, rect, pos in study.FURNITURE:
        if name:
            box = box_of(study.piece(sheet, rect), pos)
            boxes[name] = union(boxes[name], box) if name in boxes else box
    boxes['sofa'] = box_of(study.piece(*study.SOFA), study.SOFA_POS)
    return boxes


def cafe_room():
    img = scene.shell()
    for name, rect, pos in scene.FURNITURE:
        if name in WALL:
            img.alpha_composite(scene.obj(*rect), pos)
    # The whole rug, including where the table stands.
    for y in range(rug.TOP, rug.BOTTOM + 1):
        for x in range(rug.LEFT, rug.RIGHT + 1):
            ring = min(x - rug.LEFT, rug.RIGHT - x, y - rug.TOP, rug.BOTTOM - y)
            img.putpixel((x, y), (rug.RINGS[ring] if ring < len(rug.RINGS) else rug.RED) + (255,))
    return img


def study_room():
    img = study.shell()
    for name, sheet, rect, pos in study.FURNITURE:
        if not name:
            img.alpha_composite(study.piece(sheet, rect), pos)
    return img


def solid(mask):
    """Fill the holes: only what the box's edge can reach through empty pixels stays empty."""
    w, h = len(mask[0]), len(mask)
    outside = set()
    todo = [(x, y) for x in range(w) for y in (0, h - 1)] + [(x, y) for y in range(h) for x in (0, w - 1)]
    while todo:
        x, y = todo.pop()
        if (x, y) in outside or not (0 <= x < w and 0 <= y < h) or mask[y][x]:
            continue
        outside.add((x, y))
        todo += [(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)]
    return [[(x, y) not in outside for x in range(w)] for y in range(h)]


def split(name, room, boxes, chairs):
    picture = Image.open(OUT / f'{name}.png').convert('RGBA')
    named = [(key, box, SEAT_BASE.get(key, box[3])) for key, box in boxes.items()] + [(key, box, y - 0.5) for key, box, y in chairs]
    named = [(key, (max(0, l), max(0, t), min(W, r), min(H, b)), base) for key, (l, t, r, b), base in named]
    # Whatever belongs to no piece stays in the room as it is in the picture.
    for y in range(H):
        for x in range(W):
            if not any(b[0] <= x < b[2] and b[1] <= y < b[3] for _k, b, _d in named):
                room.putpixel((x, y), picture.getpixel((x, y)))
    pieces, sheet_h = [], 0
    for key, box, base in named:
        l, t, r, b = box
        mask = solid([[picture.getpixel((x, y)) != room.getpixel((x, y)) for x in range(l, r)] for y in range(t, b)])
        part = Image.new('RGBA', (r - l, b - t), (0, 0, 0, 0))
        for y in range(t, b):
            for x in range(l, r):
                if mask[y - t][x - l]:
                    part.putpixel((x - l, y - t), picture.getpixel((x, y)))
        trim = part.getbbox()
        part = part.crop(trim)
        pieces.append({'name': key, 'x': l + trim[0], 'y': t + trim[1], 'w': part.width, 'h': part.height,
                       'sy': sheet_h, 'base': base, 'foot': FOOT[name].get(key, CHAIR_FOOT), '_image': part})
        sheet_h += part.height
    sheet = Image.new('RGBA', (max(p['w'] for p in pieces), sheet_h), (0, 0, 0, 0))
    for p in pieces:
        sheet.paste(p.pop('_image'), (0, p['sy']))
    room.save(OUT / f'{name}-room.png', optimize=True)
    sheet.save(OUT / f'{name}-pieces.png', optimize=True)
    return pieces


def overlays_on(pieces, name):
    """Overlay image -> the depth just above the highest piece it touches."""
    sheet = Image.open(OUT / f'{name}-pieces.png').convert('RGBA')
    on = {}
    for path in sorted(OUT.glob('*.png')):
        if not re.match(r'(grow|decor|weather)-', path.name):
            continue
        overlay = Image.open(path).convert('RGBA')
        touched = [p['base'] for p in pieces if any(
            overlay.getpixel((x, y))[3] > 0 and sheet.getpixel((x - p['x'], p['sy'] + y - p['y']))[3] > 0
            for y in range(p['y'], p['y'] + p['h']) for x in range(p['x'], p['x'] + p['w']))]
        if touched:
            on[path.stem] = max(touched) + 0.1
    return on


def floor_decor():
    """Boxes round what the holidays put below the wall: anything low enough and more than a speck."""
    boxes = []
    for path in sorted(OUT.glob('decor-*.png')):
        overlay = Image.open(path).convert('RGBA')
        todo = {(x, y) for y in range(H) for x in range(W) if overlay.getpixel((x, y))[3] > 0}
        while todo:
            stack, group = [todo.pop()], []
            while stack:
                x, y = stack.pop()
                group.append((x, y))
                for dx in (-1, 0, 1):
                    for dy in (-1, 0, 1):
                        if (x + dx, y + dy) in todo:
                            todo.remove((x + dx, y + dy))
                            stack.append((x + dx, y + dy))
            xs, ys = [p[0] for p in group], [p[1] for p in group]
            if len(group) >= 12 and max(ys) >= FLOOR_TOP:
                boxes.append({'left': min(xs), 'right': max(xs) + 1, 'top': min(ys), 'bottom': max(ys) + 1})
    return sorted(boxes, key=lambda b: (b['top'], b['left']))


if __name__ == '__main__':
    chairs = chair_boxes()
    data = {}
    for name, room, boxes in (('cafe', cafe_room(), cafe_boxes()), ('study', study_room(), study_boxes())):
        pieces = split(name, room, boxes, chairs)
        data[name] = {'pieces': pieces, 'on': overlays_on(pieces, name), 'decor': floor_decor()}
    # Where each growth piece shows, so it can be clicked (game/objects.ts).
    grow = {}
    for path in sorted(OUT.glob('grow-*.png')):
        l, t, r, b = Image.open(path).convert('RGBA').getbbox()
        grow[path.stem[5:]] = {'x': l, 'y': t, 'w': r - l, 'h': b - t}
    for scene_data in data.values():
        scene_data['grow'] = grow
    with open(OUT / 'pieces.json', 'w', encoding='utf-8', newline='\n') as f:
        json.dump(data, f, indent=1)
        f.write('\n')
    print({k: len(v['pieces']) for k, v in data.items()})
