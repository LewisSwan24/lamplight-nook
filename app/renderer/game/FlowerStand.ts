import Phaser from 'phaser';
import flowersUrl from '../../../assets/sprites/flowers.png';
import flowersData from '../../../assets/sprites/flowers.json';
import { SLOTS, stageOf, type Vase } from '../../shared/flowers';

/**
 * The flower shop's flowers in the room (plan-2.0.md J12): the six vases on the stand of steps (scripts/art/flowershop.py
 * draws the steps bare), a folded card on the counter that opens today's flowers, and the shop's finished flower cards
 * pinned on the wall between the wreath and the clock. Pictures from scripts/art/flowers.py.
 */
const FRAMES = (flowersData as { frames: Record<string, number[]> }).frames;
export const preloadFlowers = (load: Phaser.Loader.LoaderPlugin) => load.image('flowers', flowersUrl);

/** The stand's top left in the room, and each vase's left foot on it (scripts/art/flowershop.py VASES). */
const STAND = { x: 6, y: 116 } as const;
const FEET = [[22, 10], [34, 10], [12, 22], [26, 22], [3, 34], [17, 34]] as const;
/** The vase in the picture starts this far in from its frame's left edge. */
const VASE_LEFT = 2;
/** The stand's foot (pieces.json `base`): the vases go just in front of it, the lower steps' in front of the upper. */
const STAND_DEPTH = 156;
export const COUNTER_CARD = { x: 255, y: 71, w: 9, h: 7 } as const;
/** The bare wall right of the wreath, up to the clock: two rows of three cards. */
export const CARD_WALL = { x: 153, y: 23, w: 8, h: 10 } as const;
export const WALL_MAX = 6;
const PER_ROW = 3;

/** Where a vase's picture goes: its frame's bottom left. */
export const vaseSpot = (slot: number): { x: number; y: number } => ({ x: STAND.x + FEET[slot][0] - VASE_LEFT, y: STAND.y + FEET[slot][1] });
/** Where the `i`th card pinned on the wall goes, newest first. */
export const cardSpot = (i: number): { x: number; y: number } => ({ x: CARD_WALL.x + (i % PER_ROW) * CARD_WALL.w, y: CARD_WALL.y + Math.floor(i / PER_ROW) * (CARD_WALL.h + 1) });
/** The picture for a vase on `day`: its bunch at its age, or only water once sold. */
export const vaseFrame = (v: Vase, day: string): string => (!v.bunch || v.soldTo ? 'vase' : `${v.bunch.flower}-${stageOf(v.bunch, day)}`);
/** A flower-card target on the wall, by its place (`flowercard-<n>`). */
export function flowerCardIndex(target: string): number | null {
  const m = /^flowercard-(\d)$/.exec(target);
  return m ? Number(m[1]) : null;
}

type Hooks = { activate: (target: 'flowers' | `flowercard-${number}`) => void; hover: (target: string | null) => void };

export class FlowerStand {
  private readonly vases: Phaser.GameObjects.Image[];
  private wall: { img: Phaser.GameObjects.Image; zone: Phaser.GameObjects.Zone }[] = [];
  /** The titles of the cards on the wall, newest first, for their labels. */
  titles: string[] = [];

  constructor(private scene: Phaser.Scene, private hooks: Hooks) {
    const sheet = scene.textures.get('flowers');
    for (const [name, [x, y, w, h]] of Object.entries(FRAMES)) if (!sheet.has(name)) sheet.add(name, 0, x, y, w, h);
    this.vases = Array.from({ length: SLOTS }, (_, slot) => {
      const at = vaseSpot(slot);
      return scene.add.image(at.x, at.y, 'flowers', 'vase').setOrigin(0, 1).setDepth(STAND_DEPTH + 0.01 * (slot + 1));
    });
    scene.add.image(COUNTER_CARD.x, COUNTER_CARD.y + COUNTER_CARD.h, 'flowers', 'card').setOrigin(0, 1).setDepth(96.5);
    this.zone(COUNTER_CARD.x, COUNTER_CARD.y, COUNTER_CARD.w, COUNTER_CARD.h, 'flowers', 96.6);
  }

  private zone(x: number, y: number, w: number, h: number, target: 'flowers' | `flowercard-${number}`, depth: number) {
    return this.scene.add.zone(x, y, w, h).setOrigin(0).setDepth(depth).setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.hooks.activate(target))
      .on('pointerover', () => this.hooks.hover(target))
      .on('pointerout', () => this.hooks.hover(null));
  }

  /** What is in each vase today. */
  setStand(vases: Vase[], day: string) {
    vases.forEach((v, slot) => this.vases[slot]?.setFrame(vaseFrame(v, day)));
  }

  /** Pin the shop's finished flower cards on the wall, newest first, as many as fit. */
  setCards(titles: string[]) {
    for (const c of this.wall) {
      c.img.destroy();
      c.zone.destroy();
    }
    this.titles = titles.slice(0, WALL_MAX);
    this.wall = this.titles.map((_, i) => {
      const at = cardSpot(i);
      return {
        img: this.scene.add.image(at.x, at.y, 'flowers', `wallcard-${i % 4}`).setOrigin(0).setDepth(0.6),
        zone: this.zone(at.x, at.y, CARD_WALL.w - 1, CARD_WALL.h - 1, `flowercard-${i}`, 0.65),
      };
    });
  }

  /** The keyboard's and the labels' places: the card on the counter, then each card on the wall. */
  targets(): { id: 'flowers' | `flowercard-${number}`; x: number; y: number; w: number; h: number }[] {
    return [{ id: 'flowers' as const, ...COUNTER_CARD }, ...this.titles.map((_, i) => ({ id: `flowercard-${i}` as const, ...cardSpot(i), w: CARD_WALL.w - 1, h: CARD_WALL.h - 1 }))];
  }

  /** What the stand shows, for the scenarios. */
  look(): { vases: string[]; cards: number } {
    return { vases: this.vases.map((v) => String(v.frame.name)), cards: this.wall.length };
  }
}
