import Phaser from 'phaser';
import frontsUrl from '../../../assets/sprites/town-fronts.png';
import propsUrl from '../../../assets/sprites/town-props.png';
import signsUrl from '../../../assets/sprites/town-signs.png';
import streetUrl from '../../../assets/sprites/town-street.png';
import { CANVAS } from './layout';
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
  private shade!: Phaser.GameObjects.Rectangle;
  private press: { x: number; scroll: number; moved: boolean } | null = null;

  constructor() {
    super({ key: 'street', active: false });
  }

  preload() {
    this.load.image('town-street', streetUrl);
    this.load.image('town-fronts', frontsUrl);
    this.load.image('town-props', propsUrl);
    this.load.image('town-signs', signsUrl);
  }

  create(data: { at?: ShopId }) {
    for (const key of ['town-street', 'town-fronts', 'town-props', 'town-signs']) this.add.image(0, 0, key).setOrigin(0);
    this.shade = this.add.rectangle(0, 0, CANVAS.width, CANVAS.height, 0xffffff).setOrigin(0).setScrollFactor(0).setDepth(999)
      .setBlendMode(Phaser.BlendModes.MULTIPLY);
    this.cameras.main.setBounds(0, 0, TOWN.width, TOWN.height);
    this.lookAt(data?.at ?? 'cafe');
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
      const id = frontAt(p.worldX, p.worldY);
      if (id) this.onFront(id, OPEN.has(id));
    });
    this.events.on(Phaser.Scenes.Events.WAKE, (_sys: unknown, d?: { at?: ShopId }) => this.lookAt(d?.at ?? 'cafe'));
  }

  update() {
    this.shade.setFillStyle(this.tint());
  }

  /** Stand in front of a shop's door. */
  lookAt(id: ShopId) {
    this.cameras.main.scrollX = cameraFor(doorOf(id).x);
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
