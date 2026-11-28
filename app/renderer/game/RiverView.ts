import Phaser from 'phaser';
import lifeUrl from '../../../assets/sprites/river-life.png';
import life from '../../../assets/sprites/river-life.json';
import type { Period } from './daytime';
import { riverOut, riverThings, WATER, type RiverOut, type Thing } from './riverlife';
import type { Outside } from './streetdecor';
import { RIVER } from './town';

/** The pieces' frames on river-life.png (scripts/art/riverlife.py). */
const FRAMES = (life as { frames: Record<string, number[]> }).frames;
/** Glints of sun across the water: along the river street and a few rows down, each twinkling in its own time. */
const GLINTS = Array.from({ length: 10 }, (_, i) => ({ x: WATER.left + 16 + i * 64 + ((i * 37) % 23), y: WATER.top + 4 + ((i * 7) % 15) }));
/** A raindrop's ring: a new one this often while it rains on the river in view, each spreading over three pictures. */
const RIPPLE_EVERY_MS = 90;
const RIPPLE_STEP_MS = 180;
const RIPPLES = 24;

export function preloadRiverLife(load: Phaser.Loader.LoaderPlugin) {
  load.image('river-life', lifeUrl);
}

/**
 * The river in front of the river street, drawn (plan-2.0.md J5): the ice laid over the water in the winter's snow, the
 * sun's glints, the rain's rings, and what swims and floats on it (riverlife.ts). The lanterns are drawn over the
 * shop's light, so they glow after dark.
 */
export class RiverView {
  private out: RiverOut = riverOut({ season: 'spring', holiday: null, sky: 'clear' }, 'day');
  private calm = false;
  private readonly ice: Phaser.GameObjects.Image;
  private readonly glints: Phaser.GameObjects.Image[];
  private readonly ripples: { image: Phaser.GameObjects.Image; born: number }[] = [];
  private readonly pieces: Phaser.GameObjects.Image[] = [];
  private nextRipple = 0;
  /** What is on the water now, for the scenarios. */
  shown: Thing[] = [];

  constructor(private scene: Phaser.Scene, private depth: { water: number; glow: number }) {
    const sheet = scene.textures.get('river-life');
    for (const [name, [x, y, w, h]] of Object.entries(FRAMES)) if (!sheet.has(name)) sheet.add(name, 0, x, y, w, h);
    this.ice = scene.add.image(RIVER.x + WATER.left, WATER.top, 'river-life', 'ice').setOrigin(0).setDepth(depth.water).setVisible(false);
    this.glints = GLINTS.map((g) => scene.add.image(RIVER.x + g.x, g.y, 'river-life', 'glint').setDepth(depth.water).setVisible(false));
  }

  /** The day changed: the weather, the festival, the hour, or less motion asked for. */
  set(outside: Outside, period: Period, calm: boolean) {
    this.out = riverOut(outside, period);
    this.calm = calm;
    this.ice.setVisible(this.out.water === 'ice');
    for (const g of this.glints) g.setVisible(this.out.water === 'glint').setAlpha(0.7);
    if (this.out.water !== 'ripples' || calm) for (const r of this.ripples) r.image.setVisible(false);
  }

  update(now: number) {
    if (this.out.water === 'glint' && !this.calm) this.glints.forEach((g, i) => g.setAlpha(0.35 + 0.65 * Math.max(0, Math.sin(now / 650 + i * 1.7))));
    if (this.out.water === 'ripples' && !this.calm) this.rain(now);
    this.shown = riverThings(now, this.out, this.calm);
    this.shown.forEach((t, i) => {
      const piece = (this.pieces[i] ??= this.scene.add.image(0, 0, 'river-life', 'duck-0').setOrigin(0.5, 1));
      const glows = t.kind === 'lantern' || t.kind === 'moonlantern';
      piece.setTexture('river-life', t.kind === 'duck' ? `duck-${t.frame}` : t.kind).setPosition(RIVER.x + t.x, t.y)
        .setFlipX(t.flip).setDepth(glows ? this.depth.glow : this.depth.water + t.y / 1000).setVisible(true);
    });
    for (let i = this.shown.length; i < this.pieces.length; i++) this.pieces[i].setVisible(false);
  }

  /** For the scenarios: the water, whether the ice and the glints are out, the rain's rings spreading, what is on it. */
  seen() {
    return {
      water: this.out.water, ice: this.ice.visible, glints: this.glints.filter((g) => g.visible).length,
      ripples: this.ripples.filter((r) => r.image.visible).length, things: this.shown.map((t) => ({ kind: t.kind, x: t.x })),
    };
  }

  /** Rings spreading where the rain falls on the stretch of river in view. */
  private rain(now: number) {
    const cam = this.scene.cameras.main;
    const left = Math.max(cam.scrollX, RIVER.x);
    const right = Math.min(cam.scrollX + cam.width, RIVER.x + RIVER.width);
    for (const r of this.ripples) {
      const step = Math.floor((now - r.born) / RIPPLE_STEP_MS);
      if (step > 2) r.image.setVisible(false);
      else r.image.setFrame(`ripple-${step}`);
    }
    if (right <= left || now < this.nextRipple) return;
    this.nextRipple = now + RIPPLE_EVERY_MS;
    let slot = this.ripples.find((r) => !r.image.visible);
    if (!slot && this.ripples.length < RIPPLES) {
      slot = { image: this.scene.add.image(0, 0, 'river-life', 'ripple-0').setDepth(this.depth.water), born: 0 };
      this.ripples.push(slot);
    }
    if (!slot) return;
    slot.born = now;
    slot.image.setFrame('ripple-0').setPosition(Phaser.Math.Between(left, right), Phaser.Math.Between(WATER.top + 3, WATER.bottom - 2)).setVisible(true);
  }
}
