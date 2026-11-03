"""The corner window as it sits on a desktop, for the store and the website.

    python3 tools/sim/desktop.py <corner window png> <out png>

Draws a plain warm desktop at 1920x1080 with a generic document window and a taskbar (no real app or
system is imitated), then puts the corner window bottom right at twice its size, pixels kept sharp.
"""

import sys

from PIL import Image, ImageDraw, ImageFilter

W, H = 1920, 1080
TASKBAR = 56


def desktop() -> Image.Image:
    img = Image.new("RGB", (W, H))
    top, bottom = (214, 196, 168), (178, 150, 120)
    px = img.load()
    for y in range(H):
        t = y / (H - 1)
        c = tuple(round(a + (b - a) * t) for a, b in zip(top, bottom))
        for x in range(W):
            px[x, y] = c
    d = ImageDraw.Draw(img)
    d.rectangle([0, H - TASKBAR, W, H], fill=(46, 36, 31))
    return img


def document(img: Image.Image) -> None:
    x0, y0, x1, y1 = 160, 110, 1260, 810
    shadow = Image.new("RGBA", img.size, (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rectangle([x0 + 6, y0 + 10, x1 + 6, y1 + 10], fill=(60, 40, 20, 90))
    img.paste(shadow.filter(ImageFilter.GaussianBlur(14)), (0, 0), shadow.filter(ImageFilter.GaussianBlur(14)))
    d = ImageDraw.Draw(img)
    d.rectangle([x0, y0, x1, y1], fill=(249, 247, 243))
    d.rectangle([x0, y0, x1, y0 + 44], fill=(232, 225, 214))
    widths = [0.75, 0.64, 0.83, 0.51, 0.70, 0.82, 0.59, 0.46, 0.77, 0.66, 0.55, 0.81, 0.39, 0.62]
    for i, w in enumerate(widths):
        y = y0 + 90 + i * 40
        d.rounded_rectangle([x0 + 60, y, x0 + 60 + int((x1 - x0 - 120) * w), y + 16], radius=8, fill=(224, 218, 208))


def main(window_png: str, out: str) -> None:
    img = desktop()
    document(img)
    mini = Image.open(window_png).convert("RGB")
    mini = mini.resize((mini.width * 2, mini.height * 2), Image.NEAREST)
    x = W - mini.width - 40
    y = H - TASKBAR - mini.height - 36
    shadow = Image.new("RGBA", img.size, (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rectangle([x + 4, y + 8, x + mini.width + 4, y + mini.height + 8], fill=(40, 25, 10, 110))
    blurred = shadow.filter(ImageFilter.GaussianBlur(12))
    img.paste(blurred, (0, 0), blurred)
    img.paste(mini, (x, y))
    img.save(out)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
