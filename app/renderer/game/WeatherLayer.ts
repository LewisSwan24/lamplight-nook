import type { RoomId } from '../../shared/scenes';
import { overlayDepth } from './pieces';
import { DECOR_SHOPS, roomDecor } from './streetdecor';
import Phaser from 'phaser';
import type { Period } from './daytime';
import { FALLING, FLASH_GAP_MS, HOLIDAYS, type Holiday, type Season, type Sky, flashesFor, fogFor, multiply } from './weather';

/** Over the sky in the glass, under the room's light and shade, so night and dusk colour the rain too. */
const GLASS_DEPTH = 0.6;
/** The holiday decorations hang on the walls and stand on the floor, behind everyone. */
const DECOR_DEPTH = 1.5;
/** Where things fall past the windows (the panes, a little above them so they fall in from outside). */
const WINDOW_AREA = { x: 16, y: 4, w: 64, h: 36 };
/** And past the window by the clock. */
const SIDE_WINDOW_AREA = { x: 197, y: 4, w: 28, h: 36 };

/** Weather that leaves a touch in the room: a wet umbrella, snow on the sills, leaves or petals blown in. */
export const SKIES: Exclude<Sky, 'clear'>[] = ['rain', 'snow', 'leaves', 'petals', 'fog', 'wind', 'storm'];

type Area = { x: number; y: number; w: number; h: number };
/** `inset`: a small view above the room's shade, lit by itself and only there while it is open (the street). */
type Outdoor = { area: Area; mask: Phaser.Display.Masks.GeometryMask; depth: number; inset?: boolean };

/**
 * Rain, snow, petals or leaves falling past the windows (and in the street inset), and the holiday
 * decorations in the room. What to show is decided by weather.ts; this only draws it.
 */
export class WeatherLayer {
  private decor: Phaser.GameObjects.Image;
  /** The season's own small piece on the side window's sill (scripts/art/decor.py); a festival's decorations take its place. */
  private seasonDecor: Phaser.GameObjects.Image;
  private touch: Phaser.GameObjects.Image;
  private emitters: Phaser.GameObjects.Particles.ParticleEmitter[] = [];
  /** The emitters of inset views, which take the light and come and go with their inset. */
  private insets: Phaser.GameObjects.Particles.ParticleEmitter[] = [];
  sky: Sky = 'clear';
  holiday: Holiday | null = null;
  season: Season = 'spring';
  reducedMotion = false;
  private tint = 0xffffff;
  private outdoorsOn = false;
  private period: Period = 'day';
  /** Fog over the panes and over each view of the outside (plan-1.7.md G4); also what lightning lights up. */
  private hazes: (Phaser.GameObjects.Image | Phaser.GameObjects.Rectangle)[] = [];
  private flashes: (Phaser.GameObjects.Image | Phaser.GameObjects.Rectangle)[] = [];
  private flashTimer?: Phaser.Time.TimerEvent;

  /**
   * `glass` is a mask texture of the window panes; `outdoors` are other views of the outside
   * (the street inset), each with its own mask and depth.
   */
  constructor(private scene: Phaser.Scene, private room: RoomId, private glass: string, private outdoors: Outdoor[] = []) {
    if (!scene.textures.exists('weather-px')) {
      const g = scene.make.graphics({}, false).fillStyle(0xffffff).fillRect(0, 0, 1, 1);
      g.generateTexture('weather-px', 1, 1);
      g.destroy();
    }
    // The shops along the street have their own decorations, a frame each (road-to-1.4.md D6, scripts/art/decor.py).
    const shops = scene.textures.get('shops-decor');
    DECOR_SHOPS.forEach((shop, row) => HOLIDAYS.forEach((h, col) => {
      if (!shops.has(`${shop}-${h}`)) shops.add(`${shop}-${h}`, 0, col * 320, row * 180, 320, 180);
    }));
    this.decor = scene.add.image(0, 0, `decor-${HOLIDAYS[0]}`).setOrigin(0).setDepth(DECOR_DEPTH).setVisible(false);
    this.touch = scene.add.image(0, 0, `weather-${SKIES[0]}`).setOrigin(0).setDepth(DECOR_DEPTH).setVisible(false);
    this.seasonDecor = scene.add.image(0, 0, `season-${this.season}`).setOrigin(0).setDepth(DECOR_DEPTH);
    // Fog and lightning: a pale sheet over the panes and over each outdoor view, and a white one that flashes.
    const sheet = (color: number, depth: number) => [
      scene.add.image(0, 0, glass).setOrigin(0).setTint(color).setDepth(depth).setAlpha(0),
      ...outdoors.map((o) => scene.add.rectangle(o.area.x, o.area.y, o.area.w, o.area.h, color).setOrigin(0).setDepth(o.depth + 0.01).setMask(o.mask).setAlpha(0)),
    ];
    this.hazes = sheet(0xe8ecf0, GLASS_DEPTH + 0.01);
    this.flashes = sheet(0xffffff, GLASS_DEPTH + 0.02);
  }

