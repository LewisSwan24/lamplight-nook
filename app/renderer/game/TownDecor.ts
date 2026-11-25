import Phaser from 'phaser';
import decorUrl from '../../../assets/sprites/town-decor.png';
import { DECOR, decorOut, type Outside, umbrellaUp } from './streetdecor';

/**
 * The street's season, festival and weather (road-to-1.4.md D6), cut from one sheet (scripts/art/decor.py,
 * town-decor.png) and standing where town-decor.json says. Only draws what it is told; streetdecor.ts says what is out.
 * Used by the street scene and by the inset in each room, like TownGrowth.
 */

export function preloadTownDecor(load: Phaser.Loader.LoaderPlugin) {
  load.image('town-decor', decorUrl);
}

/** Each piece's frame on the sheet, and the umbrella's, cut once for the whole game. */
function cutFrames(textures: Phaser.Textures.TextureManager) {
  const sheet = textures.get('town-decor');
  DECOR.parts.forEach((p, i) => { if (!sheet.has(`part-${i}`)) sheet.add(`part-${i}`, 0, p.sx, p.sy, p.w, p.h); });
  const u = DECOR.umbrella;
  if (!sheet.has('umbrella')) sheet.add('umbrella', 0, u.sx, u.sy, u.w, u.h);
}

export class TownDecor {
  /** What lies on the ground, under the fronts and props: puddles, snow, fallen leaves, shade. */
  readonly ground: Phaser.GameObjects.Image[] = [];
  /** What stands or hangs in front of them: snow on the trees, lanterns, the stalls in the lot. */
  readonly up: Phaser.GameObjects.Image[] = [];
  private parts: { part: (typeof DECOR.parts)[number]; image: Phaser.GameObjects.Image }[] = [];
  private outside?: Outside;
  private grown: readonly string[] = [];

  /** `top`: the town's y at the top of whatever holds the images (the inset shows only the lower part of the street). */
  constructor(scene: Phaser.Scene, top = 0) {
    cutFrames(scene.textures);
    DECOR.parts.forEach((part, i) => {
      const image = scene.add.image(part.x, part.y - top, 'town-decor', `part-${i}`).setOrigin(0).setVisible(false);
      (part.ground ? this.ground : this.up).push(image);
      this.parts.push({ part, image });
    });
  }

  /** Today's season, festival and weather. */
  setOutside(outside: Outside) {
    this.outside = outside;
    this.show();
  }

  /** What the town has grown: a tree's blossom or snow comes with the tree. */
  setGrown(grown: readonly string[]) {
    this.grown = grown;
    this.show();
  }

  /** Whether a piece of this kind is out (for the acceptance scenarios). */
  shows(id: string): boolean {
    return this.parts.some(({ part, image }) => part.id === id && image.visible);
  }

  /** An umbrella over whoever is out, when it rains or snows. */
  get umbrella(): boolean {
    return !!this.outside && umbrellaUp(this.outside.sky);
  }

  private show() {
    for (const { part, image } of this.parts) image.setVisible(!!this.outside && decorOut(part, this.outside, this.grown));
  }
}

/** The umbrella, opened over someone standing at (x, y): her feet. */
export function addUmbrella(scene: Phaser.Scene): Phaser.GameObjects.Image {
  cutFrames(scene.textures);
  return scene.add.image(0, 0, 'town-decor', 'umbrella').setOrigin(0).setVisible(false);
}

/** Hold it over her: called every frame with her feet. */
export function holdUmbrella(umbrella: Phaser.GameObjects.Image, x: number, y: number) {
  umbrella.setPosition(Math.round(x + DECOR.umbrella.x), Math.round(y + DECOR.umbrella.y));
}
