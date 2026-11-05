/**
 * Finding a way across a floor. Pure: an area is its bounds and what stands on it, and the same two points always give
 * the same walk. Walks run on a 2px grid along the axes with as few turns as they can, and their corners are rounded
 * as far as the furniture allows.
 */
export type Point = { x: number; y: number };
export type Box = { left: number; right: number; top: number; bottom: number };
export type Area = Box & { obstacles: Box[] };

/** The room a walker's feet and shadow take up. */
const FEET = { x: 5, up: 2, down: 1 };
const STEP = 2;
/** A turn costs as much as this many pixels of walking, so a walk does not zigzag for nothing. */
const TURN = 24;
/** How far a walker may be from the grid: where a spot tight against furniture joins it. */
const JOIN = 16;
const CORNER = 6;

export const hitsFeet = (p: Point, b: Box) =>
  p.x + FEET.x > b.left && p.x - FEET.x < b.right && p.y + FEET.down > b.top && p.y - FEET.up < b.bottom;

const clear = (area: Area, p: Point) => !area.obstacles.some((b) => hitsFeet(p, b));
const inBounds = (area: Area, p: Point) => p.x >= area.left && p.x <= area.right && p.y >= area.top && p.y <= area.bottom;

function lineClear(area: Area, a: Point, b: Point) {
  const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y)));
  for (let s = 0; s <= steps; s++) {
    if (!clear(area, { x: a.x + ((b.x - a.x) * s) / steps, y: a.y + ((b.y - a.y) * s) / steps })) return false;
  }
  return true;
}

/** The nearest grid point a walker can step to in a straight line, nearest first and in a fixed order. */
function join(area: Area, p: Point): Point {
  const x0 = Math.round(p.x / STEP) * STEP;
  const y0 = Math.round(p.y / STEP) * STEP;
  const near: Point[] = [];
  for (let dy = -JOIN; dy <= JOIN; dy += STEP) for (let dx = -JOIN; dx <= JOIN; dx += STEP) near.push({ x: x0 + dx, y: y0 + dy });
  near.sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y) || b.y - a.y || a.x - b.x);
  // A spot may be tight against something (a chair): only what it is not already touching can get in the way.
  const free = { ...area, obstacles: area.obstacles.filter((b) => !hitsFeet(p, b)) };
  return near.find((q) => inBounds(area, q) && clear(area, q) && lineClear(free, p, q))!;
}

const DIRS = [{ x: 0, y: STEP }, { x: STEP, y: 0 }, { x: 0, y: -STEP }, { x: -STEP, y: 0 }];

/** A* over (grid point, direction): the corners of the cheapest walk from one grid point to another. */
function search(area: Area, from: Point, to: Point): Point[] {
  const key = (p: Point, d: number) => `${p.x},${p.y},${d}`;
  const left = (p: Point) => Math.abs(p.x - to.x) + Math.abs(p.y - to.y);
  type Node = { p: Point; d: number; cost: number; order: number; back?: Node };
  let order = 0;
  const open: Node[] = [];
  const best = new Map<string, number>();
  const push = (n: Node) => {
    open.push(n);
    let i = open.length - 1;
    const f = (m: Node) => m.cost + left(m.p);
    const before = (a: Node, b: Node) => f(a) < f(b) || (f(a) === f(b) && a.order < b.order);
    while (i > 0) {
      const up = (i - 1) >> 1;
      if (!before(open[i], open[up])) break;
      [open[i], open[up]] = [open[up], open[i]];
      i = up;
    }
  };
  const pop = () => {
    const f = (m: Node) => m.cost + left(m.p);
    const before = (a: Node, b: Node) => f(a) < f(b) || (f(a) === f(b) && a.order < b.order);
    const top = open[0];
    const last = open.pop()!;
    if (open.length) {
      open[0] = last;
      for (let i = 0; ;) {
        const [l, r] = [2 * i + 1, 2 * i + 2];
        let m = i;
        if (l < open.length && before(open[l], open[m])) m = l;
        if (r < open.length && before(open[r], open[m])) m = r;
        if (m === i) break;
        [open[i], open[m]] = [open[m], open[i]];
        i = m;
      }
    }
    return top;
  };
  DIRS.forEach((_, d) => push({ p: from, d, cost: 0, order: order++ }));
  while (open.length) {
    const n = pop();
    if (n.p.x === to.x && n.p.y === to.y) {
      const corners: Point[] = [n.p];
      for (let m: Node | undefined = n; m?.back; m = m.back) {
        if (m.back.d !== m.d) corners.unshift(m.back.p);
      }
      return [from, ...corners];
    }
    if ((best.get(key(n.p, n.d)) ?? Infinity) < n.cost) continue;
    DIRS.forEach((dir, d) => {
      const p = { x: n.p.x + dir.x, y: n.p.y + dir.y };
      if (!inBounds(area, p) || !clear(area, p)) return;
      const cost = n.cost + STEP + (d === n.d ? 0 : TURN);
      if ((best.get(key(p, d)) ?? Infinity) <= cost) return;
      best.set(key(p, d), cost);
      push({ p, d, cost, order: order++, back: n });
    });
  }
  throw new Error(`no way from ${from.x},${from.y} to ${to.x},${to.y}`);
}

/** Drop points that lie on the way between their neighbours, and repeats. */
function straighten(points: Point[]): Point[] {
  const out: Point[] = [];
  for (const p of points) {
    const a = out.at(-2);
    const b = out.at(-1);
    if (b && b.x === p.x && b.y === p.y) continue;
    if (a && b && (a.x - b.x) * (b.y - p.y) === (a.y - b.y) * (b.x - p.x) && (a.x - b.x) * (b.x - p.x) + (a.y - b.y) * (b.y - p.y) > 0) out[out.length - 1] = p;
    else out.push(p);
  }
  return out;
}

/** Cut each corner as far as the furniture leaves room for. */
function round(area: Area, points: Point[]): Point[] {
  if (points.length < 3) return points;
  const out: Point[] = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const [a, c, b] = [points[i - 1], points[i], points[i + 1]];
    const [lenIn, lenOut] = [Math.hypot(c.x - a.x, c.y - a.y), Math.hypot(b.x - c.x, b.y - c.y)];
    let done = false;
    for (let cut = Math.min(CORNER, lenIn / 2, lenOut / 2); cut >= 2 && !done; cut -= 2) {
      const p = { x: Math.round(c.x - ((c.x - a.x) / lenIn) * cut), y: Math.round(c.y - ((c.y - a.y) / lenIn) * cut) };
      const q = { x: Math.round(c.x + ((b.x - c.x) / lenOut) * cut), y: Math.round(c.y + ((b.y - c.y) / lenOut) * cut) };
      if (lineClear(area, p, q)) {
        out.push(p, q);
        done = true;
      }
    }
    if (!done) out.push(c);
  }
  out.push(points[points.length - 1]);
  return out;
}

/** The walk from one point to another, leaving out where it starts. */
export function findPath(area: Area, from: Point, { x, y }: Point): Point[] {
  const to = { x, y };
  if (from.x === x && from.y === y) return [];
  if (lineClear(area, from, to) && (from.x === x || from.y === y)) return [to];
  const [a, b] = [join(area, from), join(area, to)];
  return round(area, straighten([from, ...search(area, a, b), to])).slice(1);
}