  /** Fog is thickest at dawn and thins out through the day. */
  setPeriod(period: Period) {
    this.period = period;
    const a = fogFor(this.sky, period);
    this.hazes.forEach((h, i) => h.setAlpha(a).setVisible(i === 0 || i > this.outdoors.length || this.outdoorsShown(i - 1)));
  }

  private outdoorsShown(i: number) {
    return !this.outdoors[i].inset || this.outdoorsOn;
  }

  /** A flash of lightning over the panes and the views outside, then dark again. */
  private flash() {
    this.scene.tweens.add({ targets: this.flashes.filter((_, i) => i === 0 || this.outdoorsShown(i - 1)), alpha: { from: 0.75, to: 0 }, duration: 350, ease: 'Quad.easeOut' });
    this.flashTimer = this.scene.time.delayedCall(Phaser.Math.Between(...FLASH_GAP_MS), () => this.flash());
  }

  /** Put out the season's piece (it stays hidden while a festival is up). */
  setSeason(season: Season) {
    this.season = season;
    this.seasonDecor.setTexture(`season-${season}`).setDepth(overlayDepth(this.room, `season-${season}`, DECOR_DEPTH));
  }

  /** Change what falls outside and which decorations are up. */
  set(sky: Sky, holiday: Holiday | null) {
    this.sky = sky;
    this.holiday = holiday;
    if (holiday) {
      const { key, frame } = roomDecor(this.room, holiday);
      this.decor.setTexture(key, frame).setDepth(overlayDepth(this.room, `decor-${holiday}`, DECOR_DEPTH));
    }
    this.decor.setVisible(!!holiday);
    this.seasonDecor.setVisible(!holiday);
    if (sky !== 'clear') this.touch.setTexture(`weather-${sky}`).setDepth(overlayDepth(this.room, `weather-${sky}`, DECOR_DEPTH));
    this.touch.setVisible(sky !== 'clear');
    this.restart();
  }

  setReducedMotion(on: boolean) {
    this.reducedMotion = on;
    this.restart();
  }

  /** Inset views take the room's light colour themselves (they sit above the room's shade). */
  setTint(color: number) {
    this.tint = color;
    const f = FALLING[this.sky];
    if (!f) return;
    for (const e of this.insets) e.setParticleTint(multiply(f.color, color));
  }

  /** Inset views are only there while their inset is open. */
  setOutdoorsVisible(on: boolean) {
    this.outdoorsOn = on;
    for (const e of this.insets) e.setVisible(on);
    this.setPeriod(this.period);
  }

  private restart() {
    for (const e of this.emitters) e.destroy();
    this.emitters = [];
    this.insets = [];
    this.setPeriod(this.period);
    this.flashTimer?.remove();
    this.flashTimer = undefined;
    if (flashesFor(this.sky, this.reducedMotion)) this.flashTimer = this.scene.time.delayedCall(Phaser.Math.Between(1500, 4000), () => this.flash());
    // Falling things are motion: with less motion asked for, the day is only greyer.
    if (!FALLING[this.sky] || this.reducedMotion) return;
    const glassMask = this.scene.make.image({ x: 0, y: 0, key: this.glass, origin: 0 }, false).createBitmapMask();
    this.emitters.push(this.emitter(WINDOW_AREA, 1, GLASS_DEPTH).setMask(glassMask));
    this.emitters.push(this.emitter(SIDE_WINDOW_AREA, SIDE_WINDOW_AREA.w / WINDOW_AREA.w, GLASS_DEPTH).setMask(glassMask));
    for (const o of this.outdoors) {
      const e = this.emitter(o.area, o.area.w / WINDOW_AREA.w, o.depth).setMask(o.mask);
      this.emitters.push(e);
      if (o.inset) this.insets.push(e);
    }
    this.setTint(this.tint);
    this.setOutdoorsVisible(this.outdoorsOn);
  }

  private emitter(area: Area, density: number, depth: number) {
    const f = FALLING[this.sky]!;
    const lifespan = ((area.h + 8) / f.speed) * 1000;
    const sway = this.sky === 'rain' || this.sky === 'storm' ? 0 : f.drift / (this.sky === 'wind' ? 4 : 1);
    return this.scene.add.particles(0, 0, 'weather-px', {
      x: { min: area.x - Math.abs(f.drift), max: area.x + area.w + Math.abs(f.drift) },
      y: area.y - 4,
      speedY: { min: f.speed * 0.8, max: f.speed * 1.2 },
      speedX: { min: f.drift - sway, max: f.drift + sway },
      scaleX: f.w,
      scaleY: f.h,
      tint: f.color,
      lifespan,
      frequency: 1000 / (f.perSecond * density),
      // Start with the sky already full instead of the first drops only just arriving.
      advance: lifespan,
    }).setDepth(depth);
  }
}
