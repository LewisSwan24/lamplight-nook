import Phaser from 'phaser';
import adengUrl from '../../../assets/sprites/adeng.png';
import cafeUrl from '../../../assets/sprites/cafe.png';
import catUrl from '../../../assets/sprites/cat.png';
import clockUrl from '../../../assets/sprites/clock.png';
import cupUrl from '../../../assets/sprites/cup.png';
import doorUrl from '../../../assets/sprites/door.png';
import laoshiUrl from '../../../assets/sprites/laoshi.png';
import xiaojuUrl from '../../../assets/sprites/xiaoju.png';
import type { ActorId, AnchorId, Bubble } from '../../shared/types';
import { ACTORS, ZONES, pathBetween, standPoint, type Facing } from './layout';
import { LOOKS, type Period, msToNextHour, periodAt } from './daytime';
import { WALK_SPEED, glanceFacing, idleDelay, napDelay } from './life';
import { CAT_FRAME, DIRECTIONS, STAFF_ANIMS, STAFF_FRAME, STAFF_IDS, animKey, facingTowards, staffFrames } from './sprites';

const SHEETS: Record<ActorId, string> = { adeng: adengUrl, xiaoju: xiaojuUrl, laoshi: laoshiUrl, cat: catUrl };
/** Pause at each corner of a walk, so a turn reads as a turn. */
const CORNER_PAUSE_MS = 90;
/** Top-left of the door sprite; the doorway behind it is painted into cafe.png (scripts/art/scene.py, DOOR). */
const DOOR_POS = { x: 288, y: 16 };
const DOOR_MS = 260;
/** The window panes in cafe.png (scripts/art/scene.py) and the colours of their glass, which takes the sky's colour. */
const WINDOW_PANES = [{ x: 18, y: 12, w: 24, h: 18 }, { x: 54, y: 12, w: 24, h: 18 }];
const GLASS = new Set(['216,208,224', '235,228,242', '248,248,248']);
/** How long the room takes to change its light when the hour turns a new period. */
const DAYLIGHT_MS = 4000;
/** Where the blank commission form lies on the counter (top-left corner, canvas pixels). */
const FORM_POS = { x: 224, y: 57 };

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
  /** Gone out through the door (a subagent off on an errand); hidden until it walks somewhere again. */
  outside?: boolean;
};

/**
 * Text label positions in canvas coordinates. Text is drawn by an HTML overlay:
 * the canvas is 320x180 scaled up, so CJK text drawn on it would be blurry.
 */
export type LabelPos = { key: string; text: string; x: number; y: number; kind: 'zone' | 'actor' | 'bubble'; icon?: Bubble };

