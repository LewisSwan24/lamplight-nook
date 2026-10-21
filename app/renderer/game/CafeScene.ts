import Phaser from 'phaser';
import adengUrl from '../../../assets/sprites/adeng.png';
import cafeUrl from '../../../assets/sprites/cafe.png';
import catUrl from '../../../assets/sprites/cat.png';
import clockUrl from '../../../assets/sprites/clock.png';
import cupUrl from '../../../assets/sprites/cup.png';
import laoshiUrl from '../../../assets/sprites/laoshi.png';
import xiaojuUrl from '../../../assets/sprites/xiaoju.png';
import type { ActorId, AnchorId, Bubble } from '../../shared/types';
import { ACTORS, ZONES, pathBetween, standPoint, type Facing } from './layout';
import { WALK_SPEED, glanceFacing, idleDelay, napDelay } from './life';
import { CAT_FRAME, DIRECTIONS, STAFF_ANIMS, STAFF_FRAME, STAFF_IDS, animKey, facingTowards, staffFrames } from './sprites';

const SHEETS: Record<ActorId, string> = { adeng: adengUrl, xiaoju: xiaojuUrl, laoshi: laoshiUrl, cat: catUrl };
/** Pause at each corner of a walk, so a turn reads as a turn. */
const CORNER_PAUSE_MS = 90;

type Actor = {
  id: ActorId;
  sprite: Phaser.GameObjects.Sprite;
  shadow: Phaser.GameObjects.Ellipse;
  facing: Facing;
  /** The anchor the character is at (or walking to). */
  at: AnchorId;
  /** The animation the character should hold when not walking. */
  pose: string;
  height: number;
  tween?: Phaser.Tweens.TweenChain;
  /** Pending idle-life timer: a glance around, or the cat's nap. */
  idle?: Phaser.Time.TimerEvent;
};

/**
 * Text label positions in canvas coordinates. Text is drawn by an HTML overlay:
 * the canvas is 320x180 scaled up, so CJK text drawn on it would be blurry.
 */
export type LabelPos = { key: string; text: string; x: number; y: number; kind: 'zone' | 'actor' | 'bubble' };

