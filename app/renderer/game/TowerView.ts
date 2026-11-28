import Phaser from 'phaser';
import towerUrl from '../../../assets/sprites/tower.png';
import tower from '../../../assets/sprites/tower.json';
import { handAngles, handsMove, type TowerStage } from '../../shared/tower';
import type { Period } from './daytime';
import { RIVER } from './town';

/** The tower's frames (scripts/art/tower.py): one per look, then the lights after dark; and where its clock face is. */
const SHEET = tower as { w: number; h: number; stages: string[]; face: { x: number; y: number; r: number } };
/** How long the hands are, in pixels from the face's middle, and their colour, the iron of the hub. */
const HANDS = { hour: 6, minute: 9, colour: 0x34323a };

export function preloadTower(load: Phaser.Loader.LoaderPlugin) {
  load.spritesheet('tower', towerUrl, { frameWidth: SHEET.w, frameHeight: SHEET.h });
}

/** Where a hand ends, `length` pixels out from the face's middle at `degrees` clockwise from twelve. */
function handEnd(degrees: number, length: number) {
  const a = (degrees * Math.PI) / 180;
  return { x: Math.sin(a) * length, y: -Math.cos(a) * length };
}

/**
 * The old clock tower on the river street (plan-2.0.md J6), in the look the year's story has mended it to. Once its
 * hands are on they keep the shop's time, drawn fresh each minute; once lit, its bulbs shine over the shop's light
 * after dark.
 */
export class TowerView {
  private readonly image: Phaser.GameObjects.Image;
  private readonly lights: Phaser.GameObjects.Image;
  private readonly hands: Phaser.GameObjects.Graphics;
  private stage: TowerStage = 'stopped';
  private drawnAt = '';
  /** Where the hands point now, for the scenarios; none until they are on. */
  pointing: { hour: number; minute: number } | null = null;

  constructor(scene: Phaser.Scene, depth: { tower: number; glow: number }) {
    const { x, y } = RIVER.tower;
    this.image = scene.add.image(x, y, 'tower', 0).setOrigin(0).setDepth(depth.tower);
    this.lights = scene.add.image(x, y, 'tower', SHEET.stages.indexOf('lights')).setOrigin(0).setDepth(depth.glow).setVisible(false);
    this.hands = scene.add.graphics().setPosition(x + SHEET.face.x + 1, y + SHEET.face.y + 1).setDepth(depth.tower + 0.01);
  }

  /** Show the tower in `stage`, its lights on if it is lit and dark out. */
  set(stage: TowerStage, period: Period) {
    this.stage = stage;
    this.image.setFrame(SHEET.stages.indexOf(stage));
    this.lights.setVisible(stage === 'lit' && (period === 'dusk' || period === 'night'));
    this.drawnAt = '';
  }

  /** Move the hands to `now`, if they are on and the minute has changed. */
  update(now: Date) {
    if (!handsMove(this.stage)) {
      if (this.pointing) this.hands.clear();
      this.pointing = null;
      return;
    }
    const at = `${now.getHours()}:${now.getMinutes()}`;
    if (at === this.drawnAt) return;
    this.drawnAt = at;
    this.pointing = handAngles(now);
    const hour = handEnd(this.pointing.hour, HANDS.hour);
    const minute = handEnd(this.pointing.minute, HANDS.minute);
    this.hands.clear().lineStyle(1, HANDS.colour).lineBetween(0, 0, minute.x, minute.y).lineStyle(2, HANDS.colour).lineBetween(0, 0, hour.x, hour.y);
  }

  /** What the tower shows now, for the scenarios. */
  look() {
    return { stage: this.stage, lights: this.lights.visible, hands: this.pointing };
  }
}
