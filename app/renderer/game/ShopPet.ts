import Phaser from 'phaser';
import shopDogUrl from '../../../assets/sprites/shop-dog.png';
import pigeonUrl from '../../../assets/sprites/pigeon.png';
import fishbowlUrl from '../../../assets/sprites/fishbowl.png';
import type { Period } from './daytime';
import { BUN_MAT, PET_FPS, PET_FRAMES, PET_SHEETS, PET_SPOTS, STAMP_FLY_MS, STAMP_SIT_MS, petAt, stampNext, type PetId } from './shoppets';
import type { Sky } from './weather';

const URLS: Record<PetId, string> = { bun: shopDogUrl, stamp: pigeonUrl, cinnabar: fishbowlUrl };
/** Bun on the floor sorts among the people by its feet; Stamp and the bowl are up on the wall with the windows. */
const WALL_DEPTH = 1.5;

/** Load a pet's sheet into a room that has one. */
export function preloadPet(load: Phaser.Loader.LoaderPlugin, pet: PetId) {
  const s = PET_SHEETS[pet];
  load.spritesheet(s.key, URLS[pet], { frameWidth: s.w, frameHeight: s.h });
}

/**
 * One of the street shops' animals (plan-1.9.md I3), acted out from game/shoppets.ts: Bun by the counter or asleep on
 * the mat, Stamp between the sill and the letter rack, Cinnabar going round the bowl. A click (or Enter) gets a bark,
 * a flight or a dash, never a word.
 */
export class ShopPet {
  readonly sprite: Phaser.GameObjects.Sprite;
  private spot: string;
  private sky: Sky = 'clear';
  private period: Period = 'day';
  /** Barking, looking up or in the air: what it does next waits. */
  private busy = false;
  private flight?: Phaser.Time.TimerEvent;

  constructor(private scene: Phaser.Scene, readonly pet: PetId, private reduced: () => boolean, onClick: () => void) {
    const s = PET_SHEETS[pet];
    for (const [name, frames] of Object.entries(PET_FRAMES[pet])) {
      const key = this.key(name);
      if (!scene.anims.exists(key)) {
        scene.anims.create({ key, frames: scene.anims.generateFrameNumbers(s.key, { frames: [...frames] }), frameRate: PET_FPS[name as keyof typeof PET_FPS], repeat: -1 });
      }
    }
    if (pet === 'bun') {
      scene.add.rectangle(BUN_MAT.x, BUN_MAT.y, BUN_MAT.w, BUN_MAT.h, 0x9c4a3c).setOrigin(0).setDepth(1.2).setStrokeStyle(1, 0x6e2f28);
    }
    const start = petAt(pet, 'day', 'clear');
    this.spot = start.spot;
    const at = this.place(start.spot);
    this.sprite = scene.add.sprite(at.x, at.y, s.key, 0).setOrigin(0.5, 1);
    this.sprite.setInteractive({ useHandCursor: true, pixelPerfect: true }).on('pointerdown', onClick);
    this.settle();
  }

  private key(anim: string) {
    return `pet-${this.pet}-${anim}`;
  }

  private place(spot: string): { x: number; y: number } {
    return (PET_SPOTS[this.pet] as Record<string, { x: number; y: number }>)[spot];
  }

  /** The hour or the weather changed: where it should be now, at once. */
  setOutdoors(sky: Sky, period: Period) {
    this.sky = sky;
    this.period = period;
    if (this.busy) return;
    const now = petAt(this.pet, period, sky);
    // Stamp may be up on the rack on a dry day; wet or dark, back to the sill.
    if (this.pet !== 'stamp' || stampNext('rack', period, sky) === 'sill' && this.spot !== 'sill') this.spot = now.spot;
    this.settle();
  }

