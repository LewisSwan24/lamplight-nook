import Phaser from 'phaser';
import type { ActorId } from '../../shared/types';
import type { Period } from './daytime';
import { BEDS, type BedStage, bedStages } from '../../shared/growth';
import { GardenAnimals } from './GardenAnimals';
import { GARDEN_DOOR, GARDEN_DOOR_SPOT, GARDEN_X, type GardenSpot, type SpotId, pathInGarden } from './garden';
import { CANVAS } from './layout';
import { WALK_SPEED } from './life';
import { STAFF_ANIMS, animKey, facingTowards } from './sprites';
import type { Sky } from './weather';

/** The planters (scripts/art/garden.py, PLANTERS), and the sprout after the eight plants in garden-crops.png. */
const BEDS_BOX = { x: 20, y: 70, w: 66, h: 50 };
const SPROUT_FRAME = 8;
/** One-off chores (picking, watering) are done again every few seconds. */
const CHORE_EVERY_MS = [2500, 4500] as const;

type Visitor = { id: ActorId; sprite: Phaser.GameObjects.Sprite; shadow: Phaser.GameObjects.Ellipse; spot: GardenSpot; settled?: boolean; chore?: Phaser.Time.TimerEvent; walk?: Phaser.Tweens.TweenChain };

/**
 * The back garden's picture, its door and whoever is out there. Everything sits at GARDEN_X in the
 * shop's scene; positions passed in and out are garden coordinates (0..320 like the shop's canvas).
 */
export class GardenView {
  private door: Phaser.GameObjects.Sprite;
  private shade: Phaser.GameObjects.Rectangle;
  private visitors = new Map<ActorId, Visitor>();
  onDoorClick: () => void = () => {};
  onActorClick: (actor: ActorId) => void = () => {};
  onAnimalClick: (what: 'dog' | 'hens') => void = () => {};
  /** What the pointer is over: the door and the animals show their names. */
  hovered: 'door' | 'dog' | 'hens' | 'beds' | null = null;
  /** The plants in the beds, which come up as works get finished. */
  private plants: Phaser.GameObjects.Sprite[] = [];
  beds: BedStage[] = bedStages(0);
  /** Malt and the hens, who live out here. */
  readonly animals: GardenAnimals;

