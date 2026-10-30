import Phaser from 'phaser';
import type { Bubble } from '../../shared/types';
import {
  DOGHOUSE, DOG_ANIMS, DOG_FRAME, DOG_HOME, DOG_ORIGIN_X, DOG_SLEEP_FRAMES, DOG_SPEED, HENHOUSE_DOOR, HENS, HEN_ANIMS, HEN_AREA,
  HEN_FRAME, HEN_SPEED, animalFrames, dogPlan, henPlan, indoors,
} from './animals';
import type { Period } from './daytime';
import type { Facing } from './layout';
import { DIRECTIONS, facingTowards } from './sprites';
import type { Sky } from './weather';

type Point = { x: number; y: number };
type Hen = { sprite: Phaser.GameObjects.Sprite; next?: Phaser.Time.TimerEvent; walk?: Phaser.Tweens.Tween; inside: boolean };

/** How long a feeding lasts after a click on the hens. */
const FEED_MS = 9000;
/** Where grain lands when you click the hens: in front of the henhouse. */
const GRAIN = { x: 204, y: 100 };

/**
 * Malt and the hens, drawn in the garden at `left` (the garden's world x). They follow animals.ts:
 * each plan is a walk to a place and something to do there, then the next plan.
 */
export class GardenAnimals {
  private dog: Phaser.GameObjects.Sprite;
  private dogShadow: Phaser.GameObjects.Ellipse;
  private kennel: Phaser.GameObjects.Sprite;
  private dogNext?: Phaser.Time.TimerEvent;
  private dogWalk?: Phaser.Tweens.Tween;
  private dogFacing: Facing = 'down';
  private asleep = false;
  private hens: Hen[] = [];
  private sky: Sky = 'clear';
  private period: Period = 'day';
  private company: Point | null = null;
  private feeder: Point | null = null;
  private grainUntil = 0;
  private started = false;
  /** A bubble over Malt (a heart when patted, zzz asleep), shown by the garden's labels. */
  bubble: { icon: Bubble; until: number } | null = null;

  constructor(private scene: Phaser.Scene, private left: number, private onPick: (what: 'dog' | 'hens') => void, private onHover: (what: 'dog' | 'hens' | null) => void) {
    this.createAnims();
    this.dogShadow = scene.add.ellipse(0, 0, 20, 4, 0x2e3b22, 0.3);
    this.dog = scene.add.sprite(left + DOG_HOME.x, DOG_HOME.y, 'dog', 0).setOrigin(0.5, 1).setDepth(DOG_HOME.y);
    this.kennel = scene.add.sprite(left + DOGHOUSE.x, DOGHOUSE.y, 'dog-sleep', 0).setOrigin(0).setDepth(DOGHOUSE.y + 48).setVisible(false);
    for (const s of [this.dog, this.kennel]) {
      s.setInteractive({ useHandCursor: true, pixelPerfect: true })
        .on('pointerdown', () => this.onPick('dog'))
        .on('pointerover', () => this.onHover('dog'))
        .on('pointerout', () => this.onHover(null));
    }
    for (let i = 0; i < HENS; i++) {
      const at = { x: HEN_AREA.x + 10 + i * 18, y: HEN_AREA.y + 6 + (i % 2) * 12 };
      const sprite = scene.add.sprite(left + at.x, at.y, 'hens', 0).setOrigin(0.5, 1).setDepth(at.y);
      sprite.setInteractive({ useHandCursor: true, pixelPerfect: true })
        .on('pointerdown', () => this.onPick('hens'))
        .on('pointerover', () => this.onHover('hens'))
        .on('pointerout', () => this.onHover(null));
      this.hens.push({ sprite, inside: false });
    }
    this.dogPose('idle', 'down');
    this.hens.forEach((h, i) => this.henPose(i, 'idle', i % 2 ? 'left' : 'right'));
  }

  /** The weather or the hour changed: anyone who should be in goes in, and out again when it clears. */
  setOutdoors(sky: Sky, period: Period) {
    const was = indoors(this.sky, this.period);
    this.sky = sky;
    this.period = period;
    // The first call sets everyone going, in place.
    const first = !this.started;
    this.started = true;
    if (indoors(sky, period) !== was || first) {
      this.planDog(first);
      this.hens.forEach((_, i) => this.planHen(i, first));
    }
  }

  /** Someone settled in the garden (or left: null); Malt goes over to them. */
  setCompany(at: Point | null, bark: boolean) {
    this.company = at;
    if (this.asleep) return;
    if (at && bark) return this.bark(facingTowards({ x: this.dog.x - this.left, y: this.dog.y }, at), () => this.planDog());
    this.planDog();
  }

