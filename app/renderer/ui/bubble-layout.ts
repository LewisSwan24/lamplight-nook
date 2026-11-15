/**
 * Where the speech bubbles go this frame. Several people can talk at once in one corner of the room, and a card can
 * open over any of them: words stay readable or are not shown at all, never half covered.
 */

/** One bubble, anchored at the middle of its bottom edge. */
export type BubbleBox = { key: string; x: number; y: number; w: number; h: number; iconOnly: boolean };
export type Rect = { left: number; top: number; right: number; bottom: number };
export type BubblePlace = { x: number; y: number; visible: boolean };

const GAP = 4;
/** Words keep this far from the sides of the window. */
const EDGE = 4;

const boxAt = (b: BubbleBox, y: number, x = b.x): Rect => ({ left: x - b.w / 2, right: x + b.w / 2, top: y - b.h, bottom: y });
const touches = (a: Rect, b: Rect) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

/**
 * Words come first, in the order given: a bubble that would land on another moves up above it. A bubble a card would
 * cut, or that runs out of the top of the window, is hidden and takes no room. One running off the side moves back in. Mood icons sit on someone's head, so
 * they do not move: one that would cover anything is hidden until it is clear. `marks` are the flags over the heads of two
 * crews at work (road-to-1.2.md B9): words move up past them as past another bubble, so it stays plain who works for which.
 */
export function placeBubbles(bubbles: BubbleBox[], cards: Rect[], keepClear: Rect[] = [], width = Infinity, marks: Rect[] = []): Map<string, BubblePlace> {
  const places = new Map<string, BubblePlace>();
  const taken: Rect[] = [...marks];
  const blocked = (box: Rect) => cards.some((c) => touches(box, c));

  for (const b of bubbles.filter((x) => !x.iconOnly)) {
    let y = b.y;
    // Words go beside what must stay readable, like the chalk on the blackboard.
    const inWay = keepClear.find((k) => touches(boxAt(b, y), k));
    const wanted = inWay ? inWay.right + GAP + b.w / 2 : b.x;
    const x = Math.max(EDGE + b.w / 2, Math.min(width - EDGE - b.w / 2, wanted));
    for (let hit = taken.find((t) => touches(boxAt(b, y, x), t)); hit; hit = taken.find((t) => touches(boxAt(b, y, x), t))) {
      y = hit.top - GAP;
    }
    const box = boxAt(b, y, x);
    const visible = box.top >= 0 && !blocked(box);
    if (visible) taken.push(box);
    places.set(b.key, { x, y, visible });
  }

  for (const b of bubbles.filter((x) => x.iconOnly)) {
    const box = boxAt(b, b.y);
    const visible = !blocked(box) && !taken.some((t) => touches(box, t));
    if (visible) taken.push(box);
    places.set(b.key, { x: b.x, y: b.y, visible });
  }
  return places;
}