/** The cafe: a pixel-art background with the three staff and the shop cat as animated sprites. */
export class CafeScene extends Phaser.Scene {
  private actors = new Map<ActorId, Actor>();
  /** What each character is currently saying, and its mood bubble (either may be empty). */
  private speech = new Map<ActorId, { text: string; icon?: Bubble }>();
  /** What the pointer is over: its name is shown only then, so the scene stays free of text. */
  private hovered: ActorId | 'counter' | null = null;
  private door!: Phaser.GameObjects.Sprite;
  /** The blank commission form on the counter; it glows softly while it waits to be filled in. */
  private form!: Phaser.GameObjects.Graphics;
  private formGlow?: Phaser.Tweens.Tween;
  /** Time-of-day layers: a tint over the room, the sky in the window glass, and the lamp glows with their base strength. */
  private shade!: Phaser.GameObjects.Rectangle;
  private sky!: Phaser.GameObjects.Image;
  private glows: { img: Phaser.GameObjects.Image; base: number; sun: boolean }[] = [];
  period: Period = 'day';
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
    this.load.spritesheet('door', doorUrl, { frameWidth: 16, frameHeight: 32 });
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
      .on('pointerdown', () => this.onCounterClick())
      .on('pointerover', () => (this.hovered = 'counter'))
      .on('pointerout', () => (this.hovered = null));
    for (const a of ACTORS) {
      const spot = standPoint(a.home, a.id);
      const isCat = a.id === 'cat';
      const shadow = this.add.ellipse(spot.x, spot.y, isCat ? 20 : 11, 4, 0x3b2a1e, 0.28);
      const sprite = this.add.sprite(spot.x, spot.y, a.id).setOrigin(0.5, 1).setDepth(spot.y);
      const actor: Actor = { id: a.id, sprite, shadow, facing: spot.facing, at: a.home, pose: isCat ? 'lie' : 'idle', height: a.height };
      let glow: Phaser.FX.Glow | undefined;
      sprite
        .setInteractive({ useHandCursor: true, pixelPerfect: true })
        .on('pointerdown', () => {
          if (actor.outside) return;
          this.react(actor);
          this.onActorClick(a.id);
        })
        .on('pointerover', () => {
          if (actor.outside) return;
          this.hovered = a.id;
          glow = sprite.preFX?.addGlow(0xfff1c8, 1.5, 0, false, 0.1, 4);
        })
        .on('pointerout', () => {
          if (this.hovered === a.id) this.hovered = null;
          if (glow) sprite.preFX?.remove(glow);
          glow = undefined;
        });
      // One-off actions (picking up, handing over, lifting) end in the standing pose instead of freezing.
      sprite.on(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
        if (isCat || actor.tween?.isPlaying()) return;
        actor.pose = 'idle';
        this.hold(actor);
      });
      this.actors.set(a.id, actor);
      this.hold(actor);
      this.scheduleIdle(actor);
    }
    this.addLight();
    this.addDaylight();
  }

  update() {
    // Shadows follow their characters; the cat's sits under its body, which is drawn left of centre.
    for (const a of this.actors.values()) {
      a.shadow.setPosition(a.sprite.x + (a.id === 'cat' ? 3 : 0), a.sprite.y - 1).setDepth(a.sprite.depth - 0.5).setAlpha(0.28 * a.sprite.alpha);
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
    this.anims.create({ key: 'clock', frames: this.anims.generateFrameNumbers('clock', {}), frameRate: 4, repeat: -1, yoyo: true });
    this.anims.create({ key: 'cup', frames: this.anims.generateFrameNumbers('cup', {}), frameRate: 5, repeat: -1 });
    this.anims.create({ key: 'door-open', frames: this.anims.generateFrameNumbers('door', { start: 0, end: 4 }), duration: DOOR_MS });
    this.anims.create({ key: 'door-close', frames: this.anims.generateFrameNumbers('door', { start: 4, end: 0 }), duration: DOOR_MS });
  }

  /** Small animated things that make the room feel lived in. */
  private addProps() {
    this.add.sprite(200, 14, 'clock').setOrigin(0).play('clock');
    this.add.sprite(256, 48, 'cup').setOrigin(0).setDepth(1).play('cup');
    this.door = this.add.sprite(DOOR_POS.x, DOOR_POS.y, 'door', 0).setOrigin(0).setDepth(1);
    // A sheet of paper with two pencilled lines, slightly askew on the counter top.
    this.form = this.add.graphics({ x: FORM_POS.x, y: FORM_POS.y }).setDepth(2);
    this.form.fillStyle(0x7a5236, 0.35).fillRect(1, 1, 9, 7);
    this.form.fillStyle(0xfbf6ec, 1).fillRect(0, 0, 9, 7);
    this.form.fillStyle(0xc9b79f, 1).fillRect(2, 2, 5, 1).fillRect(2, 4, 4, 1);
    this.setFormWaiting(true);
  }

  /** Show the blank form glowing on the counter (nothing running), or put it away (a commission is under way). */
  setFormWaiting(on: boolean) {
    this.formGlow?.stop();
    this.form.setVisible(on).setAlpha(1);
    if (on) this.formGlow = this.tweens.add({ targets: this.form, alpha: 0.55, duration: 1100, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }

  /** Warm pools of light from the window, the counter, the floor lamp and the wall lamp; additive so they only brighten. */
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
    const glow = (x: number, y: number, r: number, alpha: number, sun = false) => {
      const img = this.add.image(x, y, 'glow').setDisplaySize(r * 2, r * 2).setAlpha(alpha).setBlendMode(Phaser.BlendModes.ADD).setDepth(1000);
      this.glows.push({ img, base: alpha, sun });
    };
    glow(48, 60, 56, 0.22, true);
    glow(243, 70, 48, 0.18);
    glow(278, 146, 36, 0.2);
    glow(207, 34, 20, 0.12);
  }

  /**
   * The light follows the system clock: a colour multiplied over the room, the sky showing in the
   * window glass, and lamps that glow brighter after dark. Checked again at every whole hour.
   */
  private addDaylight() {
    // A mask of the glass pixels, so the sky colour lands on the panes and nowhere else.
    const src = this.textures.get('cafe').getSourceImage() as HTMLImageElement;
    const tex = this.textures.createCanvas('glass', src.width, src.height)!;
    const ctx = tex.getContext();
    ctx.drawImage(src, 0, 0);
    const img = ctx.getImageData(0, 0, src.width, src.height);
    const mask = ctx.createImageData(src.width, src.height);
    for (const p of WINDOW_PANES) {
      for (let y = p.y; y < p.y + p.h; y++) {
        for (let x = p.x; x < p.x + p.w; x++) {
          const i = (y * src.width + x) * 4;
          if (!GLASS.has(`${img.data[i]},${img.data[i + 1]},${img.data[i + 2]}`)) continue;
          mask.data.fill(255, i, i + 4);
        }
      }
    }
    ctx.clearRect(0, 0, src.width, src.height);
    ctx.putImageData(mask, 0, 0);
    tex.refresh();
    this.sky = this.add.image(0, 0, 'glass').setOrigin(0).setDepth(0.5).setAlpha(0);
    this.shade = this.add.rectangle(0, 0, src.width, src.height, 0xffffff).setOrigin(0).setDepth(999).setBlendMode(Phaser.BlendModes.MULTIPLY);
    this.setPeriod(periodAt(new Date().getHours()), true);
    const tick = () => this.time.delayedCall(msToNextHour(new Date()) + 1000, () => {
      this.setPeriod(periodAt(new Date().getHours()));
      tick();
    });
    tick();
  }

  /** Change the light to a time of day, fading over a few seconds unless `now`. */
  setPeriod(period: Period, now = false) {
    const look = LOOKS[period];
    const from = LOOKS[this.period];
    this.period = period;
    const apply = (t: number) => {
      const mix = (a: number, b: number) => Phaser.Display.Color.Interpolate.ColorWithColor(
        Phaser.Display.Color.ValueToColor(a), Phaser.Display.Color.ValueToColor(b), 1, t);
      const tint = mix(from.tint, look.tint);
      this.shade.setFillStyle(Phaser.Display.Color.GetColor(tint.r, tint.g, tint.b));
      const sky = mix(from.sky, look.sky);
      this.sky.setTint(Phaser.Display.Color.GetColor(sky.r, sky.g, sky.b)).setAlpha(from.skyAlpha + (look.skyAlpha - from.skyAlpha) * t);
      const lamps = from.lamps + (look.lamps - from.lamps) * t;
      const sun = from.sun + (look.sun - from.sun) * t;
      for (const g of this.glows) g.img.setAlpha(Math.min(1, g.base * (g.sun ? sun : lamps)));
    };
    if (now) return apply(1);
    this.tweens.addCounter({ from: 0, to: 1, duration: DAYLIGHT_MS, onUpdate: (tw) => apply(tw.getValue() ?? 1) });
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
      // Handing something over faces the nearest colleague; everything else faces the way the spot faces.
      actor.facing = anim === 'gift' ? this.facingNearest(actor) : standPoint(actor.at, actorId).facing;
      this.hold(actor);
    }
  }

  private facingNearest(actor: Actor): Facing {
    const others = [...this.actors.values()].filter((o) => o !== actor && o.id !== 'cat' && !o.outside);
    const near = others.sort((a, b) => Phaser.Math.Distance.BetweenPoints(a.sprite, actor.sprite) - Phaser.Math.Distance.BetweenPoints(b.sprite, actor.sprite))[0];
    return near ? facingTowards(actor.sprite, near.sprite) : actor.facing;
  }

  /** A click gets a small reaction: staff hop and look at you; the cat purrs a heart and wakes up. */
  private react(actor: Actor) {
    const { sprite } = actor;
    if (actor.id === 'cat') {
      sprite.anims.resume();
      if (!this.speech.has('cat')) {
        const purr = { text: '', icon: 'heart' as const };
        this.speech.set('cat', purr);
        this.time.delayedCall(1500, () => this.speech.get('cat') === purr && this.speech.delete('cat'));
      }
      return;
    }
    if (actor.tween?.isPlaying() || this.tweens.isTweening(sprite)) return;
    const before = actor.facing;
    if (actor.pose === 'idle') {
      actor.facing = 'down';
      this.hold(actor);
    }
    this.tweens.add({ targets: sprite, y: sprite.y - 3, duration: 110, yoyo: true, ease: 'Quad.easeOut' });
    this.time.delayedCall(1600, () => {
      if (actor.tween?.isPlaying() || actor.pose !== 'idle') return;
      actor.facing = before;
      this.hold(actor);
    });
  }

  private openDoor(): Promise<void> {
    this.door.play('door-open');
    return new Promise((r) => this.time.delayedCall(DOOR_MS, r));
  }

  private closeDoor() {
    this.door.play('door-close');
  }

  /** Step out through the open door and fade away; the character stays hidden until it walks somewhere. */
  private async leave(actor: Actor) {
    await this.openDoor();
    actor.sprite.play(animKey(actor.id, 'walk', 'up'), true);
    await new Promise<void>((r) => this.tweens.add({ targets: actor.sprite, y: actor.sprite.y - 8, alpha: 0, duration: 420, onComplete: () => r() }));
    actor.outside = true;
    this.closeDoor();
  }

  /** Come back in through the door, facing into the room. */
  private async enter(actor: Actor) {
    const spot = standPoint('door', actor.id);
    actor.sprite.setPosition(spot.x, spot.y - 8).setAlpha(0).setDepth(spot.y);
    await this.openDoor();
    actor.sprite.play(animKey(actor.id, 'walk', 'down'), true);
    await new Promise<void>((r) => this.tweens.add({ targets: actor.sprite, y: spot.y, alpha: 1, duration: 420, onComplete: () => r() }));
    actor.outside = false;
    this.closeDoor();
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
    else this.speech.set(actorId, { text: text ?? '', icon: bubble });
  }

  /**
   * Walk a character to an anchor along the aisle, easing in and out and pausing briefly at each turn.
   * Someone who is out comes back in through the door first; anyone sent to the door goes out.
   */
  async walkTo(actorId: ActorId, anchor: AnchorId): Promise<void> {
    const actor = this.actors.get(actorId);
    if (!actor) return;
    actor.tween?.stop();
    if (actor.outside && anchor === 'door') return;
    if (actor.outside) await this.enter(actor);
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
    if (steps.length) {
      await new Promise<void>((done) => {
        const arrive = () => {
          actor.facing = standPoint(anchor, actorId).facing;
          actor.pose = this.poseAt(actor.pose, actor);
          this.hold(actor);
          done();
        };
        actor.tween = this.tweens.chain({ tweens: steps, onComplete: arrive, onStop: arrive });
      });
    }
    // Staff sent to the door are going out on an errand.
    if (anchor === 'door' && actorId !== 'cat' && !actor.outside) await this.leave(actor);
  }

  labels(): LabelPos[] {
    // Names appear only on hover; the art shows who is who and what each place is.
    const zones = ZONES.filter((z) => z.id === this.hovered).map((z) => ({ key: `z-${z.id}`, text: z.label, x: z.x + z.w / 2, y: z.y - 2, kind: 'zone' as const }));
    const actors = ACTORS.filter((a) => a.id === this.hovered).map((a) => {
      const { sprite, height } = this.actors.get(a.id)!;
      return { key: `a-${a.id}`, text: a.name, x: sprite.x, y: sprite.y - height - 1, kind: 'actor' as const };
    });
    const bubbles = ACTORS.filter((a) => this.speech.has(a.id)).map((a) => {
      const { sprite, height } = this.actors.get(a.id)!;
      const { text, icon } = this.speech.get(a.id)!;
      return { key: `b-${a.id}`, text, icon, x: sprite.x, y: sprite.y - height - 2, kind: 'bubble' as const };
    });
    return [...zones, ...actors, ...bubbles];
  }
}