  /** Someone is scattering grain at a spot (or stopped: null); the hens crowd round. */
  setFeeder(at: Point | null) {
    this.feeder = at;
    this.hens.forEach((_, i) => this.planHen(i));
  }

  /** A pat: a heart and a wag (a bark), or a zzz from inside the doghouse. */
  pat() {
    const until = this.scene.time.now + 1600;
    if (this.asleep) {
      this.bubble = { icon: 'zzz', until };
      return;
    }
    this.bubble = { icon: 'heart', until };
    this.bark(this.dogFacing === 'up' ? 'down' : this.dogFacing, () => this.planDog());
  }

  /** A handful of grain in front of the henhouse: the hens come running and peck for a while. */
  scatterGrain() {
    if (indoors(this.sky, this.period)) return;
    this.grainUntil = this.scene.time.now + FEED_MS;
    this.hens.forEach((_, i) => this.planHen(i));
    this.scene.time.delayedCall(FEED_MS + 50, () => this.scene.time.now >= this.grainUntil && this.hens.forEach((_, i) => this.planHen(i)));
  }

  update() {
    this.dogShadow.setPosition(this.dog.x + (this.dogFacing === 'left' ? -4 : this.dogFacing === 'right' ? 4 : 0), this.dog.y - 1)
      .setDepth(this.dog.depth - 0.5).setVisible(this.dog.visible);
    if (this.bubble && this.scene.time.now > this.bubble.until) this.bubble = null;
  }

  /** Malt's head and the hens' middle, in garden coordinates, for bubbles and name labels. */
  dogHead(): Point {
    return this.asleep ? { x: DOGHOUSE.x + 16, y: DOGHOUSE.y + 4 } : { x: this.dog.x - this.left, y: this.dog.y - 22 };
  }

  hensHead(): Point | null {
    const out = this.hens.filter((h) => !h.inside);
    if (!out.length) return null;
    return { x: out.reduce((s, h) => s + h.sprite.x, 0) / out.length - this.left, y: Math.min(...out.map((h) => h.sprite.y)) - 16 };
  }

  /** What can be clicked, in garden coordinates. */
  hotspots(): { id: 'dog' | 'hens'; x: number; y: number; w: number; h: number }[] {
    const dog = (this.asleep ? this.kennel : this.dog).getBounds();
    const out: { id: 'dog' | 'hens'; x: number; y: number; w: number; h: number }[] = [{ id: 'dog', x: dog.x - this.left, y: dog.y, w: dog.width, h: dog.height }];
    const hens = this.hens.filter((h) => !h.inside).map((h) => h.sprite.getBounds());
    if (hens.length) {
      const x = Math.min(...hens.map((b) => b.x));
      const y = Math.min(...hens.map((b) => b.y));
      out.push({ id: 'hens', x: x - this.left, y, w: Math.max(...hens.map((b) => b.right)) - x, h: Math.max(...hens.map((b) => b.bottom)) - y });
    }
    return out;
  }

  private planDog(now = false) {
    this.dogNext?.remove();
    this.dogWalk?.stop();
    const plan = dogPlan(Math.random, this.sky, this.period, this.company);
    if (plan.do === 'sleep') {
      if (now) return this.fallAsleep();
      return this.walkDog(plan.to, () => this.fallAsleep());
    }
    if (this.asleep) this.wake();
    const go = () => this.walkDog(plan.to, () => {
      this.dogPose(plan.do === 'eat' ? 'eat' : 'idle', plan.facing);
      this.dogNext = this.scene.time.delayedCall(plan.ms, () => this.planDog());
    });
    if (now) {
      this.dog.setPosition(this.left + plan.to.x, plan.to.y).setDepth(plan.to.y);
      this.dogPose(plan.do === 'eat' ? 'eat' : 'idle', plan.facing);
      this.dogNext = this.scene.time.delayedCall(plan.ms, () => this.planDog());
      return;
    }
    go();
  }

  private walkDog(to: Point, then: () => void) {
    const from = { x: this.dog.x - this.left, y: this.dog.y };
    const dist = Math.hypot(to.x - from.x, to.y - from.y);
    if (dist < 1) return then();
    this.dogPose('walk', facingTowards(from, to));
    this.dogWalk = this.scene.tweens.add({
      targets: this.dog, x: this.left + to.x, y: to.y, duration: (dist / DOG_SPEED) * 1000,
      onUpdate: () => this.dog.setDepth(this.dog.y), onComplete: then,
    });
  }