/** Bubble icons; plain symbols until the bubble sprites are in. */
const BUBBLE_ICON: Record<Bubble, string> = {
  idea: '\u{1F4A1}', sweat: '\u{1F4A6}', question: '?', note: '\u270E', tea: '\u2615', alert: '!', dots: '...', zzz: 'z',
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
    this.load.spritesheet('clock', clockUrl, { frameWidth: 16, frameHeight: 32 });
    this.load.spritesheet('cup', cupUrl, { frameWidth: 16, frameHeight: 32 });
  }

  create() {
    this.add.image(0, 0, 'cafe').setOrigin(0);
    this.createAnims();
    this.addProps();
    const counter = ZONES.find((z) => z.id === 'counter')!;
    this.add
      .zone(counter.x, counter.y, counter.w, counter.h)
      .setOrigin(0)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.onCounterClick());
    for (const a of ACTORS) {
      const spot = standPoint(a.home, a.id);
      const isCat = a.id === 'cat';
      const shadow = this.add.ellipse(spot.x, spot.y, isCat ? 20 : 11, 4, 0x3b2a1e, 0.28);
      const sprite = this.add.sprite(spot.x, spot.y, a.id).setOrigin(0.5, 1).setDepth(spot.y);
      sprite.setInteractive({ useHandCursor: true, pixelPerfect: true }).on('pointerdown', () => this.onActorClick(a.id));
      const actor: Actor = { id: a.id, sprite, shadow, facing: spot.facing, at: a.home, pose: isCat ? 'lie' : 'idle', height: a.height };
      this.actors.set(a.id, actor);
      this.hold(actor);
      this.scheduleIdle(actor);
    }
    this.addLight();
  }

  update() {
    // Shadows follow their characters; the cat's sits under its body, which is drawn left of centre.
    for (const a of this.actors.values()) a.shadow.setPosition(a.sprite.x + (a.id === 'cat' ? 3 : 0), a.sprite.y - 1).setDepth(a.sprite.depth - 0.5);
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
    this.anims.create({ key: 'clock', frames: this.anims.generateFrameNumbers('clock', {}), frameRate: 4, repeat: -1, yoyo: true });
    this.anims.create({ key: 'cup', frames: this.anims.generateFrameNumbers('cup', {}), frameRate: 5, repeat: -1 });
  }

  /** Small animated things that make the room feel lived in. */
  private addProps() {
    this.add.sprite(200, 14, 'clock').setOrigin(0).play('clock');
    this.add.sprite(256, 48, 'cup').setOrigin(0).setDepth(1).play('cup');
  }

  /** Warm pools of light from the window, the counter and the floor lamp; additive so they only brighten. */
  private addLight() {
    const size = 128;
    const tex = this.textures.createCanvas('glow', size, size)!;
    const ctx = tex.getContext();
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(255, 210, 122, 1)');
    g.addColorStop(1, 'rgba(255, 210, 122, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    tex.refresh();
    const glow = (x: number, y: number, r: number, alpha: number) =>
      this.add.image(x, y, 'glow').setDisplaySize(r * 2, r * 2).setAlpha(alpha).setBlendMode(Phaser.BlendModes.ADD).setDepth(1000);
    glow(48, 60, 56, 0.22);
    glow(243, 70, 48, 0.18);
    glow(278, 146, 36, 0.2);
  }

  /** Play the actor's current pose at its current facing. */
  private hold(actor: Actor) {
    if (actor.id === 'cat') {
      actor.sprite.play('cat-lie', true);
      return;
    }
    const key = animKey(actor.id, actor.pose, actor.facing);
    if (this.anims.exists(key)) actor.sprite.play(key, true);
  }

  /** Sitting only makes sense on a chair; elsewhere the character stands. */
  private poseAt(anim: string, actor: Actor): string {
    return anim === 'sit' && !standPoint(actor.at, actor.id).chair ? 'idle' : anim;
  }

  /** Switch a character to an animation (a name from STAFF_ANIMS); unknown names keep the current pose. */
  play(actorId: ActorId, anim: string | undefined) {
    const actor = this.actors.get(actorId);
    if (!actor || actorId === 'cat' || !anim || anim === 'walk' || !STAFF_ANIMS[anim]) return;
    actor.pose = this.poseAt(anim, actor);
    if (!actor.tween?.isPlaying()) {
      actor.facing = standPoint(actor.at, actorId).facing;
      this.hold(actor);
    }
  }

  /**
   * Idle life: a character standing idle glances around now and then and turns back; the cat naps
   * (its tail stops) and wakes up again. Nothing happens while walking, talking or working.
   */
  private scheduleIdle(actor: Actor) {
    actor.idle?.remove();
    const isCat = actor.id === 'cat';
    actor.idle = this.time.delayedCall(isCat ? napDelay(Math.random()) : idleDelay(Math.random()), () => {
      const busy = actor.tween?.isPlaying() || this.speech.has(actor.id);
      if (isCat && !busy) {
        if (actor.sprite.anims.isPlaying) actor.sprite.anims.pause();
        else actor.sprite.anims.resume();
      } else if (!busy && actor.pose === 'idle') {
        const home = standPoint(actor.at, actor.id).facing;
        actor.facing = glanceFacing(home, Math.random());
        this.hold(actor);
        this.time.delayedCall(1200 + Math.random() * 1600, () => {
          if (actor.tween?.isPlaying() || actor.pose !== 'idle') return;
          actor.facing = home;
          this.hold(actor);
        });
      }
      this.scheduleIdle(actor);
    });
  }

  /** Show a line above a character (text may be empty to show just the bubble). Pass null and no bubble to clear. */
  say(actorId: ActorId, text: string | null, bubble?: Bubble) {
    if (text === null && !bubble) this.speech.delete(actorId);
    else this.speech.set(actorId, [bubble ? BUBBLE_ICON[bubble] : '', text ?? ''].filter(Boolean).join(' '));
  }

  /** Walk a character to an anchor along the aisle: easing in and out, pausing briefly at each turn. */
  walkTo(actorId: ActorId, anchor: AnchorId): Promise<void> {
    const actor = this.actors.get(actorId);
    if (!actor) return Promise.resolve();
    actor.tween?.stop();
    actor.at = anchor;
    if (actorId === 'cat') actor.sprite.anims.resume();
    const { sprite } = actor;
    const speed = WALK_SPEED[actorId];
    let from = { x: sprite.x, y: sprite.y };
    const path = pathBetween(from, anchor, actorId);
    const steps = path.map((to, i) => {
      const start = from;
      const first = i === 0;
      const last = i === path.length - 1;
      // Eased segments are slower on average; stretch them so the top speed stays the same.
      const stretch = first || last ? 1.3 : 1;
      from = to;
      return {
        targets: [sprite],
        x: to.x,
        y: to.y,
        duration: (Math.hypot(to.x - start.x, to.y - start.y) / speed) * 1000 * stretch,
        delay: first ? 0 : CORNER_PAUSE_MS / 3,
        ease: first && last ? 'Sine.easeInOut' : first ? 'Sine.easeIn' : last ? 'Sine.easeOut' : 'Linear',
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
        actor.facing = standPoint(anchor, actorId).facing;
        actor.pose = this.poseAt(actor.pose, actor);
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
