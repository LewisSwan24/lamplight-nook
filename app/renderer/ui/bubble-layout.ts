/**
 * Where the speech bubbles go this frame. Several people can talk at once in one corner of the room, and a card can
 * open over any of them: words stay readable or are not shown at all, never half covered.
 */

/** One bubble, anchored at the middle of its bottom edge. */
export type BubbleBox = { key: string; x: number; y: number; w: number; h: number; iconOnly: boolean };
export type Rect = { left: number; top: number; right: number; bottom: number };
export type BubblePlace = { y: number; visible: boolean };

const GAP = 4;

const boxAt = (b: BubbleBox, y: number): Rect => ({ left: b.x - b.w / 2, right: b.x + b.w / 2, top: y - b.h, bottom: y });
const touches = (a: Rect, b: Rect) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

/**
 * Words come first, in the order given: a bubble that would land on another moves up above it. A bubble a card would
 * cut, or that runs out of the top of the window, is hidden and takes no room. Mood icons sit on someone's head, so
 * they do not move: one that would cover anything is hidden until it is clear.
 */
export function placeBubbles(bubbles: BubbleBox[], cards: Rect[]): Map<string, BubblePlace> {
  const places = new Map<string, BubblePlace>();
  const taken: Rect[] = [];
  const blocked = (box: Rect) => cards.some((c) => touches(box, c));

  for (const b of bubbles.filter((x) => !x.iconOnly)) {
    let y = b.y;
    for (let hit = taken.find((t) => touches(boxAt(b, y), t)); hit; hit = taken.find((t) => touches(boxAt(b, y), t))) {
      y = hit.top - GAP;
    }
    const box = boxAt(b, y);
    const visible = box.top >= 0 && !blocked(box);
    if (visible) taken.push(box);
    places.set(b.key, { y, visible });
  }

  for (const b of bubbles.filter((x) => x.iconOnly)) {
    const box = boxAt(b, b.y);
    const visible = !blocked(box) && !taken.some((t) => touches(box, t));
    if (visible) taken.push(box);
    places.set(b.key, { y: b.y, visible });
  }
  return places;
}
