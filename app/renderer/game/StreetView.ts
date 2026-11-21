import Phaser from 'phaser';
import type { ActorId } from '../../shared/types';
import type { TownCounts } from '../../shared/towngrow';
import { animKey } from './sprites';
import { TownGrowth } from './TownGrowth';
import { INSET, PAVEMENT_Y, STOPS, STRIP_TOP, type StopId, VIEW, panFor, routeHome, stopForTool, walkMs } from './street';

/** The town's street pictures, drawn in this order (scripts/art/town.py); CafeScene loads them. */
export const TOWN_LAYERS = ['town-street', 'town-fronts', 'town-props', 'town-signs'] as const;

/** Who is out, where on the town's street, and how she looks just now: what the street scene shows of her. */
export type Walker = { actor: ActorId; x: number; y: number; texture: string; frame: string | number; alpha: number };

const SLIDE_MS = 260;
/** How long she stops at the bakery on the way home. */
const BAKERY_MS = 900;
/** Above the room's light and shade layers, so the street keeps its own light. */
const DEPTH = 2000;
const WOOD = 0x5a3b28;
const WOOD_LIGHT = 0x8a5f3c;

/**
 * The street inset: while a staff member is out on an errand, a small window in the corner shows
 * her walking from shop to shop, and walking home again before she comes in through the door.
 */
export class StreetView {
  private frame: Phaser.GameObjects.Graphics;
  private strip: Phaser.GameObjects.Container;
  private images: Phaser.GameObjects.Image[];
  /** What the town has grown (D5), in the inset as on the street. */
  private growth: TownGrowth;
  private walker?: Phaser.GameObjects.Sprite;
  private zone: Phaser.GameObjects.Zone;
  /** Clips the strip to the inset; weather falling in the street uses it too. */
  mask: Phaser.Display.Masks.GeometryMask;
  /** Above the strip, under its frame: where the street's weather is drawn. */
  static readonly WEATHER_DEPTH = DEPTH + 0.5;
  /** Who is out on the street (one at a time; anyone else who goes out just disappears as before). */
  who: ActorId | null = null;
  /** Where she is headed or stands, and the walks still to do, each waiting for the one before. */
  private stop: StopId = 'nook';
  private route: Promise<void> = Promise.resolve();
  private walking?: Phaser.Tweens.Tween;
  reducedMotion = false;
  onClick: (actor: ActorId) => void = () => {};
  onOpen: (open: boolean) => void = () => {};

