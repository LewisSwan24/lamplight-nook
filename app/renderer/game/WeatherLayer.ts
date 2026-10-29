import Phaser from 'phaser';
import { FALLING, type Holiday, type Sky, multiply } from './weather';

/** Over the sky in the glass, under the room's light and shade, so night and dusk colour the rain too. */
const GLASS_DEPTH = 0.6;
/** The holiday decorations hang on the walls and stand on the floor, behind everyone. */
const DECOR_DEPTH = 1.5;
/** Where things fall past the windows (the panes, a little above them so they fall in from outside). */
const WINDOW_AREA = { x: 16, y: 4, w: 64, h: 36 };

export const HOLIDAYS: Holiday[] = ['halloween', 'christmas', 'new_year'];
/** Weather that leaves a touch in the room: a wet umbrella, snow on the sills, leaves or petals blown in. */
export const SKIES: Exclude<Sky, 'clear'>[] = ['rain', 'snow', 'leaves', 'petals'];

type Area = { x: number; y: number; w: number; h: number };
/** `inset`: a small view above the room's shade, lit by itself and only there while it is open (the street). */
type Outdoor = { area: Area; mask: Phaser.Display.Masks.GeometryMask; depth: number; inset?: boolean };

/**
 * Rain, snow, petals or leaves falling past the windows (and in the street inset), and the holiday
 * decorations in the room. What to show is decided by weather.ts; this only draws it.
 */
export class WeatherLayer {
  private decor: Phaser.GameObjects.Image;
  private touch: Phaser.GameObjects.Image;
  private emitters: Phaser.GameObjects.Particles.ParticleEmitter[] = [];
  /** The emitters of inset views, which take the light and come and go with their inset. */
  private insets: Phaser.GameObjects.Particles.ParticleEmitter[] = [];
  sky: Sky = 'clear';
  holiday: Holiday | null = null;
  reducedMotion = false;
  private tint = 0xffffff;
  private outdoorsOn = false;

  /**
   * `glass` is a mask texture of the window panes; `outdoors` are other views of the outside
   * (the street inset), each with its own mask and depth.
   */
  constructor(private scene: Phaser.Scene, private glass: string, private outdoors: Outdoor[] = []) {
    if (!scene.textures.exists('weather-px')) {
      const g = scene.make.graphics({}, false).fillStyle(0xffffff).fillRect(0, 0, 1, 1);
      g.generateTexture('weather-px', 1, 1);
      g.destroy();
    }
    this.decor = scene.add.image(0, 0, `decor-${HOLIDAYS[0]}`).setOrigin(0).setDepth(DECOR_DEPTH).setVisible(false);
    this.touch = scene.add.image(0, 0, `weather-${SKIES[0]}`).setOrigin(0).setDepth(DECOR_DEPTH).setVisible(false);
  }

  /** Change what falls outside and which decorations are up. */
  set(sky: Sky, holiday: Holiday | null) {
    this.sky = sky;
    this.holiday = holiday;
    if (holiday) this.decor.setTexture(`decor-${holiday}`);
    this.decor.setVisible(!!holiday);
    if (sky !== 'clear') this.touch.setTexture(`weather-${sky}`);
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
    if (this.sky === 'clear') return;
    for (const e of this.insets) e.setParticleTint(multiply(FALLING[this.sky].color, color));
  }

  /** Inset views are only there while their inset is open. */
  setOutdoorsVisible(on: boolean) {
    this.outdoorsOn = on;
    for (const e of this.insets) e.setVisible(on);
  }

  private restart() {
    for (const e of this.emitters) e.destroy();
    this.emitters = [];
    this.insets = [];
    // Falling things are motion: with less motion asked for, the day is only greyer.
    if (this.sky === 'clear' || this.reducedMotion) return;
    const glassMask = this.scene.make.image({ x: 0, y: 0, key: this.glass, origin: 0 }, false).createBitmapMask();
    this.emitters.push(this.emitter(WINDOW_AREA, 1, GLASS_DEPTH).setMask(glassMask));
    for (const o of this.outdoors) {
      const e = this.emitter(o.area, o.area.w / WINDOW_AREA.w, o.depth).setMask(o.mask);
      this.emitters.push(e);
      if (o.inset) this.insets.push(e);
    }
    this.setTint(this.tint);
    this.setOutdoorsVisible(this.outdoorsOn);
  }

  private emitter(area: Area, density: number, depth: number) {
    const f = FALLING[this.sky as Exclude<Sky, 'clear'>];
    const lifespan = ((area.h + 8) / f.speed) * 1000;
    const sway = this.sky === 'rain' ? 0 : f.drift;
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