  private fallAsleep() {
    this.asleep = true;
    this.dog.setVisible(false).setPosition(this.left + DOG_HOME.x, DOG_HOME.y);
    this.kennel.setVisible(true).play('dog-sleep', true);
  }

  private wake() {
    this.asleep = false;
    this.kennel.setVisible(false).stop();
    this.dog.setVisible(true).setPosition(this.left + DOG_HOME.x, DOG_HOME.y).setDepth(DOG_HOME.y);
  }

  private bark(facing: Facing, then: () => void) {
    this.dogNext?.remove();
    this.dogWalk?.stop();
    this.dogPose('bark', facing);
    this.dog.once(Phaser.Animations.Events.ANIMATION_COMPLETE, then);
  }

  private dogPose(anim: keyof typeof DOG_ANIMS, facing: Facing) {
    this.dogFacing = facing;
    this.dog.setOrigin(DOG_ORIGIN_X[facing], 1).play(`dog-${anim}-${facing}`, true);
  }

  private planHen(i: number, now = false) {
    const hen = this.hens[i];
    hen.next?.remove();
    hen.walk?.stop();
    const grain = this.scene.time.now < this.grainUntil ? GRAIN : null;
    const plan = henPlan(Math.random, this.sky, this.period, this.feeder ?? grain);
    if (plan.do === 'roost') {
      if (now || hen.inside) return this.roost(hen);
      return this.walkHen(i, plan.to, () => this.roost(hen));
    }
    if (hen.inside) {
      hen.inside = false;
      hen.sprite.setPosition(this.left + HENHOUSE_DOOR.x, HENHOUSE_DOOR.y).setAlpha(1).setVisible(true);
    }
    const settle = () => {
      this.henPose(i, plan.do === 'peck' ? 'peck' : 'idle', plan.facing);
      hen.next = this.scene.time.delayedCall(plan.ms, () => this.planHen(i));
    };
    if (now) {
      hen.sprite.setPosition(this.left + plan.to.x, plan.to.y).setDepth(plan.to.y);
      return settle();
    }
    // Hens dawdle: a little pause before setting off, so they don't all move at once.
    hen.next = this.scene.time.delayedCall(Math.random() * 600, () => this.walkHen(i, plan.to, settle));
  }

  private walkHen(i: number, to: Point, then: () => void) {
    const hen = this.hens[i];
    const from = { x: hen.sprite.x - this.left, y: hen.sprite.y };
    const dist = Math.hypot(to.x - from.x, to.y - from.y);
    if (dist < 1) return then();
    this.henPose(i, 'walk', facingTowards(from, to));
    hen.walk = this.scene.tweens.add({
      targets: hen.sprite, x: this.left + to.x, y: to.y, duration: (dist / HEN_SPEED) * 1000,
      onUpdate: () => hen.sprite.setDepth(hen.sprite.y), onComplete: then,
    });
  }

  private roost(hen: Hen) {
    hen.inside = true;
    hen.sprite.setVisible(false).setPosition(this.left + HENHOUSE_DOOR.x, HENHOUSE_DOOR.y);
  }

  private henPose(i: number, anim: keyof typeof HEN_ANIMS, facing: Facing) {
    this.hens[i].sprite.play(`hen${i}-${anim}-${facing}`, true);
  }

  private createAnims() {
    const anims = this.scene.anims;
    if (anims.exists('dog-sleep')) return;
    for (const facing of DIRECTIONS) {
      for (const [name, def] of Object.entries(DOG_ANIMS)) {
        anims.create({ key: `dog-${name}-${facing}`, frames: anims.generateFrameNumbers('dog', { frames: animalFrames(def, DOG_FRAME.perRow, facing) }), frameRate: def.fps, repeat: def.repeat });
      }
      for (let i = 0; i < HENS; i++) {
        for (const [name, def] of Object.entries(HEN_ANIMS)) {
          anims.create({ key: `hen${i}-${name}-${facing}`, frames: anims.generateFrameNumbers('hens', { frames: animalFrames(def, HEN_FRAME.perRow, facing, i * 3) }), frameRate: def.fps, repeat: def.repeat });
        }
      }
    }
    anims.create({ key: 'dog-sleep', frames: anims.generateFrameNumbers('dog-sleep', { start: 0, end: DOG_SLEEP_FRAMES - 1 }), frameRate: 3, repeat: -1 });
  }
}