  constructor(private scene: Phaser.Scene) {
    this.frame = scene.add.graphics().setDepth(DEPTH + 1).setVisible(false);
    this.frame.fillStyle(WOOD, 1).fillRect(INSET.x, INSET.y, INSET.w, INSET.border).fillRect(INSET.x, INSET.y + INSET.h - INSET.border, INSET.w, INSET.border);
    this.frame.fillRect(INSET.x, INSET.y, INSET.border, INSET.h).fillRect(INSET.x + INSET.w - INSET.border, INSET.y, INSET.border, INSET.h);
    this.frame.fillStyle(WOOD_LIGHT, 1).fillRect(INSET.x + 1, INSET.y + 1, INSET.w - 2, 1);
    // The town's street, its lower part: the strip's top is the town's STRIP_TOP.
    this.growth = new TownGrowth(scene, STRIP_TOP);
    this.images = [...TOWN_LAYERS.map((key) => scene.add.image(0, -STRIP_TOP, key).setOrigin(0)), ...this.growth.images];
    this.strip = scene.add.container(VIEW.x, VIEW.y, this.images).setDepth(DEPTH).setVisible(false);
    const mask = scene.make.graphics({}, false).fillStyle(0xffffff).fillRect(VIEW.x, VIEW.y, VIEW.w, VIEW.h);
    this.mask = mask.createGeometryMask();
    this.strip.setMask(this.mask);
    // The inset sits over the room: clicks on it go to whoever is out, not to what is behind it.
    this.zone = scene.add.zone(INSET.x, INSET.y, INSET.w, INSET.h).setOrigin(0).setDepth(DEPTH + 2)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.who && this.onClick(this.who));
    this.zone.disableInteractive();
  }

  get open(): boolean {
    return this.strip.visible;
  }

  /** The room's light colour, laid over the street too. */
  setTint(color: number) {
    for (const image of this.images) image.setTint(color);
    this.walker?.setTint(color);
  }

  /** What the town has done, so the inset shows what has grown along the street. */
  setTown(counts: TownCounts) {
    this.growth.show(counts);
  }

  /** Keep the strip scrolled to the walker. */
  update() {
    if (!this.open || !this.walker) return;
    this.strip.x = VIEW.x - panFor(this.walker.x);
  }

  /** Where the walker's head is on the canvas, for her mood bubble; null when the inset is closed. */
  headPos(height: number): { x: number; y: number } | null {
    if (!this.open || !this.walker) return null;
    return { x: this.strip.x + this.walker.x, y: this.strip.y + this.walker.y - height - 2 };
  }

  /** Who is out and where on the town's street, for the street scene (road-to-1.4.md D1); null when nobody is. */
  walkerState(): Walker | null {
    if (!this.who || !this.walker) return null;
    const w = this.walker;
    return { actor: this.who, x: w.x, y: w.y + STRIP_TOP, texture: w.texture.key, frame: w.frame.name, alpha: w.alpha };
  }

  /** Someone stepped out of the shop door: open the inset and walk her to her first shop. */
  goOut(actor: ActorId, tint: number) {
    if (this.who) return;
    this.who = actor;
    this.stop = 'nook';
    this.walker?.destroy();
    this.walker = this.scene.add.sprite(STOPS.nook, PAVEMENT_Y - 6, actor).setOrigin(0.5, 1).setAlpha(0).setTint(tint);
    this.strip.add(this.walker);
    this.show();
    this.route = this.route.then(async () => {
      this.walker?.play(animKey(actor, 'walk', 'down'), true);
      await this.tween({ y: PAVEMENT_Y, alpha: 1, duration: 360 });
    });
    this.visit(stopForTool());
  }

  /** She is out and starts something new: go to the shop it belongs to. */
  errand(actor: ActorId, tool?: string) {
    if (this.who !== actor) return;
    this.visit(stopForTool(tool));
  }

  /** Walk home (past the bakery), go in at the shop door and close the inset. Resolves when she is inside. */
  async comeBack(actor: ActorId): Promise<void> {
    if (this.who !== actor || !this.walker) return;
    this.route = this.route.then(async () => {
      for (const stop of routeHome(this.walker!.x)) {
        await this.walk(stop);
        if (stop === 'bakery') {
          this.walker?.play(animKey(actor, 'pick_up', 'up'), true);
          await this.wait(BAKERY_MS);
        }
      }
      this.walker?.play(animKey(actor, 'walk', 'up'), true);
      await this.tween({ y: PAVEMENT_Y - 6, alpha: 0, duration: 360 });
    });
    await this.route;
    await this.hide();
    this.who = null;
  }

  /** Catching up after the window was hidden: put her straight at a shop, or close the inset at once. */
  place(actor: ActorId, out: boolean, tint: number) {
    if (!out) {
      if (this.who !== actor) return;
      this.walking?.stop();
      this.who = null;
      this.route = Promise.resolve();
      this.strip.setVisible(false);
      this.frame.setVisible(false);
      this.zone.disableInteractive();
      this.onOpen(false);
      return;
    }
    if (this.who && this.who !== actor) return;
    if (!this.who) this.goOut(actor, tint);
    this.walking?.stop();
    this.route = Promise.resolve();
    this.stop = stopForTool();
    this.walker!.setPosition(STOPS[this.stop], PAVEMENT_Y).setAlpha(1).play(animKey(actor, 'idle', 'up'), true);
    this.strip.setAlpha(1).y = VIEW.y;
    this.frame.setAlpha(1).y = 0;
  }

  private visit(stop: StopId) {
    if (stop === this.stop) return;
    this.stop = stop;
    this.route = this.route.then(() => this.walk(stop));
  }

  private async walk(stop: StopId) {
    const walker = this.walker;
    if (!walker || !this.who) return;
    const to = STOPS[stop];
    if (Math.abs(walker.x - to) >= 1) {
      walker.play(animKey(this.who, 'walk', to > walker.x ? 'right' : 'left'), true);
      await this.tween({ x: to, duration: walkMs(walker.x, to), ease: 'Sine.easeInOut' });
    }
    // At a shop door she turns to face it, as if looking in.
    walker.play(animKey(this.who, 'idle', stop === 'nook' ? 'down' : 'up'), true);
  }

  private tween(props: object): Promise<void> {
    return new Promise((done) => {
      if (!this.walker) return done();
      this.walking = this.scene.tweens.add({ targets: this.walker, ...props, onComplete: () => done(), onStop: () => done() });
    });
  }

  private wait(ms: number): Promise<void> {
    return new Promise((r) => this.scene.time.delayedCall(ms, r));
  }

  private show() {
    this.onOpen(true);
    this.zone.setInteractive({ useHandCursor: true });
    this.strip.setVisible(true);
    this.frame.setVisible(true);
    this.update();
    if (this.reducedMotion) {
      this.strip.setAlpha(1).y = VIEW.y;
      this.frame.setAlpha(1).y = 0;
      return;
    }
    // Slides up from the bottom edge of the room.
    this.strip.setAlpha(0).y = VIEW.y + 10;
    this.frame.setAlpha(0).y = 10;
    this.scene.tweens.add({ targets: this.strip, y: VIEW.y, alpha: 1, duration: SLIDE_MS, ease: 'Quad.easeOut' });
    this.scene.tweens.add({ targets: this.frame, y: 0, alpha: 1, duration: SLIDE_MS, ease: 'Quad.easeOut' });
  }

  private hide(): Promise<void> {
    this.zone.disableInteractive();
    const done = () => {
      this.strip.setVisible(false);
      this.frame.setVisible(false);
      this.onOpen(false);
    };
    if (this.reducedMotion) {
      done();
      return Promise.resolve();
    }
    return new Promise((r) => {
      this.scene.tweens.add({ targets: this.frame, y: 10, alpha: 0, duration: SLIDE_MS, ease: 'Quad.easeIn' });
      this.scene.tweens.add({ targets: this.strip, y: VIEW.y + 10, alpha: 0, duration: SLIDE_MS, ease: 'Quad.easeIn', onComplete: () => { done(); r(); } });
    });
  }
}
