import Phaser from 'phaser';
import data from '../../../assets/sprites/town-story.json';
import storyUrl from '../../../assets/sprites/town-story.png';
import { TELLERS, type Teller } from '../../shared/stories';
import type { Facing } from './layout';
import { animKey } from './sprites';

/**
 * The neighbours' stories on the street (road-to-1.4.md D4): whoever has a chapter waiting stands at their own place
 * with a small bubble over their head, and what the chapters told have left stands against the fronts. Cut from one
 * sheet (scripts/art/story.py, town-story.png), placed where town-story.json says. Only draws what it is told; when a
 * chapter comes is in shared/stories.ts.
 */

type Wait = { x: number; y: number; anim: string; facing: string };
const WAITS = data.waits as Record<Teller, Wait>;
/** How far above the feet the bubble floats, over the head (sitting is lower). */
const BUBBLE_UP = { stand: 36, sit: 30 };
/** The bubble bobs a little, unless less motion is asked for. */
const BOB = { px: 1, ms: 700 };

export function preloadTownStories(load: Phaser.Loader.LoaderPlugin) {
  load.image('town-story', storyUrl);
}

export class TownStories {
  private things = new Map<string, Phaser.GameObjects.Image>();
  private people = new Map<Teller, { person: Phaser.GameObjects.Sprite; bubble: Phaser.GameObjects.Image }>();
  private bobs: Phaser.Tweens.Tween[] = [];

  /** `depth`: of what was left; the neighbours stand among the people, their bubbles just above. */
  constructor(private scene: Phaser.Scene, depth: { things: number; people: number }) {
    const sheet = scene.textures.get('town-story');
    for (const p of data.parts) if (!sheet.has(p.id)) sheet.add(p.id, 0, p.sx, p.sy, p.w, p.h);
    if (!sheet.has('bubble')) sheet.add('bubble', 0, data.bubble.sx, data.bubble.sy, data.bubble.w, data.bubble.h);
    for (const p of data.parts) this.things.set(p.id, scene.add.image(p.x, p.y, 'town-story', p.id).setOrigin(0).setDepth(depth.things).setVisible(false));
    for (const who of TELLERS) {
      const at = WAITS[who];
      const person = scene.add.sprite(at.x, at.y, who).setOrigin(0.5, 1).setDepth(depth.people).setVisible(false);
      const up = at.anim === 'sit' ? BUBBLE_UP.sit : BUBBLE_UP.stand;
      const bubble = scene.add.image(at.x + 4, at.y - up, 'town-story', 'bubble').setOrigin(0, 1).setDepth(depth.people + 1).setVisible(false);
      this.people.set(who, { person, bubble });
    }
  }

  /** Show who is waiting and what has been left. `calm`: the bubbles stay still. */
  show(waiting: Teller[], left: string[], calm = false) {
    for (const [id, image] of this.things) image.setVisible(left.includes(id));
    for (const t of this.bobs) t.remove();
    this.bobs = [];
    for (const [who, { person, bubble }] of this.people) {
      const here = waiting.includes(who);
      person.setVisible(here);
      bubble.setVisible(here);
      if (!here) {
        person.stop();
        continue;
      }
      const at = WAITS[who];
      person.play(animKey(who, at.anim, at.facing as Facing), true);
      bubble.y = at.y - (at.anim === 'sit' ? BUBBLE_UP.sit : BUBBLE_UP.stand);
      if (!calm) this.bobs.push(this.scene.tweens.add({ targets: bubble, y: bubble.y - BOB.px, duration: BOB.ms, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' }));
    }
  }

  /** The waiting neighbour at a point on the street, the bubble included. */
  at(x: number, y: number): Teller | null {
    for (const [who, { person, bubble }] of this.people) {
      if (person.visible && (person.getBounds().contains(x, y) || bubble.getBounds().contains(x, y))) return who;
    }
    return null;
  }

  /** For the acceptance scenarios: who is waiting, what stands on the street, and where a neighbour is on the screen. */
  waiting(): Teller[] {
    return TELLERS.filter((who) => this.people.get(who)!.person.visible);
  }

  shows(id: string): boolean {
    return !!this.things.get(id)?.visible;
  }

  spot(who: Teller): { x: number; y: number } {
    const b = this.people.get(who)!.person.getBounds();
    return { x: b.centerX, y: b.centerY };
  }
}
