import Phaser from 'phaser';
import type { ActorId, AnchorId, Bubble } from '../../shared/types';
import { ACTORS, ANCHORS, ZONES, pathBetween } from './layout';

const WALK_SPEED = 40; // canvas pixels per second

type Actor = { id: ActorId; body: Phaser.GameObjects.Rectangle; tween?: Phaser.Tweens.TweenChain };

/**
 * Text label positions in canvas coordinates. Text is drawn by an HTML overlay:
 * the canvas is 320x180 scaled up, so CJK text drawn on it would be blurry.
 */
export type LabelPos = { key: string; text: string; x: number; y: number; kind: 'zone' | 'actor' | 'bubble' };

/** Bubble icons; plain symbols until the sprite art is in. */
const BUBBLE_ICON: Record<Bubble, string> = {
  idea: '\u{1F4A1}', sweat: '\u{1F4A6}', question: '?', note: '\u270E', tea: '\u2615', alert: '!', dots: '...', zzz: 'z',
};

/** Placeholder scene: colored zones and blocks for characters, to validate layout, scaling and movement. */
export class CafeScene extends Phaser.Scene {
  private actors = new Map<ActorId, Actor>();
  /** What each character is currently saying (or just a bubble icon). */
  private speech = new Map<ActorId, string>();
  /** Current state and animation, shown next to the name while art is placeholder. */
  private status = new Map<ActorId, string>();
  /** Called when a character or the counter is clicked. */
  onActorClick: (actor: ActorId) => void = () => {};
  onCounterClick: () => void = () => {};

  constructor() {
    super('cafe');
  }

  create() {
    this.add.rectangle(0, 0, 320, 180, 0xf2e3c9).setOrigin(0);
    this.add.rectangle(0, 100, 320, 80, 0x7a5236, 0.35).setOrigin(0);
    for (const z of ZONES) {
      const zone = this.add.rectangle(z.x, z.y, z.w, z.h, z.color).setOrigin(0).setStrokeStyle(1, 0x3b2a1e, 0.6);
      if (z.id === 'counter') zone.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.onCounterClick());
    }
    for (const [id, a] of Object.entries(ANCHORS)) {
      this.add.circle(a.x, a.y, 1.5, 0xc8322b).setAlpha(0.7).setName(`anchor-${id}`);
    }
    for (const a of ACTORS) {
      const p = ANCHORS[a.home];
      const body = this.add.rectangle(p.x, p.y, a.w, a.h, a.color).setOrigin(0.5, 1).setStrokeStyle(1, 0x222222);
      body.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.onActorClick(a.id));
      this.actors.set(a.id, { id: a.id, body });
    }
  }

  /** Show a line above a character (text may be empty to show just the bubble). Pass null and no bubble to clear. */
  say(actorId: ActorId, text: string | null, bubble?: Bubble) {
    if (text === null && !bubble) this.speech.delete(actorId);
    else this.speech.set(actorId, [bubble ? BUBBLE_ICON[bubble] : '', text ?? ''].filter(Boolean).join(' '));
  }

  setStatus(actorId: ActorId, text: string) {
    this.status.set(actorId, text);
  }

  /** Walk a character along the aisle to an anchor; resolves on arrival. */
  walkTo(actorId: ActorId, anchor: AnchorId): Promise<void> {
    const actor = this.actors.get(actorId);
    if (!actor) return Promise.resolve();
    actor.tween?.stop();
    let from = { x: actor.body.x, y: actor.body.y };
    const steps = pathBetween(from, anchor).map((to) => {
      const duration = (Math.hypot(to.x - from.x, to.y - from.y) / WALK_SPEED) * 1000;
      from = to;
      return { targets: [actor.body], x: to.x, y: to.y, duration, ease: 'Linear' };
    });
    if (!steps.length) return Promise.resolve();
    return new Promise((done) => {
      actor.tween = this.tweens.chain({ tweens: steps, onComplete: () => done(), onStop: () => done() });
    });
  }

  labels(): LabelPos[] {
    const zones = ZONES.map((z) => ({ key: `z-${z.id}`, text: z.label, x: z.x + 2, y: z.y + 2, kind: 'zone' as const }));
    const actors = ACTORS.map((a) => {
      const b = this.actors.get(a.id)!.body;
      const st = this.status.get(a.id);
      return { key: `a-${a.id}`, text: st ? `${a.name} - ${st}` : a.name, x: b.x, y: b.y - b.height - 1, kind: 'actor' as const };
    });
    const bubbles = ACTORS.filter((a) => this.speech.has(a.id)).map((a) => {
      const b = this.actors.get(a.id)!.body;
      return { key: `b-${a.id}`, text: this.speech.get(a.id)!, x: b.x, y: b.y - b.height - 9, kind: 'bubble' as const };
    });
    return [...zones, ...actors, ...bubbles];
  }
}
