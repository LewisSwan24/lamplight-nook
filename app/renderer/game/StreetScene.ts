import Phaser from 'phaser';
import frontsUrl from '../../../assets/sprites/town-fronts.png';
import propsUrl from '../../../assets/sprites/town-props.png';
import signsUrl from '../../../assets/sprites/town-signs.png';
import streetUrl from '../../../assets/sprites/town-street.png';
import riverStreetUrl from '../../../assets/sprites/river-street.png';
import riverFrontsUrl from '../../../assets/sprites/river-fronts.png';
import riverPropsUrl from '../../../assets/sprites/river-props.png';
import riverTowerUrl from '../../../assets/sprites/river-tower.png';
import { streetGrown, type TownCounts } from '../../shared/towngrow';
import type { ActorId } from '../../shared/types';
import { CANVAS } from './layout';
import { animKey } from './sprites';
import type { Walker } from './StreetView';
import { cameraFor, doorOf, FRONTS, frontAt, OPEN, paradePlan, RIVER, type ShopId, TOWN } from './town';
import { type Outside, putAway } from './streetdecor';
import { addUmbrella, holdUmbrella, preloadTownDecor, TownDecor } from './TownDecor';
import { preloadTownGrowth, TownGrowth } from './TownGrowth';
import { preloadTownStories, TownStories } from './TownStories';
import type { Teller } from '../../shared/stories';
import { FALLING, FLASH_GAP_MS, flashesFor, fogFor } from './weather';
import { periodAt } from './daytime';
import { Crowd, PASSER_LOOKS, type Passer } from './crowd';
import { umbrellaUp } from './streetdecor';
import { DIRECTIONS, STAFF_ANIMS, STAFF_FRAME, staffFrames } from './sprites';
import passer1Url from '../../../assets/sprites/passer-1.png';
import passer2Url from '../../../assets/sprites/passer-2.png';
import passer3Url from '../../../assets/sprites/passer-3.png';
import passer4Url from '../../../assets/sprites/passer-4.png';
import passer5Url from '../../../assets/sprites/passer-5.png';
import passer6Url from '../../../assets/sprites/passer-6.png';
import passer7Url from '../../../assets/sprites/passer-7.png';
import passer8Url from '../../../assets/sprites/passer-8.png';
import passer9Url from '../../../assets/sprites/passer-9.png';
import passer10Url from '../../../assets/sprites/passer-10.png';

/** The passers' sheets (scripts/art/characters.py, PASSERS), in the order of their looks. */
const PASSER_SHEETS = [passer1Url, passer2Url, passer3Url, passer4Url, passer5Url, passer6Url, passer7Url, passer8Url, passer9Url, passer10Url];
const passerKey = (look: number) => `passer-${look}`;

/** How far one press of an arrow key moves along the street. */
const PAN_STEP = 48;
/** A press that moves further than this is a drag along the street, not a click on a front. */
const DRAG = 3;
/** The box each mover carries in (road-to-1.4.md D7). */
const BOX = { w: 8, h: 6, fill: 0xa8743f, edge: 0x5e3b1e, ahead: 4, up: 7 };
/** Stepping in at the door: up the step and out of sight. */
const IN_MS = 360;
/**
 * Drawn bottom to top: the street, what lies on it, the fronts and props, what has grown, what the stories left (D4), then
 * what stands in front (D6), the people and what falls.
 */
const DEPTH = { street: 0, ground: 0.5, fronts: 1, grown: 2, story: 2.5, up: 3, people: 10, falling: 20 };

/** The river street's layers (plan-2.0.md J1), laid on at the end of the first street; the tower stands on its own. */
const RIVER_LAYERS = [['river-street', riverStreetUrl], ['river-fronts', riverFrontsUrl], ['river-props', riverPropsUrl], ['river-tower', riverTowerUrl]] as const;

/**
 * The town's street (road-to-1.4.md D1): seven fronts in a row, wider than the canvas, and past the bridge at its far
 * end the street along the river with two more (plan-2.0.md J1). Dragging or the arrow keys
 * move along it; a click on a front goes in, or the front says why not. The shop lays its light over it.
 */
