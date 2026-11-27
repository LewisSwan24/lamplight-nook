import { type Period, periodAt } from './daytime';
import { FRONTS, TOWN } from './town';
import type { Sky } from './weather';

/**
 * People on the street (plan-1.6.md F3): strangers walking from one side of the view to the other, some stopping at a door
 * for a moment to look in. They do not go in and say nothing; clicked, one looks round. How many are out goes with the
 * hour: most at the morning and evening rush, nobody deep in the night; in the rain fewer, and quicker. Pure: who walks
 * where, moved on only by `tick`, which does nothing while the street is not on screen (as D8 saves the computer).
 * StreetScene draws them.
 */

/** How many looks there are, assets/sprites/passer-<n>.png (scripts/art/characters.py, PASSERS). */
export const PASSER_LOOKS = 10;
/** Where feet go along the pavement: in front of the lamps, the benches and the flowers (town.json props), on two lanes. */
export const LANES = [TOWN.kerb + 17, TOWN.road - 5] as const;
/** A clicked passer looks round for this long. */
export const GLANCE_MS = 1200;
/** Pixels per second; a stroll, a little slower than the staff on an errand. */
const STROLL = 30;
/** How likely one is to stop at a door in the view, and for how long. */
const STOP_CHANCE = 0.35;
const STOP_MS = { min: 1500, more: 1500 };
/** Between one leaving and the next coming along. */
const GAP_MS = { min: 1500, more: 2500 };
/** How far past the view's edge one sets off, and is let go of. */
const EDGE = 12;
const GONE = 16;
/** The box a click finds someone in, around their feet. */
const HIT = { x: 6, up: 28 };

/** How many are out at this hour in this weather. */
export function crowdSize(hour: number, sky: Sky): number {
  const base = hour < 6 || hour >= 23 ? 0 : hour < 7 ? 3 : hour < 10 ? 5 : hour < 17 ? 3 : hour < 20 ? 5 : 2;
  if (!base) return 0;
  return sky === 'rain' || sky === 'snow' || sky === 'wind' || sky === 'storm' ? Math.max(1, Math.floor(base / 2)) : base;
}

/** Quicker in the rain and the storm, to get out of it; slower into the wind. */
export const passerSpeed = (sky: Sky): number => (sky === 'rain' || sky === 'storm' ? STROLL * 1.5 : sky === 'wind' ? STROLL * 0.7 : STROLL);

/** An hour in the middle of each part of the day, for when the shop shows one the clock does not (a test, a screenshot). */
const MIDDLE: Record<Period, number> = { dawn: 6, day: 12, dusk: 18, night: 2 };
/** The hour the street goes by: the clock's while it agrees with the part of the day the shop shows. */
export const hourOf = (period: Period, hour: number): number => (periodAt(hour) === period ? hour : MIDDLE[period]);

export type Passer = {
  id: number;
  look: number;
  x: number;
  y: number;
  dir: 1 | -1;
  speed: number;
  /** The door they stop at, if they stop. */
  stopAt: number | null;
  /** How long they stand there, and whether they have. */
  stopMs: number;
  stopped: boolean;
  /** How long they still look round for, after a click. */
  glanceMs: number;
  pose: 'walk' | 'look' | 'glance';
};

export type CrowdAt = { hour: number; sky: Sky; view: { left: number; right: number }; onScreen: boolean };

export class Crowd {
  readonly passers: Passer[] = [];
  private next = 1;
  private gap = 0;
  private seen = false;

  constructor(private rng: () => number = Math.random) {}

  /** Move everyone on by `dt` milliseconds; let go of who has walked out of the view, and send someone along if few are out. */
  tick(dt: number, at: CrowdAt) {
    if (!at.onScreen) return;
    const target = crowdSize(at.hour, at.sky);
    if (!this.seen) {
      this.seen = true;
      // The first look along the street finds people already on it, not an empty pavement filling up.
      while (this.passers.length < target) this.passers.push(this.make(at, at.view.left + this.rng() * (at.view.right - at.view.left)));
      return;
    }
    const speed = passerSpeed(at.sky);
    for (const p of this.passers) this.step(p, dt, speed);
    for (let i = this.passers.length - 1; i >= 0; i--) {
      const p = this.passers[i];
      const out = p.dir > 0 ? p.x > at.view.right + GONE : p.x < at.view.left - GONE;
      // Past either end of the town too, as far out as past the view: at an end they set off from beyond it (plan-2.0.md J1).
      if (out || p.x < -GONE || p.x > TOWN.width + GONE) this.passers.splice(i, 1);
    }
    if (this.passers.length >= target) return;
    this.gap -= dt;
    if (this.gap > 0) return;
    this.gap = GAP_MS.min + this.rng() * GAP_MS.more;
    const p = this.make(at, null);
    this.passers.push(p);
  }

  /** The one clicked looks round for a moment. */
  glance(id: number) {
    const p = this.passers.find((q) => q.id === id);
    if (!p) return;
    p.glanceMs = GLANCE_MS;
    p.pose = 'glance';
  }

  /** Who stands at a point on the street, the nearest the viewer first. */
  idAt(x: number, y: number): number | null {
    const hit = this.passers.filter((p) => Math.abs(x - p.x) <= HIT.x && y <= p.y && y >= p.y - HIT.up);
    return hit.sort((a, b) => b.y - a.y)[0]?.id ?? null;
  }

  private step(p: Passer, dt: number, speed: number) {
    if (p.pose === 'glance') {
      p.glanceMs -= dt;
      if (p.glanceMs <= 0) p.pose = p.stopAt !== null && p.x === p.stopAt && !p.stopped ? 'look' : 'walk';
      return;
    }
    if (p.pose === 'look') {
      p.stopMs -= dt;
      if (p.stopMs <= 0) {
        p.stopped = true;
        p.pose = 'walk';
      }
      return;
    }
    p.speed = speed;
    const to = p.x + p.dir * speed * (dt / 1000);
    if (p.stopAt !== null && !p.stopped && (p.dir > 0 ? to >= p.stopAt : to <= p.stopAt)) {
      p.x = p.stopAt;
      p.pose = 'look';
      return;
    }
    p.x = to;
  }

  /** Someone new: at `x` in the view when the street is first seen, or else setting off from just past one edge. */
  private make(at: CrowdAt, x: number | null): Passer {
    const dir: 1 | -1 = this.rng() < 0.5 ? 1 : -1;
    const from = x ?? (dir > 0 ? at.view.left - EDGE : at.view.right + EDGE);
    const y = LANES[this.rng() < 0.5 ? 0 : 1];
    const look = 1 + Math.min(PASSER_LOOKS - 1, Math.floor(this.rng() * PASSER_LOOKS));
    const doors = FRONTS.map((f) => f.door).filter((d) => d >= at.view.left && d <= at.view.right && (dir > 0 ? d > from : d < from));
    const stopAt = this.rng() < STOP_CHANCE && doors.length ? doors.sort((a, b) => Math.abs(a - from) - Math.abs(b - from))[0] : null;
    return {
      id: this.next++, look, x: from, y, dir, speed: passerSpeed(at.sky), stopAt,
      stopMs: STOP_MS.min + this.rng() * STOP_MS.more, stopped: false, glanceMs: 0, pose: 'walk',
    };
  }
}
