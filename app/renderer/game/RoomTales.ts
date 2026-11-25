import Phaser from 'phaser';
import type { RoomId } from '../../shared/scenes';
import { keptIn } from '../../shared/stories';

/** One room-sized overlay per thing (scripts/art/tales.py), named after it. */
const URLS = import.meta.glob<string>('../../../assets/sprites/tale-*.png', { eager: true, import: 'default' });
const url = (id: string) => URLS[`../../../assets/sprites/tale-${id}.png`];

/** On the wall behind everyone, with the pieces a shop grows. */
const DEPTH = 1.4;

export function preloadTales(load: Phaser.Loader.LoaderPlugin, room: RoomId) {
  for (const id of keptIn(room)) if (!load.textureManager.exists(`tale-${id}`)) load.image(`tale-${id}`, url(id));
}

/**
 * What Auntie Olive's and Pip's stories leave in their own shops (plan-1.6.md F4): hung on the wall once the chapter
 * is told. Only draws what it is told; when a chapter comes is in shared/stories.ts.
 */
export class RoomTales {
  private things = new Map<string, Phaser.GameObjects.Image>();
  /** What was there when the room was first shown is simply there; only what comes later fades in. */
  private first = true;

  constructor(private scene: Phaser.Scene, room: RoomId) {
    for (const id of keptIn(room)) this.things.set(id, scene.add.image(0, 0, `tale-${id}`).setOrigin(0).setDepth(DEPTH).setVisible(false));
  }

  /** Show what the chapters told have left here; a thing just left fades in. */
  show(left: string[], calm = false) {
    for (const [id, image] of this.things) {
      const on = left.includes(id);
      if (on && !image.visible && !calm && !this.first) {
        image.setAlpha(0).setVisible(true);
        this.scene.tweens.add({ targets: image, alpha: 1, duration: 1800 });
      } else image.setVisible(on).setAlpha(1);
    }
    this.first = false;
  }

  /** For the acceptance scenarios: whether a thing hangs here, its picture loaded. */
  shows(id: string): boolean {
    const image = this.things.get(id);
    return !!image?.visible && image.texture.key === `tale-${id}`;
  }
}
