import Phaser from 'phaser';
import paintingUrl from '../../../assets/sprites/grow-painting.png';
import plantUrl from '../../../assets/sprites/grow-plant.png';
import lightsUrl from '../../../assets/sprites/grow-lights.png';
import fruitUrl from '../../../assets/sprites/grow-fruit.png';
import guitarUrl from '../../../assets/sprites/grow-guitar.png';
import bonsaiUrl from '../../../assets/sprites/grow-bonsai.png';
import easelUrl from '../../../assets/sprites/grow-easel.png';
import trophyUrl from '../../../assets/sprites/grow-trophy.png';
import worksUrl from '../../../assets/sprites/works.png';
import { overlayDepth } from './pieces';
import { GROWTH, SHELF_SLOTS, WORK_ICONS, type GrowthId, type WorkIcon } from '../../shared/growth';

const URLS: Record<GrowthId, string> = {
  painting: paintingUrl, plant: plantUrl, lights: lightsUrl, fruit: fruitUrl,
  guitar: guitarUrl, bonsai: bonsaiUrl, easel: easelUrl, trophy: trophyUrl,
};

/** On the wall behind everyone, like the holiday decorations, and under them. */
const DEPTH = 1.4;
/** The works shelf on the wall between the blackboard and the clock: a plank with the latest works on it. */
export const SHELF = { x: 126, y: 34, w: 52, h: 11 } as const;
const ICON = 8;
const ICON_GAP = 2;

export function preloadGrowth(load: Phaser.Loader.LoaderPlugin) {
  for (const g of GROWTH) load.image(`grow-${g.id}`, URLS[g.id]);
  load.spritesheet('works', worksUrl, { frameWidth: ICON, frameHeight: ICON });
}

/**
 * What the shop has gathered with the user (shared/growth.ts) and the works shelf. Only draws what it is
 * told; the counting lives in the main process (memory.ts).
 */
export class ShopGrowth {
  private pieces = new Map<GrowthId, Phaser.GameObjects.Image>();
  private plank: Phaser.GameObjects.Graphics;
  private icons: Phaser.GameObjects.Image[] = [];
  private zone: Phaser.GameObjects.Zone;
  onShelfClick: () => void = () => {};

  constructor(private scene: Phaser.Scene, onHover: (on: boolean) => void) {
    for (const g of GROWTH) this.pieces.set(g.id, scene.add.image(0, 0, `grow-${g.id}`).setOrigin(0).setDepth(overlayDepth(`grow-${g.id}`, DEPTH)).setVisible(false));
    // A thin wooden plank with a darker edge and two little brackets; hidden until there is a work to put on it.
    this.plank = scene.add.graphics({ x: SHELF.x, y: SHELF.y + SHELF.h - 2 }).setDepth(DEPTH).setVisible(false);
    this.plank.fillStyle(0xa0703f, 1).fillRect(0, 0, SHELF.w, 1);
    this.plank.fillStyle(0x6e4a2a, 1).fillRect(0, 1, SHELF.w, 1).fillRect(3, 2, 2, 2).fillRect(SHELF.w - 5, 2, 2, 2);
    this.zone = scene.add.zone(SHELF.x, SHELF.y, SHELF.w, SHELF.h + 2).setOrigin(0)
      .on('pointerdown', () => this.onShelfClick())
      .on('pointerover', () => onHover(true))
      .on('pointerout', () => onHover(false));
  }

  /** Whether a piece is out in the shop. */
  shows(id: GrowthId): boolean {
    return this.pieces.get(id)!.visible;
  }

  /** Show what the shop has; a piece that just arrived fades in instead of popping up. */
  setGrown(ids: GrowthId[], fresh: GrowthId[] = []) {
    for (const [id, img] of this.pieces) {
      const on = ids.includes(id);
      if (on && fresh.includes(id) && !img.visible) {
        img.setAlpha(0).setVisible(true);
        this.scene.tweens.add({ targets: img, alpha: 1, duration: 1800 });
      } else img.setVisible(on).setAlpha(1);
    }
  }

  /** Put the latest works on the shelf, newest on the left. */
  setWorks(icons: WorkIcon[]) {
    for (const i of this.icons) i.destroy();
    this.icons = icons.slice(0, SHELF_SLOTS).map((icon, k) =>
      this.scene.add.image(SHELF.x + 1 + k * (ICON + ICON_GAP), SHELF.y + SHELF.h - 2 - ICON, 'works', WORK_ICONS.indexOf(icon)).setOrigin(0).setDepth(DEPTH));
    const any = icons.length > 0;
    this.plank.setVisible(any);
    if (any) this.zone.setInteractive({ useHandCursor: true });
    else this.zone.disableInteractive();
  }

  get hasWorks() {
    return this.icons.length > 0;
  }
}
