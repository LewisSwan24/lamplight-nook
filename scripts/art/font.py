"""Build the handwritten UI font: LXGW WenKai Screen (SIL OFL 1.1), cut down to the characters we use.

The npm package lxgw-wenkai-screen-webfont ships the font as ~100 woff2 slices by unicode range.
Unpack it to assets/vendor/fonts/lxgw-wenkai-screen-webfont/ (not in the repo), then run
python3 scripts/art/font.py. It collects every character in locales/ and lines/ plus ASCII and
common punctuation, takes those glyphs from the slices that hold them, merges them into one font
and writes assets/fonts/hand.woff2 with the licence next to it. Characters outside the set fall
back to the system's KaiTi (see style.css), which looks close.
"""
import glob
import json
import re
from pathlib import Path

from fontTools import subset
from fontTools.merge import Merger
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parents[2]
PKG = ROOT / 'assets/vendor/fonts/lxgw-wenkai-screen-webfont'
CSS = PKG / 'lxgwwenkaigbscreen.css'
OUT = ROOT / 'assets/fonts/hand.woff2'
EXTRA = ''.join(chr(c) for c in range(0x20, 0x7F)) + '，。？！、：；“”‘’（）《》…—·✓'


def used_chars():
    chars = set(EXTRA)

    def walk(o):
        if isinstance(o, str):
            chars.update(o)
        elif isinstance(o, dict):
            for v in o.values():
                walk(v)
        elif isinstance(o, list):
            for v in o:
                walk(v)

    for f in glob.glob(str(ROOT / 'locales/*.json')):
        walk(json.loads(Path(f).read_text(encoding='utf-8')))
    for f in glob.glob(str(ROOT / 'lines/*.yaml')):
        chars.update(Path(f).read_text(encoding='utf-8'))
    return {ord(c) for c in chars if c.isprintable()}


def slices():
    """(file, set of code points) for every @font-face in the package's stylesheet."""
    out = []
    for block in CSS.read_text().split('@font-face')[1:]:
        src = re.search(r"url\('\./(files/[^']+)'\)", block).group(1)
        points = set()
        for part in re.search(r'unicode-range:\s*([^;}]+)', block).group(1).split(','):
            lo, _, hi = part.strip()[2:].partition('-')
            points.update(range(int(lo, 16), int(hi or lo, 16) + 1))
        out.append((PKG / src, points))
    return out


def main():
    want = used_chars()
    parts = []
    for i, (path, points) in enumerate(slices()):
        need = want & points
        if not need:
            continue
        font = TTFont(path)
        options = subset.Options()
        options.layout_features = []
        options.name_IDs = ['*']
        options.notdef_outline = True
        sub = subset.Subsetter(options)
        sub.populate(unicodes=need)
        sub.subset(font)
        for t in ('GSUB', 'GPOS', 'GDEF'):
            if t in font:
                del font[t]
        tmp = OUT.parent / f'.part{i}.ttf'
        tmp.parent.mkdir(parents=True, exist_ok=True)
        font.flavor = None
        font.save(tmp)
        parts.append(tmp)
    merged = Merger().merge([str(p) for p in parts])
    for p in parts:
        p.unlink()
    merged.flavor = 'woff2'
    merged.save(OUT)
    (OUT.parent / 'hand-OFL.txt').write_text((PKG / 'OFL.txt').read_text(encoding='utf-8'), encoding='utf-8')
    have = set(merged.getBestCmap())
    missing = sorted(chr(c) for c in want - have if c > 0x7f)
    print('wrote', OUT.relative_to(ROOT), OUT.stat().st_size // 1024, 'KB;', len(have), 'chars; missing:', ''.join(missing) or 'none')


if __name__ == '__main__':
    main()
