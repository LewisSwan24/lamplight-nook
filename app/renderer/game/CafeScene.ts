import Phaser from 'phaser';
import adengUrl from '../../../assets/sprites/adeng.png';
import cafeUrl from '../../../assets/sprites/cafe.png';
import catUrl from '../../../assets/sprites/cat.png';
import laoshiUrl from '../../../assets/sprites/laoshi.png';
import xiaojuUrl from '../../../assets/sprites/xiaoju.png';
import type { ActorId, AnchorId, Bubble } from '../../shared/types';
import { ACTORS, ANCHORS, ZONES, pathBetween, standPoint, type Facing } from './layout';
import { CAT_FRAME, DIRECTIONS, STAFF_ANIMS, STAFF_FRAME, STAFF_IDS, animKey, facingTowards, staffFrames } from './sprites';

const WALK_SPEED = 40; // canvas pixels per second
const SHEETS: Record<ActorId, string> = { adeng: adengUrl, xiaoju: xiaojuUrl, laoshi: laoshiUrl, cat: catUrl };

type Actor = {
  id: ActorId;
  sprite: Phaser.GameObjects.Sprite;
  facing: Facing;
  /** The animation the character should hold when not walking. */
  pose: string;
  height: number;
  tween?: Phaser.Tweens.TweenChain;
};

/**
 * Text label positions in canvas coordinates. Text is drawn by an HTML overlay:
 * the canvas is 320x180 scaled up, so CJK text drawn on it would be blurry.
 */
export type LabelPos = { key: string; text: string; x: number; y: number; kind: 'zone' | 'actor' | 'bubble' };

/** Bubble icons; plain symbols until the bubble sprites are in. */
const BUBBLE_ICON: Record<Bubble, string> = {
  idea: '\u{1F4A1}', sweat: '\u{1F4A6}', question: '?', note: '✎', tea: '☕', alert: '!', dots: '...', zzz: 'z',
};

/** The cafe: a pixel-art background with the three staff and the shop cat as animated sprites. */
export class CafeScene extends Phaser.Scene {
  private actors = new Map<ActorId, Actor>();
  /** What each character is currently saying (or just a bubble icon). */
  private speech = new Map<ActorId, string>();
  /** Called when a character or the counter is clicked. */
  onActorClick: (actor: ActorId) => void = () => {};
  onCounterClick: () => void = () => {};

  constructor() {
    super('cafe');
  }

  preload() {
    this.load.image('cafe', cafeUrl);
    for (const id of STAFF_IDS) this.load.spritesheet(id, SHEETS[id], { frameWidth: STAFF_FRAME.width, frameHeight: STAFF_FRAME.height });
    this.load.spritesheet('cat', SHEETS.cat, { frameWidth: CAT_FRAME.width, frameHeight: CAT_FRAME.height });
  }

