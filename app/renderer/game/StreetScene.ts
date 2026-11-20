import Phaser from 'phaser';
import frontsUrl from '../../../assets/sprites/town-fronts.png';
import propsUrl from '../../../assets/sprites/town-props.png';
import signsUrl from '../../../assets/sprites/town-signs.png';
import streetUrl from '../../../assets/sprites/town-street.png';
import type { ActorId } from '../../shared/types';
import { CANVAS } from './layout';
import type { Walker } from './StreetView';
import { cameraFor, doorOf, FRONTS, frontAt, OPEN, type ShopId, TOWN } from './town';

/** How far one press of an arrow key moves along the street. */
const PAN_STEP = 48;
/** A press that moves further than this is a drag along the street, not a click on a front. */
const DRAG = 3;

/**
 * The town's street (road-to-1.4.md D1): seven fronts in a row, wider than the canvas. Dragging or the arrow keys
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
  /** The one out on an errand, copied from the inset every frame so both show her in the same place and pose. */
  private seen?: Phaser.GameObjects.Sprite;
  private shade!: Phaser.GameObjects.Rectangle;
  private press: { x: number; scroll: number; moved: boolean } | null = null;

  constructor() {
    super({ key: 'street', active: false });
  }

  preload() {
    // The shop has usually loaded them already, for its inset.
    for (const [key, url] of [['town-street', streetUrl], ['town-fronts', frontsUrl], ['town-props', propsUrl], ['town-signs', signsUrl]]) {
      if (!this.textures.exists(key)) this.load.image(key, url);
    }
  }

  create(data: { at?: ShopId }) {
    for (const key of ['town-street', 'town-fronts', 'town-props', 'town-signs']) this.add.image(0, 0, key).setOrigin(0);
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
      const id = frontAt(p.worldX, p.worldY);
      if (id) this.onFront(id, OPEN.has(id));
    });
    this.events.on(Phaser.Scenes.Events.WAKE, (_sys: unknown, d?: { at?: ShopId }) => this.arrive(d?.at ?? 'cafe'));
  }

  update() {
    this.shade.setFillStyle(this.tint());
    const w = this.walker();
    if (!w) {
      this.seen?.setVisible(false);
      return;
    }
    this.seen ??= this.add.sprite(w.x, w.y, w.texture).setOrigin(0.5, 1).setDepth(10);
    this.seen.setVisible(true).setPosition(w.x, w.y).setAlpha(w.alpha).setTexture(w.texture, w.frame);
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
