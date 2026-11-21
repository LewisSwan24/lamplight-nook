import Phaser from 'phaser';
import data from '../../../assets/sprites/town.json';
import growUrl from '../../../assets/sprites/town-grow.png';
import { frontGrown, streetGrown, type TownCounts } from '../../shared/towngrow';
import type { RoomId } from '../../shared/scenes';

/**
 * What grows along the town's street (road-to-1.4.md D5): pieces on the pavement and in the lot, and a pot, a sign and
 * flags at each front. All cut from one sheet (scripts/art/town.py, town-grow.png), standing where town.json says. Only
 * draws what it is told; the counting is in shared/towngrow.ts. Used by the street scene and by the inset in each room.
 */

type Part = (typeof data.grow)[number];
const shopOf = (p: Part): RoomId | undefined => ('shop' in p ? (p.shop as RoomId) : undefined);

export function preloadTownGrowth(load: Phaser.Loader.LoaderPlugin) {
  load.image('town-grow', growUrl);
}

/** Each piece's frame on the sheet, cut once for the whole game. */
function cutFrames(textures: Phaser.Textures.TextureManager) {
  const sheet = textures.get('town-grow');
  data.grow.forEach((p, i) => { if (!sheet.has(`part-${i}`)) sheet.add(`part-${i}`, 0, p.sx, p.sy, p.w, p.h); });
}

export class TownGrowth {
  /** The images, back to front: the lower a piece stands, the later it is drawn. */
  readonly images: Phaser.GameObjects.Image[] = [];
  private parts: { part: Part; image: Phaser.GameObjects.Image }[] = [];

  /** `top`: the town's y at the top of whatever holds the images (the inset shows only the lower part of the street). */
  constructor(scene: Phaser.Scene, top = 0) {
    cutFrames(scene.textures);
    const order = data.grow.map((part, i) => ({ part, i })).sort((a, b) => a.part.y + a.part.h - (b.part.y + b.part.h));
    for (const { part, i } of order) {
      const image = scene.add.image(part.x, part.y - top, 'town-grow', `part-${i}`).setOrigin(0).setVisible(false);
      this.images.push(image);
      this.parts.push({ part, image });
    }
  }

  /** Show what the town has with these counts. */
  show(counts: TownCounts) {
    const street = streetGrown(counts.total);
    for (const { part, image } of this.parts) {
      const shop = shopOf(part);
      image.setVisible(shop ? (frontGrown(counts.shops[shop]) as string[]).includes(part.id) : (street as string[]).includes(part.id));
    }
  }

  /** Whether a piece is out, on the street or at a shop's front (for the acceptance scenarios). */
  shows(id: string, shop?: RoomId): boolean {
    return this.parts.some(({ part, image }) => part.id === id && shopOf(part) === shop && image.visible);
  }
}