  create() {
    this.add.image(0, 0, 'cafe').setOrigin(0);
    this.createAnims();
    const counter = ZONES.find((z) => z.id === 'counter')!;
    this.add
      .zone(counter.x, counter.y, counter.w, counter.h)
      .setOrigin(0)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.onCounterClick());
    for (const a of ACTORS) {
      const p = { ...standPoint(a.home, a.id), facing: ANCHORS[a.home].facing };
      const sprite = this.add.sprite(p.x, p.y, a.id).setOrigin(0.5, 1).setDepth(p.y);
      sprite.setInteractive({ useHandCursor: true, pixelPerfect: true }).on('pointerdown', () => this.onActorClick(a.id));
      const actor: Actor = { id: a.id, sprite, facing: p.facing, pose: a.id === 'cat' ? 'lie' : 'idle', height: a.height };
      this.actors.set(a.id, actor);
      this.hold(actor);
    }
  }

  private createAnims() {
    for (const id of STAFF_IDS) {
      for (const [name, def] of Object.entries(STAFF_ANIMS)) {
        const dirs = def.dirs === 'front' ? [DIRECTIONS[3]] : def.dirs;
        for (const facing of dirs) {
          this.anims.create({
            key: animKey(id, name, facing),
            frames: this.anims.generateFrameNumbers(id, { frames: staffFrames(name, facing) }),
            frameRate: def.fps,
            repeat: def.repeat,
          });
        }
      }
    }
    this.anims.create({ key: 'cat-lie', frames: this.anims.generateFrameNumbers('cat', {}), frameRate: 8, repeat: -1 });
  }

  /** Play the actor's current pose at its current facing. */
  private hold(actor: Actor) {
    const key = actor.id === 'cat' ? 'cat-lie' : animKey(actor.id, actor.pose, actor.facing);
    if (this.anims.exists(key)) actor.sprite.play(key, true);
  }

  /** Switch a character to an animation (a name from STAFF_ANIMS); unknown names keep the current pose. */
  play(actorId: ActorId, anim: string | undefined) {
    const actor = this.actors.get(actorId);
    if (!actor || actorId === 'cat' || !anim || anim === 'walk' || !STAFF_ANIMS[anim]) return;
    actor.pose = anim;
    if (!actor.tween?.isPlaying()) this.hold(actor);
  }

  /** Show a line above a character (text may be empty to show just the bubble). Pass null and no bubble to clear. */
  say(actorId: ActorId, text: string | null, bubble?: Bubble) {
    if (text === null && !bubble) this.speech.delete(actorId);
    else this.speech.set(actorId, [bubble ? BUBBLE_ICON[bubble] : '', text ?? ''].filter(Boolean).join(' '));
  }

  /** Walk a character along the aisle to an anchor, playing the walk cycle; resolves on arrival. */
  walkTo(actorId: ActorId, anchor: AnchorId): Promise<void> {
    const actor = this.actors.get(actorId);
    if (!actor) return Promise.resolve();
    actor.tween?.stop();
    const { sprite } = actor;
    let from = { x: sprite.x, y: sprite.y };
    const steps = pathBetween(from, anchor, actorId).map((to) => {
      const start = from;
      const duration = (Math.hypot(to.x - start.x, to.y - start.y) / WALK_SPEED) * 1000;
      from = to;
      return {
        targets: [sprite],
        x: to.x,
        y: to.y,
        duration,
        ease: 'Linear',
        onStart: () => {
          actor.facing = facingTowards(start, to);
          if (actorId !== 'cat') sprite.play(animKey(actorId, 'walk', actor.facing), true);
        },
        onUpdate: () => sprite.setDepth(sprite.y),
      };
    });
    if (!steps.length) return Promise.resolve();
    return new Promise((done) => {
      const arrive = () => {
        actor.facing = ANCHORS[anchor].facing;
        this.hold(actor);
        done();
      };
      actor.tween = this.tweens.chain({ tweens: steps, onComplete: arrive, onStop: arrive });
    });
  }

  labels(): LabelPos[] {
    // The art shows what each zone is; only the counter keeps its name, as a hint that it can be clicked.
    const zones = ZONES.filter((z) => z.id === 'counter').map((z) => ({ key: `z-${z.id}`, text: z.label, x: z.x + 2, y: z.y - 8, kind: 'zone' as const }));
    const actors = ACTORS.map((a) => {
      const { sprite, height } = this.actors.get(a.id)!;
      return { key: `a-${a.id}`, text: a.name, x: sprite.x, y: sprite.y - height - 1, kind: 'actor' as const };
    });
    const bubbles = ACTORS.filter((a) => this.speech.has(a.id)).map((a) => {
      const { sprite, height } = this.actors.get(a.id)!;
      return { key: `b-${a.id}`, text: this.speech.get(a.id)!, x: sprite.x, y: sprite.y - height - 9, kind: 'bubble' as const };
    });
    return [...zones, ...actors, ...bubbles];
  }
}