export class StreetScene extends Phaser.Scene {
  /** A front was clicked; `open` says whether it can be gone into. */
  onFront: (id: ShopId, open: boolean) => void = () => {};
  /** The colour the shop lays over everything at this hour (CafeScene.tint). */
  tint: () => number = () => 0xffffff;
  /** Who is out on an errand and where, as the shop's inset has her (CafeScene.streetWalker). */
  walker: () => Walker | null = () => null;
  /** She was clicked out here. */
  onActor: (id: ActorId) => void = () => {};
  /** A neighbour waiting with a chapter was clicked (D4). */
  onNeighbour: (who: Teller) => void = () => {};
  /** Today's season, festival and weather, as the shop has them (CafeScene.outside). */
  outside: () => Outside = () => ({ season: 'spring', holiday: null, sky: 'clear' });
  /** Less motion asked for: nothing falls, the day is only greyer. */
  calm: () => boolean = () => false;
  /** The street's season, festival and weather (D6), once the scene is up. */
  decor?: TownDecor;
  private umbrella?: Phaser.GameObjects.Image;
  private falling?: Phaser.GameObjects.Particles.ParticleEmitter;
  /** Fog over the whole street (plan-1.7.md G4), and the white of a lightning flash. */
  private fog?: Phaser.GameObjects.Rectangle;
  private flashSheet?: Phaser.GameObjects.Rectangle;
  private flashTimer?: Phaser.Time.TimerEvent;
  /** What the street was last dressed for, so it changes only when the day does. */
  private dressed = '';
  /** The one out on an errand, copied from the inset every frame so both show her in the same place and pose. */
  private seen?: Phaser.GameObjects.Sprite;
  private shade!: Phaser.GameObjects.Rectangle;
  /** Ends the move under way, if one is. */
  private paradeEnd?: (cut: boolean) => void;
  private press: { x: number; scroll: number; moved: boolean } | null = null;
  /** What the town has grown (D5), once the scene is up; the counts it was last told, for when it comes up. */
  growth?: TownGrowth;
  private counts?: TownCounts;
  /** The neighbours' stories (D4), once the scene is up; who waits and what was left, as last told. */
  stories?: TownStories;
  private tales: { waiting: Teller[]; left: string[] } = { waiting: [], left: [] };
  /** The hour the street goes by, as the shop shows the day (crowd.ts hourOf). */
  hour: () => number = () => new Date().getHours();
  /** People passing along the street (plan-1.6.md F3), and how each is drawn. */
  readonly crowd = new Crowd();
  private drawnPassers = new Map<number, { sprite: Phaser.GameObjects.Sprite; umbrella: Phaser.GameObjects.Image }>();

  constructor() {
    super({ key: 'street', active: false });
  }

  preload() {
    // The shop has usually loaded them already, for its inset.
    for (const [key, url] of [['town-street', streetUrl], ['town-fronts', frontsUrl], ['town-props', propsUrl], ['town-signs', signsUrl]]) {
      if (!this.textures.exists(key)) this.load.image(key, url);
    }
    for (const [key, url] of RIVER_LAYERS) if (!this.textures.exists(key)) this.load.image(key, url);
    if (!this.textures.exists('town-grow')) preloadTownGrowth(this.load);
    if (!this.textures.exists('town-decor')) preloadTownDecor(this.load);
    if (!this.textures.exists('town-story')) preloadTownStories(this.load);
    PASSER_SHEETS.forEach((url, i) => {
      if (!this.textures.exists(passerKey(i + 1))) this.load.spritesheet(passerKey(i + 1), url, { frameWidth: STAFF_FRAME.width, frameHeight: STAFF_FRAME.height });
    });
  }