  constructor(private scene: Phaser.Scene) {
    scene.add.image(GARDEN_X, 0, 'garden').setOrigin(0);
    this.door = scene.add.sprite(GARDEN_X + GARDEN_DOOR.x, GARDEN_DOOR.y, 'door', 0).setOrigin(0).setDepth(1);
    scene.add.zone(GARDEN_X + GARDEN_DOOR.x, GARDEN_DOOR.y, 16, 32).setOrigin(0)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.onDoorClick())
      .on('pointerover', () => (this.hovered = 'door'))
      .on('pointerout', () => (this.hovered = null));
    this.plants = BEDS.map((b) => scene.add.sprite(GARDEN_X + b.x, b.y, 'garden-crops', 0).setOrigin(0, 1).setDepth(1).setVisible(false));
    scene.add.zone(GARDEN_X + BEDS_BOX.x, BEDS_BOX.y, BEDS_BOX.w, BEDS_BOX.h).setOrigin(0)
      .setInteractive()
      .on('pointerover', () => (this.hovered = 'beds'))
      .on('pointerout', () => (this.hovered = null));
    this.animals = new GardenAnimals(scene, GARDEN_X, (what) => this.onAnimalClick(what), (what) => (this.hovered = what));
    // The garden's own share of the time-of-day light.
    this.shade = scene.add.rectangle(GARDEN_X, 0, CANVAS.width, CANVAS.height, 0xffffff).setOrigin(0).setDepth(999).setBlendMode(Phaser.BlendModes.MULTIPLY);
  }

  setTint(color: number) {
    this.shade.setFillStyle(color);
  }

  /** How many works the shop has finished decides what is growing. */
  setWorksDone(done: number) {
    this.beds = bedStages(done);
    this.beds.forEach((stage, i) => {
      this.plants[i].setVisible(stage !== 'empty').setFrame(stage === 'ripe' ? i : SPROUT_FRAME);
    });
  }

  /** The weather and the hour, which send the animals in and out. */
  setOutdoors(sky: Sky, period: Period) {
    this.animals.setOutdoors(sky, period);
  }

  has(actor: ActorId): boolean {
    return this.visitors.has(actor);
  }

  /** Who is out here and settled at a spot (not still walking over or heading in). */
  settled(): { id: ActorId; spot: SpotId }[] {
    return [...this.visitors.values()].filter((v) => v.settled).map((v) => ({ id: v.id, spot: v.spot.id }));
  }

  /** Step out of the back door and walk over to a spot. */
  async arrive(actor: ActorId, spot: GardenSpot): Promise<void> {
    this.remove(actor);
    const x = GARDEN_X + GARDEN_DOOR_SPOT.x;
    const shadow = this.scene.add.ellipse(x, GARDEN_DOOR_SPOT.y, actor === 'cat' ? 20 : 11, 4, 0x2e3b22, 0.3).setAlpha(0);
    const sprite = this.scene.add.sprite(x, GARDEN_DOOR_SPOT.y - 8, actor).setOrigin(0.5, 1).setAlpha(0).setDepth(GARDEN_DOOR_SPOT.y);
    const v: Visitor = { id: actor, sprite, shadow, spot };
    this.visitors.set(actor, v);
    sprite.setInteractive({ useHandCursor: true, pixelPerfect: true }).on('pointerdown', () => this.onActorClick(actor));
    sprite.on(Phaser.Animations.Events.ANIMATION_COMPLETE, () => this.rest(v));
    this.door.play('door-open');
    this.walkAnim(v, 'down');
    await this.tween({ targets: [sprite, shadow], y: GARDEN_DOOR_SPOT.y, alpha: 1, duration: 420 });
    this.door.play('door-close');
    if (!this.visitors.has(actor)) return;
    await this.walk(v, pathInGarden({ x: GARDEN_DOOR_SPOT.x, y: GARDEN_DOOR_SPOT.y }, spot));
    if (this.visitors.get(actor) === v) this.settle(v);
  }

  /** Go back in: walk to the door and through it, or vanish at once when nobody is looking. */
  async leave(actor: ActorId, quick: boolean): Promise<void> {
    const v = this.visitors.get(actor);
    if (!v) return;
    v.settled = false;
    this.tellAnimals();
    v.chore?.remove();
    if (quick) return this.remove(actor);
    v.walk?.stop();
    // Back across the lawn, then up the path to the door.
    await this.walk(v, pathInGarden({ x: v.sprite.x - GARDEN_X, y: v.sprite.y }, GARDEN_DOOR_SPOT));
    if (this.visitors.get(actor) !== v) return;
    this.door.play('door-open');
    this.walkAnim(v, 'up');
    await this.tween({ targets: [v.sprite, v.shadow], y: GARDEN_DOOR_SPOT.y - 8, alpha: 0, duration: 420 });
    this.door.play('door-close');
    this.remove(actor);
  }

  remove(actor: ActorId) {
    const v = this.visitors.get(actor);
    if (!v) return;
    v.chore?.remove();
    v.walk?.stop();
    v.sprite.destroy();
    v.shadow.destroy();
    this.visitors.delete(actor);
    this.tellAnimals();
  }

  update() {
    this.animals.update();
    for (const v of this.visitors.values()) v.shadow.setPosition(v.sprite.x + (v.id === 'cat' ? 3 : 0), v.sprite.y - 1);
  }

  /** Visitors' heads (garden coordinates) for their bubbles, and what can be clicked out here. */
  heads(): { id: ActorId; x: number; y: number }[] {
    return [...this.visitors.values()].map((v) => ({ id: v.id, x: v.sprite.x - GARDEN_X, y: v.sprite.y - (v.id === 'cat' ? 12 : 30) - 2 }));
  }

  hotspots(): { id: ActorId | 'door' | 'dog' | 'hens' | 'beds'; x: number; y: number; w: number; h: number }[] {
    const people = [...this.visitors.values()].map((v) => {
      const b = v.sprite.getBounds();
      return { id: v.id, x: b.x - GARDEN_X, y: b.y, w: b.width, h: b.height };
    });
    return [{ id: 'door' as const, x: GARDEN_DOOR.x, y: GARDEN_DOOR.y, w: 16, h: 32 }, { id: 'beds' as const, ...BEDS_BOX }, ...this.animals.hotspots(), ...people];
  }

  /** Arrived: do what this spot is for. */
  private settle(v: Visitor) {
    v.settled = true;
    this.tellAnimals(v);
    v.sprite.setDepth(v.sprite.y);
    if (v.id === 'cat') {
      v.sprite.play('cat-lie', true);
      return;
    }
    const def = STAFF_ANIMS[v.spot.anim];
    v.sprite.play(animKey(v.id, v.spot.anim, v.spot.facing), true);
    if (def && def.repeat === 0) this.choreLater(v);
  }

  /**
   * Malt keeps someone company (whoever just settled, else anyone still out here) and the hens crowd
   * round whoever is scattering grain. `arrived`: Malt barks hello first.
   */
  private tellAnimals(arrived?: Visitor) {
    const settled = [...this.visitors.values()].filter((v) => v.settled);
    const company = arrived ?? settled.at(-1);
    this.animals.setCompany(company ? { x: company.spot.x, y: company.spot.y } : null, !!arrived);
    const feeder = settled.find((v) => v.spot.id === 'hens');
    this.animals.setFeeder(feeder ? { x: feeder.spot.x, y: feeder.spot.y } : null);
  }

  /** Between two goes at a chore, stand and look at the work. */
  private rest(v: Visitor) {
    if (v.id === 'cat' || v.walk?.isPlaying()) return;
    v.sprite.play(animKey(v.id, 'idle', v.spot.facing), true);
  }

  private choreLater(v: Visitor) {
    const [lo, hi] = CHORE_EVERY_MS;
    v.chore = this.scene.time.delayedCall(lo + Math.random() * (hi - lo), () => {
      if (this.visitors.get(v.id) !== v) return;
      v.sprite.play(animKey(v.id, v.spot.anim, v.spot.facing), true);
      this.choreLater(v);
    });
  }

  private walk(v: Visitor, points: { x: number; y: number }[]): Promise<void> {
    if (!points.length) return Promise.resolve();
    const speed = WALK_SPEED[v.id];
    let from = { x: v.sprite.x - GARDEN_X, y: v.sprite.y };
    const steps = points.map((to) => {
      const start = from;
      from = to;
      return {
        targets: [v.sprite],
        x: GARDEN_X + to.x,
        y: to.y,
        duration: (Math.hypot(to.x - start.x, to.y - start.y) / speed) * 1000,
        onStart: () => this.walkAnim(v, facingTowards(start, to)),
        onUpdate: () => v.sprite.setDepth(v.sprite.y),
      };
    });
    return new Promise((done) => {
      v.walk = this.scene.tweens.chain({ tweens: steps, onComplete: () => done(), onStop: () => done() });
    });
  }

  private walkAnim(v: Visitor, facing: ReturnType<typeof facingTowards>) {
    v.sprite.play(v.id === 'cat' ? 'cat-lie' : animKey(v.id, 'walk', facing), true);
  }

  private tween(config: Phaser.Types.Tweens.TweenBuilderConfig): Promise<void> {
    return new Promise((done) => this.scene.tweens.add({ ...config, onComplete: () => done(), onStop: () => done() }));
  }
}