  /** Stand (or lie, or swim) at its spot, playing what fits the moment. */
  private settle() {
    const at = this.place(this.spot);
    this.sprite.setPosition(at.x, at.y).setDepth(this.pet === 'bun' ? at.y : WALL_DEPTH);
    if (this.pet === 'bun') this.sprite.play(this.key('lie'), true);
    if (this.pet === 'cinnabar') this.sprite.play(this.key('swim'), true);
    if (this.pet === 'stamp') {
      this.sprite.play(this.key(this.spot === 'sill' ? 'sitLeft' : 'sitRight'), true);
      // Asleep on the sill at night: still.
      if (this.period === 'night') this.sprite.anims.pause();
      else this.sprite.anims.resume();
      this.planFlight();
    }
  }

  /** Stamp sits a while, then flies to the other perch, as long as it is dry and light. */
  private planFlight() {
    this.flight?.remove();
    if (stampNext(this.spot as 'sill' | 'rack', this.period, this.sky) === this.spot) return;
    const [lo, hi] = STAMP_SIT_MS;
    this.flight = this.scene.time.delayedCall(lo + Math.random() * (hi - lo), () => this.fly());
  }

  /** Over to the other perch, in an arc. */
  private fly() {
    const to = stampNext(this.spot as 'sill' | 'rack', this.period, this.sky);
    if (to === this.spot || this.busy) return this.planFlight();
    const from = this.place(this.spot);
    const end = this.place(to);
    this.spot = to;
    if (this.reduced()) return this.settle();
    this.busy = true;
    this.sprite.anims.resume();
    this.sprite.play(this.key(end.x < from.x ? 'flyLeft' : 'flyRight'), true);
    const tween = { t: 0 };
    this.scene.tweens.add({
      targets: tween, t: 1, duration: STAMP_FLY_MS, ease: 'Sine.easeInOut',
      onUpdate: () => this.sprite.setPosition(from.x + (end.x - from.x) * tween.t, from.y + (end.y - from.y) * tween.t - Math.sin(tween.t * Math.PI) * 12),
      onComplete: () => { this.busy = false; this.settle(); },
    });
  }

  /** Someone came in at the door: Bun lifts its head for a moment. */
  noticeDoor() {
    if (this.pet !== 'bun' || this.busy || this.period === 'night') return;
    this.for(1400, 'look');
  }

  /** Play one animation for a while, then back to the usual. */
  private for(ms: number, anim: string) {
    this.busy = true;
    this.sprite.play(this.key(anim), true);
    this.scene.time.delayedCall(ms, () => { this.busy = false; this.settle(); });
  }

  /** Clicked: Bun barks (or, asleep, looks up), Stamp takes off or flutters, Cinnabar darts round the bowl. */
  poke() {
    if (this.busy) return;
    if (this.pet === 'bun') return this.for(1200, this.period === 'night' ? 'look' : 'bark');
    if (this.pet === 'cinnabar') {
      this.sprite.anims.timeScale = 3;
      this.busy = true;
      this.scene.time.delayedCall(1200, () => { this.sprite.anims.timeScale = 1; this.busy = false; });
      return;
    }
    if (stampNext(this.spot as 'sill' | 'rack', this.period, this.sky) !== this.spot) return this.fly();
    // Wet or dark: a flutter where it sits.
    this.busy = true;
    this.sprite.anims.resume();
    this.sprite.play(this.key(this.spot === 'sill' ? 'flyLeft' : 'flyRight'), true);
    const y = this.sprite.y;
    const back = () => { this.busy = false; this.settle(); };
    if (this.reduced()) return void this.scene.time.delayedCall(600, back);
    this.scene.tweens.add({ targets: this.sprite, y: y - 5, duration: 260, yoyo: true, onComplete: back });
  }

  /** Where to click, for the keyboard hotspots. */
  bounds() {
    const b = this.sprite.getBounds();
    return { x: b.x, y: b.y, w: b.width, h: b.height };
  }

  /** What it is doing, for the acceptance scenarios. */
  state() {
    return { pet: this.pet, spot: this.spot, anim: this.sprite.anims.currentAnim?.key ?? '', playing: this.sprite.anims.isPlaying, x: this.sprite.x, y: this.sprite.y, busy: this.busy, fast: this.sprite.anims.timeScale > 1 };
  }
}