  create(data: { at?: ShopId }) {
    for (const key of ['town-street', 'town-fronts', 'town-props', 'town-signs']) {
      this.add.image(0, 0, key).setOrigin(0).setDepth(key === 'town-street' ? DEPTH.street : DEPTH.fronts);
    }
    this.add.image(RIVER.x, 0, 'river-street').setOrigin(0).setDepth(DEPTH.street);
    this.add.image(RIVER.x, 0, 'river-fronts').setOrigin(0).setDepth(DEPTH.fronts);
    this.add.image(RIVER.x, 0, 'river-props').setOrigin(0).setDepth(DEPTH.fronts);
    this.add.image(RIVER.tower.x, RIVER.tower.y, 'river-tower').setOrigin(0).setDepth(DEPTH.fronts);
    this.growth = new TownGrowth(this);
    for (const image of this.growth.images) image.setDepth(DEPTH.grown);
    if (this.counts) this.growth.show(this.counts);
    this.decor = new TownDecor(this);
    for (const image of this.decor.ground) image.setDepth(DEPTH.ground);
    for (const image of this.decor.up) image.setDepth(DEPTH.up);
    if (this.counts) this.decor.setGrown(streetGrown(this.counts.total));
    this.stories = new TownStories(this, { things: DEPTH.story, people: DEPTH.people });
    this.stories.show(this.tales.waiting, this.tales.left, this.calm());
    this.umbrella = addUmbrella(this).setDepth(DEPTH.people + 0.5);
    this.passerAnims();
    this.dressed = '';
    this.shade = this.add.rectangle(0, 0, CANVAS.width, CANVAS.height, 0xffffff).setOrigin(0).setScrollFactor(0).setDepth(999)
      .setBlendMode(Phaser.BlendModes.MULTIPLY);
    this.cameras.main.setBounds(0, 0, TOWN.width, TOWN.height);
    this.arrive(data?.at ?? 'cafe');
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => { this.press = { x: p.x, scroll: this.cameras.main.scrollX, moved: false }; });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!this.press || !p.isDown) return;
      const dx = p.x - this.press.x;
      if (Math.abs(dx) > DRAG) this.press.moved = true;
      if (this.press.moved) this.scrollTo(this.press.scroll - dx);
    });
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      const press = this.press;
      this.press = null;
      if (!press || press.moved) return;
      const out = this.walker();
      if (out && this.seen?.visible && this.seen.getBounds().contains(p.worldX, p.worldY)) return this.onActor(out.actor);
      const who = this.stories?.at(p.worldX, p.worldY);
      if (who) return this.onNeighbour(who);
      const passer = this.crowd.idAt(p.worldX, p.worldY);
      if (passer !== null) return this.crowd.glance(passer);
      const id = frontAt(p.worldX, p.worldY);
      if (id) this.onFront(id, OPEN.has(id));
    });
    this.events.on(Phaser.Scenes.Events.WAKE, (_sys: unknown, d?: { at?: ShopId }) => this.arrive(d?.at ?? 'cafe'));
  }

  /** What the town has done, so the street shows what has grown with it (D5). */
  setTown(counts: TownCounts) {
    this.counts = counts;
    this.growth?.show(counts);
    this.decor?.setGrown(streetGrown(counts.total));
  }

  /** Who has a chapter waiting and what the chapters told have left (D4). */
  setStories(waiting: Teller[], left: string[]) {
    this.tales = { waiting, left };
    this.stories?.show(waiting, left, this.calm());
  }

  update(_time: number, delta: number) {
    this.shade.setFillStyle(this.tint());
    this.dress();
    this.walkCrowd(delta);
    const w = this.walker();
    if (!w) {
      this.seen?.setVisible(false);
      this.umbrella?.setVisible(false);
      return;
    }
    this.seen ??= this.add.sprite(w.x, w.y, w.texture).setOrigin(0.5, 1).setDepth(DEPTH.people);
    this.seen.setVisible(true).setPosition(w.x, w.y).setAlpha(w.alpha).setTexture(w.texture, w.frame);
    if (this.umbrella) holdUmbrella(this.umbrella.setVisible(!!this.decor?.umbrella).setAlpha(w.alpha), w.x, w.y);
  }

  /** The passers' standing and walking, made once for the whole game. */
  private passerAnims() {
    for (let look = 1; look <= PASSER_LOOKS; look++) {
      const key = passerKey(look);
      for (const name of ['idle', 'walk'] as const) {
        const def = STAFF_ANIMS[name];
        for (const facing of DIRECTIONS) {
          if (this.anims.exists(`${key}-${name}-${facing}`)) continue;
          this.anims.create({ key: `${key}-${name}-${facing}`, frames: this.anims.generateFrameNumbers(key, { frames: staffFrames(name, facing) }), frameRate: def.fps, repeat: def.repeat });
        }
      }
    }
  }

  /**
   * Move the passers on and draw them (plan-1.6.md F3): walking left or right, facing the shop at a door, facing out when
   * clicked, an umbrella over each in the rain or the snow. Only while the street is on screen and the window shown.
   */
  private walkCrowd(delta: number) {
    const cam = this.cameras.main;
    const sky = this.outside().sky;
    this.crowd.tick(Math.min(delta, 250), {
      hour: this.hour(), sky, view: { left: cam.scrollX, right: cam.scrollX + CANVAS.width }, onScreen: this.sys.isVisible() && !document.hidden,
    });
    const here = new Set<number>();
    for (const p of this.crowd.passers) {
      here.add(p.id);
      let drawn = this.drawnPassers.get(p.id);
      if (!drawn) {
        drawn = { sprite: this.add.sprite(p.x, p.y, passerKey(p.look)).setOrigin(0.5, 1), umbrella: addUmbrella(this) };
        this.drawnPassers.set(p.id, drawn);
      }
      const depth = DEPTH.people - 1 + p.y / 1000;
      drawn.sprite.setPosition(Math.round(p.x), p.y).setDepth(depth).play(this.passerAnim(p), true);
      holdUmbrella(drawn.umbrella.setVisible(umbrellaUp(sky)).setDepth(depth + 0.0005), p.x, p.y);
    }
    for (const [id, drawn] of this.drawnPassers) {
      if (here.has(id)) continue;
      drawn.sprite.destroy();
      drawn.umbrella.destroy();
      this.drawnPassers.delete(id);
    }
  }

  private passerAnim(p: Passer): string {
    const key = passerKey(p.look);
    if (p.pose === 'look') return `${key}-idle-up`;
    if (p.pose === 'glance') return `${key}-idle-down`;
    return `${key}-walk-${p.dir > 0 ? 'right' : 'left'}`;
  }

  /** Follow the shop's day: the season, the festival, the weather and what falls from the sky (D6). */
  private dress() {
    const outside = this.outside();
    const calm = this.calm();
    const key = `${outside.season} ${outside.holiday} ${outside.sky} ${calm}`;
    if (key === this.dressed || !this.decor) return;
    this.dressed = key;
    this.decor.setOutside(outside);
    this.growth?.putAway(putAway(outside));
    this.falling?.destroy();
    this.falling = undefined;
    this.fog ??= this.add.rectangle(0, 0, CANVAS.width, CANVAS.height, 0xe8ecf0).setOrigin(0).setScrollFactor(0).setDepth(DEPTH.falling - 0.5);
    this.fog.setAlpha(fogFor(outside.sky, periodAt(new Date().getHours())) * 0.8);
    this.flashSheet ??= this.add.rectangle(0, 0, CANVAS.width, CANVAS.height, 0xffffff).setOrigin(0).setScrollFactor(0).setDepth(DEPTH.falling + 0.5).setAlpha(0);
    this.flashTimer?.remove();
    this.flashTimer = undefined;
    if (flashesFor(outside.sky, calm)) this.flash();
    const f = FALLING[outside.sky];
    if (!f || calm) return;
    // As past the shop's windows (WeatherLayer), over the whole view, which moves with nobody.
    const lifespan = ((CANVAS.height + 8) / f.speed) * 1000;
    const sway = outside.sky === 'rain' || outside.sky === 'storm' ? 0 : f.drift / (outside.sky === 'wind' ? 4 : 1);
    this.falling = this.add.particles(0, 0, 'weather-px', {
      x: { min: -Math.abs(f.drift), max: CANVAS.width + Math.abs(f.drift) },
      y: -4,
      speedY: { min: f.speed * 0.8, max: f.speed * 1.2 },
      speedX: { min: f.drift - sway, max: f.drift + sway },
      scaleX: f.w,
      scaleY: f.h,
      tint: f.color,
      lifespan,
      frequency: 1000 / (f.perSecond * (CANVAS.width / 64)),
      advance: lifespan,
    }).setScrollFactor(0).setDepth(DEPTH.falling);
  }

  /** Lightning now and then in a storm: the whole street goes white for a moment. */
  private flash() {
    this.flashTimer = this.time.delayedCall(Phaser.Math.Between(...FLASH_GAP_MS), () => {
      this.tweens.add({ targets: this.flashSheet, alpha: { from: 0.6, to: 0 }, duration: 350, ease: 'Quad.easeOut' });
      this.flash();
    });
  }

  /**
   * The shop moving onto the street (road-to-1.4.md D7): the movers walk in from the right, a box each, one after
   * another, and go in at the door. Resolves when the last is in, or at once when `endParade` cuts it short: true then.
   */
  parade(actors: ActorId[], at: ShopId): Promise<boolean> {
    this.lookAt(at);
    const y = doorOf(at).y;
    const made: Phaser.GameObjects.GameObject[] = [];
    return new Promise((done) => {
      const plan = paradePlan(actors, at);
      let walking = plan.length;
      const end = (cut: boolean) => {
        this.paradeEnd = undefined;
        this.tweens.killTweensOf(made);
        for (const o of made) o.destroy();
        done(cut);
      };
      this.paradeEnd = end;
      for (const step of plan) {
        const person = this.add.sprite(step.from, y, step.actor).setOrigin(0.5, 1).setDepth(DEPTH.people).play(animKey(step.actor, 'walk', 'left'), true);
        const box = this.add.rectangle(step.from - BOX.ahead, y - BOX.up, BOX.w, BOX.h, BOX.fill).setStrokeStyle(1, BOX.edge).setDepth(DEPTH.people + 1);
        made.push(person, box);
        this.tweens.add({
          targets: [person, box], x: `-=${step.from - step.to}`, delay: step.delay, duration: step.ms,
          onComplete: () => {
            person.play(animKey(step.actor, 'walk', 'up'), true);
            this.tweens.add({ targets: [person, box], y: '-=6', alpha: 0, duration: IN_MS, onComplete: () => { if (--walking === 0) end(false); } });
          },
        });
      }
    });
  }

  /** Cut the move short: everyone is in. */
  endParade() {
    this.paradeEnd?.(true);
  }

  /** Stand in front of a shop's door. */
  lookAt(id: ShopId) {
    this.cameras.main.scrollX = cameraFor(doorOf(id).x);
  }

  /** Out of a shop's door: look at whoever is out on an errand, or else at the door. */
  private arrive(at: ShopId) {
    const out = this.walker();
    if (out) this.cameras.main.scrollX = cameraFor(out.x);
    else this.lookAt(at);
  }

  /** Move along the street, left or right, as an arrow key does. */
  pan(direction: -1 | 1) {
    this.scrollTo(this.cameras.main.scrollX + direction * PAN_STEP);
  }

  /** The front in the middle of the view, which Enter goes into. */
  facing(): ShopId {
    const middle = this.cameras.main.scrollX + CANVAS.width / 2;
    return FRONTS.reduce((a, b) => (Math.abs(b.door - middle) < Math.abs(a.door - middle) ? b : a)).id;
  }

  private scrollTo(x: number) {
    this.cameras.main.scrollX = Math.round(Math.min(Math.max(x, 0), TOWN.width - CANVAS.width));
  }
}
