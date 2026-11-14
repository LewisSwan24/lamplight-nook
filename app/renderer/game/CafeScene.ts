import { DEFAULT_FURNISHING, FURNISH_CHOICES, FURNISH_PARTS, type FurnishPart, type Furnishing } from '../../shared/furnish';
import Phaser from 'phaser';
import adengUrl from '../../../assets/sprites/adeng.png';
import cafeUrl from '../../../assets/sprites/cafe-room.png';
import cafePiecesUrl from '../../../assets/sprites/cafe-pieces.png';
import studyUrl from '../../../assets/sprites/study-room.png';
import studyPiecesUrl from '../../../assets/sprites/study-pieces.png';
import gardenUrl from '../../../assets/sprites/garden.png';
import gardenCropsUrl from '../../../assets/sprites/garden-crops.png';
import dogUrl from '../../../assets/sprites/dog.png';
import dogSleepUrl from '../../../assets/sprites/dog-sleep.png';
import hensUrl from '../../../assets/sprites/hens.png';
import bakerUrl from '../../../assets/sprites/baker.png';
import postmanUrl from '../../../assets/sprites/postman.png';
import mechanicUrl from '../../../assets/sprites/mechanic.png';
import grannyUrl from '../../../assets/sprites/granny.png';
import studentUrl from '../../../assets/sprites/student.png';
import catUrl from '../../../assets/sprites/cat.png';
import clockUrl from '../../../assets/sprites/clock.png';
import cupUrl from '../../../assets/sprites/cup.png';
import doorUrl from '../../../assets/sprites/door.png';
import backDoorUrl from '../../../assets/sprites/back-door.png';
import laoshiUrl from '../../../assets/sprites/laoshi.png';
import qingdaiUrl from '../../../assets/sprites/qingdai.png';
import streetUrl from '../../../assets/sprites/street.png';
import christmasUrl from '../../../assets/sprites/decor-christmas.png';
import halloweenUrl from '../../../assets/sprites/decor-halloween.png';
import newYearUrl from '../../../assets/sprites/decor-new_year.png';
import leavesUrl from '../../../assets/sprites/weather-leaves.png';
import petalsUrl from '../../../assets/sprites/weather-petals.png';
import rainUrl from '../../../assets/sprites/weather-rain.png';
import snowUrl from '../../../assets/sprites/weather-snow.png';
import xiaojuUrl from '../../../assets/sprites/xiaoju.png';
import you1Url from '../../../assets/sprites/you-1.png';
import you2Url from '../../../assets/sprites/you-2.png';
import you3Url from '../../../assets/sprites/you-3.png';
import you4Url from '../../../assets/sprites/you-4.png';
import you5Url from '../../../assets/sprites/you-5.png';
import you6Url from '../../../assets/sprites/you-6.png';
import you7Url from '../../../assets/sprites/you-7.png';
import you8Url from '../../../assets/sprites/you-8.png';
import { AVATAR_COUNT, DEFAULT_AVATAR, avatarKey } from '../../shared/avatars';
import { fill, strings } from '../../shared/i18n';
import type { ActorId, AnchorId, Bubble, GuestId, Speaker } from '../../shared/types';
import { currentScene } from '../../shared/scenes';
import catWalkUrl from '../../../assets/sprites/cat-walk.png';
import { COUNTER_TOP, PIECES } from './pieces';
import { type PropId, PROPS, propFrame, propOffset } from './props';
import { type ObjectBox, type ObjectId, objectBoxes } from './objects';
import type { GrowthId } from '../../shared/growth';
import { walkBetween } from './layout';
import { ACTORS, ZONES, pathBetween, standPoint, type Facing } from './layout';
import { LOOKS, type Look, type Period, msToNextHour, periodAt } from './daytime';
import { WALK_SPEED, glanceFacing, idleDelay, napDelay } from './life';
import { GardenView } from './GardenView';
import { StreetView } from './StreetView';
import { HOLIDAYS, SKIES, WeatherLayer } from './WeatherLayer';
import { SHELF, ShopGrowth, preloadGrowth } from './ShopGrowth';
import { INSET, VIEW } from './street';
import { BACK_DOOR, BACK_DOOR_SPOT, GARDEN_DOOR, GARDEN_X, type GardenSpot, type SpotId, pathToBackDoor } from './garden';
import { DOG_FRAME, HEN_FRAME } from './animals';
import { GUEST_DOOR, GUEST_IDS, GUEST_SPEED, GUEST_SPOT } from './guests';
import { PASSER_FEET, WINDOW_PANES, passBy } from './passers';
import { type Holiday, type Sky, holidayOn, skyOn, withWeather } from './weather';
import { HAND_OVER_MS, PICK_UP_MS, YOU_COUNTER, YOU_DOOR, YOU_SEAT, YOU_SPEED } from './you';
import { CAT_FRAME, CAT_WALK_FRAME, DIRECTIONS, STAFF_ANIMS, STAFF_FRAME, STAFF_IDS, animKey, facingTowards, staffFrames } from './sprites';

const DECOR_URLS: Record<Holiday, string> = { halloween: halloweenUrl, christmas: christmasUrl, new_year: newYearUrl };
const WEATHER_URLS: Record<(typeof SKIES)[number], string> = { rain: rainUrl, snow: snowUrl, leaves: leavesUrl, petals: petalsUrl };
const SHEETS: Record<ActorId | GuestId, string> = { adeng: adengUrl, xiaoju: xiaojuUrl, laoshi: laoshiUrl, qingdai: qingdaiUrl, cat: catUrl, baker: bakerUrl, postman: postmanUrl, mechanic: mechanicUrl, granny: grannyUrl, student: studentUrl };
/** The player's looks, in order (shared/avatars.ts). */
const YOU_SHEETS = [you1Url, you2Url, you3Url, you4Url, you5Url, you6Url, you7Url, you8Url];
/** Pause at each corner of a walk, so a turn reads as a turn. */
const CORNER_PAUSE_MS = 90;
/** Top-left of the door sprite; the doorway behind it is painted into cafe.png (scripts/art/scene.py, DOOR). */
const DOOR_POS = { x: 288, y: 16 };
const DOOR_MS = 260;
/** Over the sky in the glass (0.5), under the weather falling past it (0.6). */
const PASSER_DEPTH = 0.55;
/** A dark shape against the daylight; after dark, lit by the street lamps. */
const PASSER_COLOR: Record<Period, number> = { dawn: 0x2c2a35, day: 0x2c2a35, dusk: 0x2c2a35, night: 0xa89c86 };
/** The window panes in cafe.png (scripts/art/scene.py) and the colours of their glass, which takes the sky's colour. */
const GLASS = new Set(['216,208,224', '235,228,242', '248,248,248']);
/** How long the room takes to change its light when the hour turns a new period. */
const DAYLIGHT_MS = 4000;
/** Weather in the garden falls over the lawn, under the garden's light and shade. */
const GARDEN_WEATHER_DEPTH = 0.6;
const VIEW_FADE_MS = 180;
const SCENE = currentScene();
/** Furnishing overlays for every scene (scripts/art/furnish.py); only this scene's are loaded. */
const FURNISH_URLS = import.meta.glob<string>('../../../assets/sprites/furnish-*.png', { eager: true, query: '?url', import: 'default' });
const furnishUrl = (part: FurnishPart, choice: string) => FURNISH_URLS[`../../../assets/sprites/furnish-${SCENE}-${part}-${choice}.png`];
/** Over the room, under the window glass and everything in it. */
const FURNISH_DEPTH = 0.2;
/** The steaming cup: beside the coffee machine on the counter, or between the form and the lamp on the desk. */
const CUP_POS = SCENE === 'study' ? { x: 232, y: 62 } : { x: 256, y: 64 };
/** Where the blank commission form lies on the counter (top-left corner, canvas pixels). */
const FLOOR_LAMP = 0.2;
const FORM_POS = { x: 224, y: 78 };
/** The meeting bell at the left end of the counter (top-left corner, canvas pixels); shown while a commission runs. */
const BELL_POS = { x: 216, y: 78 };
/** A brass service bell, 7x6: k knob, g brass, h highlight, s shade, b wooden base. */
const BELL = ['...k...', '..ggg..', '.ghggg.', '.ghggs.', 'gggggss', 'bbbbbbb'];
const BELL_COLORS: Record<string, number> = { k: 0x8a5a1c, g: 0xe2b04a, h: 0xfff0b0, s: 0xb07d2a, b: 0x5a3b28 };
/** `backdoor` looks out at the garden; `shopdoor` (the same door, from the garden) comes back in; `dog` and `hens` live out there. */
export type HintSpot = 'counter' | 'bell' | 'board';
export type Target = ActorId | ObjectId | 'counter' | 'bell' | 'backdoor' | 'shopdoor' | 'dog' | 'hens' | 'beds' | 'works' | 'guest' | 'you';

type Guest = { id: GuestId; sprite: Phaser.GameObjects.Sprite; shadow: Phaser.GameObjects.Ellipse; tween?: Phaser.Tweens.Tween; speech?: string; hovered?: boolean };

/** The player, in the shop while their commission is made (game/you.ts). `trip` is bumped to call a walk off. */
type You = { sprite: Phaser.GameObjects.Sprite; shadow: Phaser.GameObjects.Ellipse; tween?: Phaser.Tweens.Tween; seated: boolean; hovered?: boolean; trip: number; arriving?: Promise<void>; leaving?: Promise<void> };

type Actor = {
  id: ActorId;
  sprite: Phaser.GameObjects.Sprite;
  shadow: Phaser.GameObjects.Ellipse;
  facing: Facing;
  /** The anchor the character is at (or walking to). */
  at: AnchorId;
  /** The animation the character should hold when not walking. */
  pose: string;
  prop?: Phaser.GameObjects.Image;
  propId?: PropId;
  height: number;
  tween?: Phaser.Tweens.TweenChain;
  /** Pending idle-life timer: a glance around, or the cat's nap. */
  idle?: Phaser.Time.TimerEvent;
  /** Gone out through the door (a subagent off on an errand); hidden until it walks somewhere again. */
  outside?: boolean;
  /** Out in the back garden; comes back in through the back door when it walks somewhere. */
  inGarden?: boolean;
  /** Counts walks, so a trip to the garden knows when a newer walk has taken over. */
  trip: number;
};

/**
 * Text label positions in canvas coordinates. Text is drawn by an HTML overlay:
 * the canvas is 320x180 scaled up, so CJK text drawn on it would be blurry.
 */
export type LabelPos = { key: string; text: string; x: number; y: number; kind: 'zone' | 'actor' | 'bubble'; icon?: Bubble };

/** The cafe: a pixel-art background with the three staff and the shop cat as animated sprites. */
export class CafeScene extends Phaser.Scene {
  private actors = new Map<ActorId, Actor>();
  /** What each character is currently saying, and its mood bubble (either may be empty). */
  private speech = new Map<ActorId, { text: string; icon?: Bubble }>();
  /** A neighbour in the shop (at most one), what they are saying, and whether the pointer is over them. */
  private guest?: Guest;
  /** A neighbour has really come in. */
  onGuestIn?: (id: GuestId) => void;
  /** A neighbour on the street, on the way to the door. */
  private guestComing = false;
  /** Bumped to send a guest on their way (a commission came in). */
  private guestTrip = 0;
  /** The player, while in the shop; their look and the name they go by. */
  private you?: You;
  private youLook = DEFAULT_AVATAR;
  youName = '';
  /** What the pointer is over: its name is shown only then, so the scene stays free of text. */
  private hovered: Target | null = null;
  private objects = objectBoxes(SCENE);
  private growthZones = new Map<string, Phaser.GameObjects.Zone>();
  private pieceImages = new Map<string, Phaser.GameObjects.Image>();
  private cup!: Phaser.GameObjects.Sprite;
  private floorLamp!: { img: Phaser.GameObjects.Image; base: number; sun: boolean };
  /** How strong the lamps are at this time of day. */
  private lampLevel = 1;
  onObjectClick: (id: ObjectId) => void = () => {};
  onYouClick: () => void = () => {};
  private bell!: Phaser.GameObjects.Graphics;
  private bellZone!: Phaser.GameObjects.Zone;
  private glow?: { sprite: Phaser.GameObjects.Sprite; fx: Phaser.FX.Glow };
  /** Settings or the system asked for less motion: no hops, no pulsing, light changes at once. */
  reducedMotion = false;
  private door!: Phaser.GameObjects.Sprite;
  /** The blank commission form on the counter; it glows softly while it waits to be filled in. */
  private form!: Phaser.GameObjects.Graphics;
  private hintMarks = new Map<HintSpot, Phaser.GameObjects.Graphics>();
  private formGlow?: Phaser.Tweens.Tween;
  /** Time-of-day layers: a tint over the room, the sky in the window glass, and the lamp glows with their base strength. */
  private shade!: Phaser.GameObjects.Rectangle;
  private sky!: Phaser.GameObjects.Image;
  private glows: { img: Phaser.GameObjects.Image; base: number; sun: boolean }[] = [];
  period: Period = 'day';
  /** The colour currently laid over the room, which the street inset takes too. */
  private tintColor = 0xffffff;
  /** The street outside, shown in an inset while someone is out on an errand. */
  private street!: StreetView;
  /** The back garden, beside the shop in this scene; the camera slides over to look at it. */
  garden!: GardenView;
  private backDoor!: Phaser.GameObjects.Sprite;
  private glassMask!: Phaser.Display.Masks.BitmapMask;
  /** What the window shows: the shop, or the garden through the back door. */
  view: 'shop' | 'garden' = 'shop';
  /** Called when the view changes (the page hides the blackboard's chalk in the garden). */
  onView?: (view: 'shop' | 'garden') => void;
  /** Rain or snow past the windows and in the street, holiday decorations in the room; they follow the calendar. */
  private weather!: WeatherLayer;
  /** Called when a character or the counter is clicked. */
  onActorClick: (actor: ActorId) => void = () => {};
  onCounterClick: () => void = () => {};
  /** The meeting bell on the counter was rung. */
  onBellClick: () => void = () => {};
  /** The works shelf on the wall was clicked. */
  onWorksClick: () => void = () => {};
  /** The blackboard was clicked while it holds a plan: show the whole list. */
  onBoardClick: () => void = () => {};
  /** Whether the blackboard has something chalked on it (the page knows). */
  boardInUse: () => boolean = () => false;
  /** What the shop has gathered, and the works shelf. */
  growth!: ShopGrowth;
  /** Sounds the room makes: the door bell, Laoshi's mallet, Adeng's pencil. */
  onSound?: (name: 'door' | 'mallet' | 'pencil') => void;
  /** The street inset opened or closed (the page moves what sits in that corner). */
  onStreet?: (open: boolean) => void;
  /** Every line said out loud, for the caption log. */
  onSay?: (who: Speaker, text: string) => void;

  private furnishing: Furnishing = DEFAULT_FURNISHING;
  private furnishLayers = new Map<FurnishPart, Phaser.GameObjects.Image>();

  constructor() {
    super('cafe');
  }

  preload() {
    // The room itself: the cafe or the study; both share the floor plan in layout.ts.
    this.load.image('cafe', SCENE === 'study' ? studyUrl : cafeUrl);
    this.load.image('pieces', SCENE === 'study' ? studyPiecesUrl : cafePiecesUrl);
    this.load.image('street', streetUrl);
    this.load.image('garden', gardenUrl);
    this.load.spritesheet('garden-crops', gardenCropsUrl, { frameWidth: 16, frameHeight: 16 });
    this.load.spritesheet('dog', dogUrl, { frameWidth: DOG_FRAME.width, frameHeight: DOG_FRAME.height });
    this.load.spritesheet('dog-sleep', dogSleepUrl, { frameWidth: 32, frameHeight: 48 });
    this.load.spritesheet('hens', hensUrl, { frameWidth: HEN_FRAME.width, frameHeight: HEN_FRAME.height });
    for (const h of HOLIDAYS) this.load.image(`decor-${h}`, DECOR_URLS[h]);
    for (const s of SKIES) this.load.image(`weather-${s}`, WEATHER_URLS[s]);
    for (const id of [...STAFF_IDS, ...GUEST_IDS]) this.load.spritesheet(id, SHEETS[id], { frameWidth: STAFF_FRAME.width, frameHeight: STAFF_FRAME.height });
    YOU_SHEETS.slice(0, AVATAR_COUNT).forEach((url, i) => this.load.spritesheet(avatarKey(i + 1), url, { frameWidth: STAFF_FRAME.width, frameHeight: STAFF_FRAME.height }));
    this.load.spritesheet('cat', SHEETS.cat, { frameWidth: CAT_FRAME.width, frameHeight: CAT_FRAME.height });
    this.load.spritesheet('cat-walk', catWalkUrl, { frameWidth: CAT_WALK_FRAME.width, frameHeight: CAT_WALK_FRAME.height });
    this.load.spritesheet('clock', clockUrl, { frameWidth: 16, frameHeight: 32 });
    this.load.spritesheet('cup', cupUrl, { frameWidth: 16, frameHeight: 32 });
    this.load.spritesheet('door', doorUrl, { frameWidth: 16, frameHeight: 32 });
    this.load.spritesheet('back-door', backDoorUrl, { frameWidth: BACK_DOOR.w, frameHeight: BACK_DOOR.h });
    preloadGrowth(this.load);
    for (const part of FURNISH_PARTS) {
      for (const choice of FURNISH_CHOICES[part]) {
        const url = furnishUrl(part, choice);
        if (url) this.load.image(`furnish-${part}-${choice}`, url);
      }
    }
  }

  /** Recolour the wall, the curtains and the rug; `default` shows the room as drawn. Safe before create(). */
  setFurnishing(f: Furnishing) {
    this.furnishing = f;
    if (!this.furnishLayers.size) return;
    for (const part of FURNISH_PARTS) {
      const layer = this.furnishLayers.get(part)!;
      const key = `furnish-${part}-${f[part]}`;
      const on = f[part] !== 'default' && this.textures.exists(key);
      if (on) layer.setTexture(key);
      layer.setVisible(on);
    }
  }

  create() {
    this.add.image(0, 0, 'cafe').setOrigin(0);
    const sheet = this.textures.get('pieces');
    for (const p of PIECES) {
      sheet.add(p.name, 0, 0, p.sy, p.w, p.h);
      this.pieceImages.set(p.name, this.add.image(p.x, p.y, 'pieces', p.name).setOrigin(0).setDepth(p.base));
    }
    for (const part of FURNISH_PARTS) this.furnishLayers.set(part, this.add.image(0, 0, 'cafe').setOrigin(0).setDepth(FURNISH_DEPTH).setVisible(false));
    this.setFurnishing(this.furnishing);
    this.createAnims();
    this.addProps();
    this.growth = new ShopGrowth(this, () => {});
    this.growth.onShelfClick = () => this.activate('works');
    this.addObjects();
    const slate = ZONES.find((z) => z.id === 'board')!;
    this.add
      .zone(slate.x, slate.y, slate.w, slate.h)
      .setOrigin(0)
      .setInteractive({ useHandCursor: true })
      .on('pointerover', () => this.highlight('board'))
      .on('pointerout', () => this.hovered === 'board' && this.highlight(null))
      .on('pointerdown', () => this.activate('board'));
    const counter = ZONES.find((z) => z.id === 'counter')!;
    this.add
      .zone(counter.x, counter.y, counter.w, counter.h)
      .setOrigin(0)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.onCounterClick())
      .on('pointerover', () => this.highlight('counter'))
      .on('pointerout', () => this.hovered === 'counter' && this.highlight(null));
    for (const a of ACTORS) {
      const spot = standPoint(a.home, a.id);
      const isCat = a.id === 'cat';
      const shadow = this.add.ellipse(spot.x, spot.y, isCat ? 20 : 11, 4, 0x3b2a1e, 0.28);
      const sprite = this.add.sprite(spot.x, spot.y, a.id).setOrigin(0.5, 1).setDepth(spot.y);
      const actor: Actor = { id: a.id, sprite, shadow, facing: spot.facing, at: a.home, pose: isCat ? 'lie' : 'idle', height: a.height, trip: 0 };
      sprite
        .setInteractive({ useHandCursor: true, pixelPerfect: true })
        .on('pointerdown', () => this.activate(a.id))
        .on('pointerover', () => this.highlight(a.id))
        .on('pointerout', () => this.hovered === a.id && this.highlight(null));
      // One-off actions (picking up, handing over, lifting) end in the standing pose instead of freezing.
      sprite.on(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
        if (isCat || actor.tween?.isPlaying()) return;
        actor.pose = 'idle';
        this.hold(actor);
      });
      this.actors.set(a.id, actor);
      this.hold(actor);
      this.scheduleIdle(actor);
    }
    this.addLight();
    this.street = new StreetView(this);
    this.street.onClick = (id) => this.onActorClick(id);
    this.garden = new GardenView(this);
    this.garden.onDoorClick = () => this.activate('shopdoor');
    this.garden.onActorClick = (id) => this.onActorClick(id);
    this.garden.onAnimalClick = (what) => this.activate(what);
    this.street.onOpen = (open) => {
      this.weather?.setOutdoorsVisible(open);
      this.onStreet?.(open);
    };
    this.addDaylight();
  }

  update() {
    if (this.you) this.you.shadow.setPosition(this.you.sprite.x, this.you.sprite.y - 1).setDepth(this.you.sprite.depth - 0.5).setAlpha(0.28 * this.you.sprite.alpha);
    if (this.guest) this.guest.shadow.setPosition(this.guest.sprite.x, this.guest.sprite.y - 1).setDepth(this.guest.sprite.depth - 0.5).setAlpha(0.28 * this.guest.sprite.alpha);
    this.street.update();
    this.garden.update();
    // Shadows follow their characters; the cat's sits under its body, which is drawn left of centre.
    for (const a of this.actors.values()) {
      if (a.prop && a.propId) {
        const now = this.reducedMotion ? 0 : this.time.now;
        const { x, y } = propOffset(a.propId, a.facing, a.pose, now);
        // A page lies on the table, so above it; anything else is in the hand, behind the body when walking away.
        const depth = a.sprite.depth + (a.pose === 'sit' ? 40 : a.facing === 'up' ? -0.1 : 0.1);
        a.prop.setTexture(`prop-${a.propId}-${propFrame(a.propId, now)}`).setFlipX(a.facing === 'left')
          .setPosition(a.sprite.x + x, a.sprite.y + y).setDepth(depth).setVisible(a.sprite.visible && !a.outside && !a.inGarden);
      }
      a.shadow.setPosition(a.sprite.x + (a.id === 'cat' && a.sprite.anims.getName() !== 'cat-walk' ? 3 : 0), a.sprite.y - 1).setDepth(a.sprite.depth - 0.5).setAlpha(0.28 * a.sprite.alpha);
    }
  }

  private createAnims() {
    const looks = Array.from({ length: AVATAR_COUNT }, (_, i) => avatarKey(i + 1));
    for (const id of [...STAFF_IDS, ...GUEST_IDS, ...looks]) {
      for (const [name, def] of Object.entries(STAFF_ANIMS)) {
        // The player's sheets stop after the hand-over row (scripts/art/characters.py, PLAYER_ROWS).
        if (id.startsWith('you-') && def.row > STAFF_ANIMS.gift.row) continue;
        const dirs = def.dirs === 'front' ? [DIRECTIONS[3]] : def.dirs;
        for (const facing of dirs) {
          this.anims.create({
            key: animKey(id, name, facing),
            frames: this.anims.generateFrameNumbers(id, { frames: staffFrames(name, facing) }),
            frameRate: def.fps,
            repeat: def.repeat,
          });
        }
      }
    }
    this.anims.create({ key: 'cat-walk', frames: this.anims.generateFrameNumbers('cat-walk', {}), frameRate: 10, repeat: -1 });
    this.anims.create({ key: 'cat-lie', frames: this.anims.generateFrameNumbers('cat', {}), frameRate: 8, repeat: -1 });
    this.anims.create({ key: 'clock', frames: this.anims.generateFrameNumbers('clock', {}), frameRate: 4, repeat: -1, yoyo: true });
    this.anims.create({ key: 'cup', frames: this.anims.generateFrameNumbers('cup', {}), frameRate: 5, repeat: -1 });
    this.anims.create({ key: 'door-open', frames: this.anims.generateFrameNumbers('door', { start: 0, end: 4 }), duration: DOOR_MS });
    this.anims.create({ key: 'door-close', frames: this.anims.generateFrameNumbers('door', { start: 4, end: 0 }), duration: DOOR_MS });
    this.anims.create({ key: 'back-door-open', frames: this.anims.generateFrameNumbers('back-door', { start: 0, end: 3 }), duration: DOOR_MS });
    this.anims.create({ key: 'back-door-close', frames: this.anims.generateFrameNumbers('back-door', { start: 3, end: 0 }), duration: DOOR_MS });
  }

  /** Small animated things that make the room feel lived in. */
  /** A hit zone for everything fixed in the shop, under the people and over the counter. A growth piece's goes with it. */
  private addObjects() {
    for (const box of this.objects) {
      if (box.id === 'board') continue;
      const zone = this.add.zone(box.x, box.y, box.w, box.h).setOrigin(0).setDepth(box.id.startsWith('grow-') ? 0.6 : 0.5)
        .setInteractive({ useHandCursor: true })
        .on('pointerover', () => this.highlight(box.id))
        .on('pointerout', () => this.hovered === box.id && this.highlight(null))
        .on('pointerdown', () => this.activate(box.id));
      if (box.id.startsWith('grow-')) this.growthZones.set(box.id, zone);
    }
  }

  private shows(box: ObjectBox): boolean {
    return !box.id.startsWith('grow-') || this.growth.shows(box.id.slice(5) as GrowthId);
  }

  /** The floor lamp, on or off: only for the look of it. */
  toggleLamp() {
    const g = this.floorLamp;
    g.base = g.base ? 0 : FLOOR_LAMP;
    g.img.setAlpha(Math.min(1, g.base * this.lampLevel));
    return g.base > 0;
  }

  /** A little shake of a plant or the cup; nothing at all with reduced motion. */
  wiggle(id: ObjectId) {
    const target = id === 'cup' ? this.cup : this.pieceImages.get(id === 'plant2' ? 'plant_r' : 'plant_l');
    if (!target || this.reducedMotion) return;
    this.tweens.add({ targets: target, x: target.x + 1, duration: 70, yoyo: true, repeat: 3 });
  }

  /** Who is out on an errand. */
  get outOnErrand(): ActorId | null {
    return this.street.who as ActorId | null;
  }

  private addProps() {
    this.add.sprite(180, 14, 'clock').setOrigin(0).play('clock');
    this.cup = this.add.sprite(CUP_POS.x, CUP_POS.y, 'cup').setOrigin(0).setDepth(COUNTER_TOP).play('cup');
    this.door = this.add.sprite(DOOR_POS.x, DOOR_POS.y, 'door', 0).setOrigin(0).setDepth(1);
    // The back door: click it to look out at the garden.
    this.backDoor = this.add.sprite(BACK_DOOR.x, BACK_DOOR.y, 'back-door', 0).setOrigin(0).setDepth(1);
    this.add.zone(BACK_DOOR.x, BACK_DOOR.y, BACK_DOOR.w, BACK_DOOR.h).setOrigin(0)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.activate('backdoor'))
      .on('pointerover', () => this.highlight('backdoor'))
      .on('pointerout', () => this.hovered === 'backdoor' && this.highlight(null));
    // A sheet of paper with two pencilled lines, slightly askew on the counter top.
    this.form = this.add.graphics({ x: FORM_POS.x, y: FORM_POS.y }).setDepth(COUNTER_TOP + 0.1);
    this.form.fillStyle(0x7a5236, 0.35).fillRect(1, 1, 9, 7);
    this.form.fillStyle(0xfbf6ec, 1).fillRect(0, 0, 9, 7);
    this.form.fillStyle(0xc9b79f, 1).fillRect(2, 2, 5, 1).fillRect(2, 4, 4, 1);
    this.setFormWaiting(true);
    this.bell = this.add.graphics({ x: BELL_POS.x, y: BELL_POS.y }).setDepth(COUNTER_TOP + 0.1).setVisible(false);
    BELL.forEach((row, y) => [...row].forEach((c, x) => { if (BELL_COLORS[c]) this.bell.fillStyle(BELL_COLORS[c], 1).fillRect(x, y, 1, 1); }));
    // Over the counter's own zone, so a click on the bell rings it instead of opening the counter.
    this.bellZone = this.add.zone(BELL_POS.x - 1, BELL_POS.y - 2, 9, 9).setOrigin(0).setDepth(COUNTER_TOP + 0.2)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.activate('bell'))
      .on('pointerover', () => this.highlight('bell'))
      .on('pointerout', () => this.hovered === 'bell' && this.highlight(null));
    this.bellZone.disableInteractive();
  }

  /** The meeting bell is out on the counter only while a commission runs. */
  setBell(on: boolean) {
    this.bell.setVisible(on);
    if (on) this.bellZone.setInteractive({ useHandCursor: true });
    else this.bellZone.disableInteractive();
    if (!on && this.hovered === 'bell') this.highlight(null);
  }

  /** Ring the bell: a little wobble (the sound is played by whoever handles the click). */
  private ringBell() {
    if (this.reducedMotion) return;
    this.tweens.add({ targets: this.bell, y: BELL_POS.y - 1, duration: 70, yoyo: true, repeat: 1 });
  }

  /** The lamps dip twice, like the power just wavered (the connection dropped). Skipped with reduced motion. */
  flickerLamps() {
    if (this.reducedMotion) return;
    for (const g of this.glows) {
      if (g.sun) continue;
      const lit = g.img.alpha;
      this.tweens.add({ targets: g.img, alpha: lit * 0.15, duration: 90, yoyo: true, repeat: 1, repeatDelay: 140, onComplete: () => g.img.setAlpha(lit) });
    }
  }

  /** Where a character stands now, or null while out on an errand. */
  anchorOf(actorId: ActorId): AnchorId | null {
    const actor = this.actors.get(actorId);
    return !actor || actor.outside || actor.inGarden ? null : actor.at;
  }

  setReducedMotion(on: boolean) {
    this.reducedMotion = on;
    if (this.street) this.street.reducedMotion = on;
    this.weather?.setReducedMotion(on);
    if (this.form?.visible) this.setFormWaiting(true);
  }

  /** Where a small "!" is bobbing just now. */
  hints(): HintSpot[] {
    return [...this.hintMarks.keys()];
  }

  /** A small "!" bobbing over the form, the bell or the blackboard, for someone who hasn't found them yet. */
  setHint(spot: HintSpot, on: boolean) {
    this.hintMarks.get(spot)?.destroy();
    this.hintMarks.delete(spot);
    if (!on) return;
    const slate = ZONES.find((z) => z.id === 'board')!;
    const at = { counter: { x: FORM_POS.x - 7, y: FORM_POS.y - 11 }, bell: { x: BELL_POS.x + 1, y: BELL_POS.y - 11 }, board: { x: slate.x + slate.w - 3, y: slate.y - 6 } }[spot];
    // 5x9: a white tag with an ink "!" and a little tail pointing at the form.
    const TAG = ['wwwww', 'wwkww', 'wwkww', 'wwkww', 'wwwww', 'wwkww', 'wwwww', '.www.', '..w..'];
    const g = this.add.graphics(at).setDepth(COUNTER_TOP + 0.2);
    TAG.forEach((row, y) => [...row].forEach((c, x) => {
      if (c === 'w') g.fillStyle(0xfbf6ec, 1).fillRect(x, y, 1, 1);
      if (c === 'k') g.fillStyle(0xb5653b, 1).fillRect(x, y, 1, 1);
    }));
    if (!this.reducedMotion) this.tweens.add({ targets: g, y: g.y - 2, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.hintMarks.set(spot, g);
  }

  /** Show the blank form glowing on the counter (nothing running), or put it away (a commission is under way). */
  setFormWaiting(on: boolean) {
    this.formGlow?.stop();
    this.form.setVisible(on).setAlpha(1);
    if (on && this.reducedMotion) this.form.setAlpha(0.8);
    else if (on) this.formGlow = this.tweens.add({ targets: this.form, alpha: 0.55, duration: 1100, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }

  /** Warm pools of light from the window, the counter, the floor lamp and the wall lamp; additive so they only brighten. */
  private addLight() {
    const size = 128;
    const tex = this.textures.createCanvas('glow', size, size)!;
    const ctx = tex.getContext();
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(255, 210, 122, 1)');
    g.addColorStop(1, 'rgba(255, 210, 122, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    tex.refresh();
    const glow = (x: number, y: number, r: number, alpha: number, sun = false) => {
      const img = this.add.image(x, y, 'glow').setDisplaySize(r * 2, r * 2).setAlpha(alpha).setBlendMode(Phaser.BlendModes.ADD).setDepth(1000);
      this.glows.push({ img, base: alpha, sun });
    };
    glow(48, 60, 56, 0.22, true);
    glow(243, 86, 48, 0.18);
    glow(278, 146, 36, FLOOR_LAMP);
    this.floorLamp = this.glows[this.glows.length - 1];
    // The window by the clock lets the day in too.
    glow(211, 58, 26, 0.14, true);
  }

  /**
   * The light follows the system clock: a colour multiplied over the room, the sky showing in the
   * window glass, and lamps that glow brighter after dark. Checked again at every whole hour.
   */
  private addDaylight() {
    // A mask of the glass pixels, so the sky colour lands on the panes and nowhere else.
    const src = this.textures.get('cafe').getSourceImage() as HTMLImageElement;
    const tex = this.textures.createCanvas('glass', src.width, src.height)!;
    const ctx = tex.getContext();
    ctx.drawImage(src, 0, 0);
    const img = ctx.getImageData(0, 0, src.width, src.height);
    const mask = ctx.createImageData(src.width, src.height);
    for (const p of WINDOW_PANES) {
      for (let y = p.y; y < p.y + p.h; y++) {
        for (let x = p.x; x < p.x + p.w; x++) {
          const i = (y * src.width + x) * 4;
          if (!GLASS.has(`${img.data[i]},${img.data[i + 1]},${img.data[i + 2]}`)) continue;
          mask.data.fill(255, i, i + 4);
        }
      }
    }
    ctx.clearRect(0, 0, src.width, src.height);
    ctx.putImageData(mask, 0, 0);
    tex.refresh();
    this.sky = this.add.image(0, 0, 'glass').setOrigin(0).setDepth(0.5).setAlpha(0);
    this.glassMask = this.make.image({ x: 0, y: 0, key: 'glass', origin: 0 }, false).createBitmapMask();
    this.shade = this.add.rectangle(0, 0, src.width, src.height, 0xffffff).setOrigin(0).setDepth(999).setBlendMode(Phaser.BlendModes.MULTIPLY);
    const garden = { x: GARDEN_X, y: 0, w: src.width, h: src.height };
    const gardenMask = this.make.graphics({}, false).fillStyle(0xffffff).fillRect(garden.x, garden.y, garden.w, garden.h).createGeometryMask();
    this.weather = new WeatherLayer(this, 'glass', [
      { area: VIEW, mask: this.street.mask, depth: StreetView.WEATHER_DEPTH, inset: true },
      { area: garden, mask: gardenMask, depth: GARDEN_WEATHER_DEPTH },
    ]);
    this.weather.setReducedMotion(this.reducedMotion);
    // The hour first, so today's weather (and the animals) start out right for it.
    this.period = periodAt(new Date().getHours());
    this.followCalendar(new Date());
    this.setPeriod(periodAt(new Date().getHours()), true);
    const tick = () => this.time.delayedCall(msToNextHour(new Date()) + 1000, () => {
      this.followCalendar(new Date());
      this.setPeriod(periodAt(new Date().getHours()));
      tick();
    });
    tick();
  }

  /** A new day may bring new weather or put the decorations up (checked every hour with the light). */
  private followCalendar(date: Date) {
    const sky = skyOn(date);
    const holiday = holidayOn(date);
    if (sky !== this.weather.sky || holiday !== this.weather.holiday) this.setWeather(sky, holiday, false);
  }

  /** Today's weather and holiday, for small talk about them. */
  outside(): { sky: Sky; holiday: Holiday | null } {
    return { sky: this.weather?.sky ?? 'clear', holiday: this.weather?.holiday ?? null };
  }

  /** Show a kind of weather and a holiday's decorations (also for screenshots: lamplightDebug.scene.setWeather). */
  setWeather(sky: Sky, holiday: Holiday | null = null, now = true) {
    const before = withWeather(LOOKS[this.period], this.weather.sky);
    this.weather.set(sky, holiday);
    this.setPeriod(this.period, now, before);
  }

  /** Change the light to a time of day, fading over a few seconds unless `now`. */
  setPeriod(period: Period, now = false, fromLook?: Look) {
    const look = withWeather(LOOKS[period], this.weather?.sky ?? 'clear');
    const from = fromLook ?? withWeather(LOOKS[this.period], this.weather?.sky ?? 'clear');
    this.period = period;
    this.garden?.setOutdoors(this.weather?.sky ?? 'clear', period);
    const apply = (t: number) => {
      const mix = (a: number, b: number) => Phaser.Display.Color.Interpolate.ColorWithColor(
        Phaser.Display.Color.ValueToColor(a), Phaser.Display.Color.ValueToColor(b), 1, t);
      const tint = mix(from.tint, look.tint);
      this.tintColor = Phaser.Display.Color.GetColor(tint.r, tint.g, tint.b);
      this.shade.setFillStyle(this.tintColor);
      this.street?.setTint(this.tintColor);
      this.garden?.setTint(this.tintColor);
      this.weather?.setTint(this.tintColor);
      const sky = mix(from.sky, look.sky);
      this.sky.setTint(Phaser.Display.Color.GetColor(sky.r, sky.g, sky.b)).setAlpha(from.skyAlpha + (look.skyAlpha - from.skyAlpha) * t);
      const lamps = from.lamps + (look.lamps - from.lamps) * t;
      this.lampLevel = lamps;
      const sun = from.sun + (look.sun - from.sun) * t;
      for (const g of this.glows) g.img.setAlpha(Math.min(1, g.base * (g.sun ? sun : lamps)));
    };
    if (now || this.reducedMotion) return apply(1);
    this.tweens.addCounter({ from: 0, to: 1, duration: DAYLIGHT_MS, onUpdate: (tw) => apply(tw.getValue() ?? 1) });
  }

  /** Play the actor's current pose at its current facing. */
  private hold(actor: Actor) {
    if (actor.id === 'cat') {
      actor.sprite.setFlipX(false).play('cat-lie', true);
      return;
    }
    const key = animKey(actor.id, actor.pose, actor.facing);
    if (this.anims.exists(key)) actor.sprite.play(key, true);
  }

  /** Put something in a character's hand, or take it away. */
  private setProp(actor: Actor, prop?: PropId) {
    actor.prop?.destroy();
    actor.prop = undefined;
    actor.propId = prop;
    if (!prop) return;
    const { frames, colors } = PROPS[prop];
    frames.forEach((rows, i) => {
      const key = `prop-${prop}-${i}`;
      if (this.textures.exists(key)) return;
      const g = this.make.graphics({ x: 0, y: 0 });
      rows.forEach((row, y) => [...row].forEach((c, x) => {
        if (c !== '.') g.fillStyle(colors[c], 1).fillRect(x, y, 1, 1);
      }));
      g.generateTexture(key, rows[0].length, rows.length);
      g.destroy();
    });
    actor.prop = this.add.image(actor.sprite.x, actor.sprite.y, `prop-${prop}-0`).setOrigin(0.5, 1);
  }

  /** One character turns to another, unless busy with something that has its own way of facing. */
  lookAt(id: ActorId, other: ActorId) {
    const [actor, them] = [this.actors.get(id), this.actors.get(other)];
    if (!actor || !them || id === 'cat' || actor.outside || actor.inGarden || them.outside || them.inGarden) return;
    if (actor.pose !== 'idle' || actor.tween?.isPlaying()) return;
    actor.facing = facingTowards(actor.sprite, them.sprite);
    this.hold(actor);
  }

  /** Sitting only makes sense on a chair; elsewhere the character stands. */
  private poseAt(anim: string, actor: Actor): string {
    return anim === 'sit' && !standPoint(actor.at, actor.id).chair ? 'idle' : anim;
  }

  /** Switch a character to an animation (a name from STAFF_ANIMS); unknown names keep the current pose. */
  play(actorId: ActorId, anim: string | undefined, prop?: string) {
    const actor = this.actors.get(actorId);
    if (!actor || actorId === 'cat' || !anim || anim === 'walk' || !STAFF_ANIMS[anim]) return;
    this.setProp(actor, prop as PropId | undefined);
    actor.pose = this.poseAt(anim, actor);
    if (!actor.tween?.isPlaying()) {
      // Handing something over faces the nearest colleague; everything else faces the way the spot faces.
      actor.facing = anim === 'gift' ? this.facingNearest(actor) : standPoint(actor.at, actorId).facing;
      this.hold(actor);
    }
  }

  private facingNearest(actor: Actor): Facing {
    const others = [...this.actors.values()].filter((o) => o !== actor && o.id !== 'cat' && !o.outside);
    const near = others.sort((a, b) => Phaser.Math.Distance.BetweenPoints(a.sprite, actor.sprite) - Phaser.Math.Distance.BetweenPoints(b.sprite, actor.sprite))[0];
    return near ? facingTowards(actor.sprite, near.sprite) : actor.facing;
  }

  /** Point at the counter or a character (mouse over or keyboard focus): show its name and a soft glow. */
  highlight(target: Target | null) {
    if (this.glow) this.glow.sprite.preFX?.remove(this.glow.fx);
    this.glow = undefined;
    const actor = target ? this.actors.get(target as ActorId) : undefined;
    if (actor?.outside || actor?.inGarden) target = null;
    this.hovered = target;
    const fx = actor && target ? actor.sprite.preFX?.addGlow(0xfff1c8, 1.5, 0, false, 0.1, 4) : undefined;
    if (actor && fx) this.glow = { sprite: actor.sprite, fx };
  }

  /** Click (or Enter on) the counter or a character. */
  activate(target: Target) {
    if (target === 'counter') return this.onCounterClick();
    if (target === 'works') return this.growth.hasWorks ? this.onWorksClick() : undefined;
    if (target === 'board') return this.boardInUse() ? this.onBoardClick() : this.onObjectClick('board');
    if (target === 'guest') return this.guestHello();
    if (target === 'you') return this.onYouClick();
    const object = this.objects.find((b) => b.id === target);
    if (object) return this.shows(object) ? this.onObjectClick(object.id) : undefined;
    if (target === 'backdoor') return this.showGarden();
    if (target === 'shopdoor') return this.showShop();
    if (target === 'dog') return this.garden.animals.pat();
    if (target === 'hens') return this.garden.animals.scatterGrain();
    if (target === 'beds') return this.highlight('beds');
    if (target === 'bell') {
      if (!this.bell.visible) return;
      this.ringBell();
      return this.onBellClick();
    }
    const actor = this.actors.get(target as ActorId);
    // Someone out on an errand can still be clicked in the street inset, and someone in the garden out there.
    if (actor?.outside && this.street.who === target) return this.onActorClick(target as ActorId);
    if (actor?.inGarden) return this.view === 'garden' ? this.onActorClick(target as ActorId) : undefined;
    if (!actor || actor.outside) return;
    this.react(actor);
    this.onActorClick(target as ActorId);
  }

  /** What can be clicked, in canvas pixels, for the keyboard hotspots laid over the canvas. */
  hotspots(): { id: Target; x: number; y: number; w: number; h: number }[] {
    if (this.view === 'garden') return this.garden.hotspots().map((h) => ({ ...h, id: h.id === 'door' ? 'shopdoor' : h.id }));
    const counter = ZONES.find((z) => z.id === 'counter')!;
    const people = [...this.actors.values()].filter((a) => !a.outside && !a.inGarden).map((a) => {
      const b = a.sprite.getBounds();
      return { id: a.id, x: b.x, y: b.y, w: b.width, h: b.height };
    });
    const bell = this.bell.visible ? [{ id: 'bell' as const, x: BELL_POS.x - 1, y: BELL_POS.y - 2, w: 9, h: 9 }] : [];
    const out = this.street.open && this.street.who ? [{ id: this.street.who, x: INSET.x, y: INSET.y, w: INSET.w, h: INSET.h }] : [];
    const back = { id: 'backdoor' as const, ...BACK_DOOR };
    const works = this.growth.hasWorks ? [{ id: 'works' as const, ...SHELF }] : [];
    for (const [id, zone] of this.growthZones) zone.input!.enabled = this.growth.shows(id.slice(5) as GrowthId);
    const objects = this.objects.filter((o) => o.id !== 'board' && this.shows(o));
    const guest = this.guest ? [{ id: 'guest' as const, x: this.guest.sprite.x - 8, y: this.guest.sprite.y - 32, w: 16, h: 32 }] : [];
    const you = this.you ? [{ id: 'you' as const, x: this.you.sprite.x - 8, y: this.you.sprite.y - 32, w: 16, h: 32 }] : [];
    const slate = ZONES.find((z) => z.id === 'board')!;
    const board = [{ id: 'board' as const, x: slate.x, y: slate.y, w: slate.w, h: slate.h }];
    return [{ id: 'counter' as const, x: counter.x, y: counter.y, w: counter.w, h: counter.h }, ...bell, back, ...objects, ...guest, ...you, ...works, ...board, ...people, ...out];
  }

  /** A neighbour says hello when clicked. */
  private guestHello() {
    const g = this.guest;
    if (!g || g.speech) return;
    g.speech = strings.ui.objects.guest[g.id];
    this.time.delayedCall(2600, () => { g.speech = undefined; });
  }

  /** A click gets a small reaction: staff hop and look at you; the cat purrs a heart and wakes up. */
  private react(actor: Actor) {
    const { sprite } = actor;
    if (actor.id === 'cat') {
      sprite.anims.resume();
      if (!this.speech.has('cat')) {
        const purr = { text: '', icon: 'heart' as const };
        this.speech.set('cat', purr);
        this.time.delayedCall(1500, () => this.speech.get('cat') === purr && this.speech.delete('cat'));
      }
      return;
    }
    if (actor.tween?.isPlaying() || this.tweens.isTweening(sprite)) return;
    const before = actor.facing;
    if (actor.pose === 'idle') {
      actor.facing = 'down';
      this.hold(actor);
    }
    if (!this.reducedMotion) this.tweens.add({ targets: sprite, y: sprite.y - 3, duration: 110, yoyo: true, ease: 'Quad.easeOut' });
    this.time.delayedCall(1600, () => {
      if (actor.tween?.isPlaying() || actor.pose !== 'idle') return;
      actor.facing = before;
      this.hold(actor);
    });
  }

  private openDoor(): Promise<void> {
    this.onSound?.('door');
    this.door.play('door-open');
    return new Promise((r) => this.time.delayedCall(DOOR_MS, r));
  }

  private closeDoor() {
    this.door.play('door-close');
  }

  /** Someone goes by outside: a dark shape behind the glass, gone behind the curtains and the wall between panes. */
  private async passWindows(key: ActorId | GuestId, way: 'in' | 'out') {
    if (this.reducedMotion) return;
    const { from, to, ms } = passBy(way);
    const shape = this.add.sprite(from, PASSER_FEET, key).setOrigin(0.5, 1).setDepth(PASSER_DEPTH).setTintFill(PASSER_COLOR[this.period]).setAlpha(0.8).setMask(this.glassMask);
    shape.play(animKey(key, 'walk', to > from ? 'right' : 'left'), true);
    await new Promise<void>((done) => this.tweens.add({ targets: shape, x: to, duration: ms, onComplete: () => done() }));
    shape.destroy();
  }

  /** Step out through the open door and fade away; the character stays hidden until it walks somewhere. */
  private async leave(actor: Actor) {
    await this.openDoor();
    actor.sprite.play(animKey(actor.id, 'walk', 'up'), true);
    await new Promise<void>((r) => this.tweens.add({ targets: actor.sprite, y: actor.sprite.y - 8, alpha: 0, duration: 420, onComplete: () => r() }));
    actor.outside = true;
    this.closeDoor();
    this.street.goOut(actor.id, this.tintColor);
    void this.passWindows(actor.id, 'out');
  }

  /** Come back in through the door, facing into the room. */
  private async enter(actor: Actor) {
    await Promise.all([this.street.comeBack(actor.id), this.passWindows(actor.id, 'in')]);
    const spot = standPoint('door', actor.id);
    actor.sprite.setPosition(spot.x, spot.y - 8).setAlpha(0).setDepth(spot.y);
    await this.openDoor();
    actor.sprite.play(animKey(actor.id, 'walk', 'down'), true);
    await new Promise<void>((r) => this.tweens.add({ targets: actor.sprite, y: spot.y, alpha: 1, duration: 420, onComplete: () => r() }));
    actor.outside = false;
    this.closeDoor();
  }

  /**
   * Idle life: a character standing idle glances around now and then and turns back; the cat naps
   * (its tail stops) and wakes up again. Nothing happens while walking, talking or working.
   */
  private scheduleIdle(actor: Actor) {
    actor.idle?.remove();
    const isCat = actor.id === 'cat';
    actor.idle = this.time.delayedCall(isCat ? napDelay(Math.random()) : idleDelay(Math.random()), () => {
      const busy = actor.tween?.isPlaying() || this.speech.has(actor.id);
      if (isCat && !busy) {
        if (actor.sprite.anims.isPlaying) actor.sprite.anims.pause();
        else actor.sprite.anims.resume();
      } else if (!busy && actor.pose === 'idle') {
        const home = standPoint(actor.at, actor.id).facing;
        actor.facing = glanceFacing(home, Math.random());
        this.hold(actor);
        this.time.delayedCall(1200 + Math.random() * 1600, () => {
          if (actor.tween?.isPlaying() || actor.pose !== 'idle') return;
          actor.facing = home;
          this.hold(actor);
        });
      }
      this.scheduleIdle(actor);
    });
  }

  /** Someone out on an errand starts a new piece of work: in the street inset she heads for the shop it belongs to. */
  errand(actorId: ActorId, tool?: string) {
    if (this.actors.get(actorId)?.outside) this.street.errand(actorId, tool);
  }

  /** Whether a character is showing a bubble right now, or is out of the shop (either way, not free to chat). */
  busyTalking(actorId: ActorId): boolean {
    const actor = this.actors.get(actorId);
    return this.speech.has(actorId) || !!actor?.outside || !!actor?.inGarden;
  }

  isSaying(actorId: ActorId, text: string): boolean {
    return this.speech.get(actorId)?.text === text;
  }

  /** Show a line above a character (text may be empty to show just the bubble). Pass null and no bubble to clear. */
  say(actorId: ActorId, text: string | null, bubble?: Bubble) {
    if (text === null && !bubble) this.speech.delete(actorId);
    else this.speech.set(actorId, { text: text ?? '', icon: bubble });
    if (text) this.onSay?.(actorId, text);
  }

  /**
   * Walk a character to an anchor along the aisle, easing in and out and pausing briefly at each turn.
   * Someone who is out comes back in through the door first; anyone sent to the door goes out.
   */
  async walkTo(actorId: ActorId, anchor: AnchorId): Promise<void> {
    const actor = this.actors.get(actorId);
    if (!actor) return;
    actor.trip++;
    actor.tween?.stop();
    if (actor.outside && anchor === 'door') return;
    if (actor.inGarden) await this.backFromGarden(actor);
    if (actor.outside) await this.enter(actor);
    // A trip to the garden cut short on the doorstep: back in full view.
    if (!actor.outside) actor.sprite.setAlpha(1);
    actor.at = anchor;
    if (actorId === 'cat') actor.sprite.anims.resume();
    const path = pathBetween({ x: actor.sprite.x, y: actor.sprite.y }, anchor, actorId);
    if (path.length) {
      await this.followPath(actor, path);
      actor.facing = standPoint(anchor, actorId).facing;
      actor.pose = this.poseAt(actor.pose, actor);
      this.hold(actor);
    }
    // Staff sent to the door are going out on an errand.
    if (anchor === 'door' && actorId !== 'cat' && !actor.outside) await this.leave(actor);
  }

  /** Walk a path, easing in and out and pausing briefly at each turn. Resolves when done or stopped by a newer walk. */
  private followPath(actor: Actor, path: { x: number; y: number }[]): Promise<void> {
    const { sprite, id } = actor;
    this.setProp(actor);
    const speed = WALK_SPEED[id];
    let from = { x: sprite.x, y: sprite.y };
    const steps = path.map((to, i) => {
      const start = from;
      const first = i === 0;
      const last = i === path.length - 1;
      // Eased segments are slower on average; stretch them so the top speed stays the same.
      const stretch = first || last ? 1.3 : 1;
      from = to;
      return {
        targets: [sprite],
        x: to.x,
        y: to.y,
        duration: (Math.hypot(to.x - start.x, to.y - start.y) / speed) * 1000 * stretch,
        delay: first ? 0 : CORNER_PAUSE_MS / 3,
        ease: first && last ? 'Sine.easeInOut' : first ? 'Sine.easeIn' : last ? 'Sine.easeOut' : 'Linear',
        onStart: () => {
          actor.facing = facingTowards(start, to);
          if (id === 'cat') sprite.setFlipX(actor.facing === 'left').play('cat-walk', true);
          else sprite.play(animKey(id, 'walk', actor.facing), true);
        },
        onUpdate: () => sprite.setDepth(sprite.y),
      };
    });
    if (!steps.length) return Promise.resolve();
    return new Promise((done) => {
      actor.tween = this.tweens.chain({ tweens: steps, onComplete: () => done(), onStop: () => done() });
    });
  }

  /**
   * A neighbour drops in: in at the front door, over to the end of the counter, a few words with
   * whoever is about (turns from someone not in the shop are left out), then out again.
   * Resolves once they have gone. sendGuestAway() cuts it short. `handed` is called as they hand over what they brought
   * (the postman's letter about a new version), and never if they were sent away before that.
   */
  async guestVisit(id: GuestId, turns: { speaker: Speaker; text: string }[], handed?: () => void): Promise<void> {
    if (this.guest || this.guestComing) return;
    const trip = ++this.guestTrip;
    const gone = () => trip !== this.guestTrip;
    this.guestComing = true;
    await this.passWindows(id, 'in');
    this.guestComing = false;
    // A commission came in while they were on their way: they carry on down the street.
    if (gone()) return;
    this.onGuestIn?.(id);
    const wait = (ms: number) => new Promise((r) => this.time.delayedCall(ms, r));
    const sprite = this.add.sprite(GUEST_DOOR.x, GUEST_DOOR.y - 8, id).setOrigin(0.5, 1).setAlpha(0).setDepth(GUEST_DOOR.y);
    const shadow = this.add.ellipse(GUEST_DOOR.x, GUEST_DOOR.y, 11, 4, 0x3b2a1e, 0.28);
    const g: Guest = { id, sprite, shadow };
    this.guest = g;
    sprite.setInteractive({ useHandCursor: true, pixelPerfect: true })
      .on('pointerover', () => (g.hovered = true))
      .on('pointerout', () => (g.hovered = false))
      .on('pointerdown', () => this.guestHello());
    await this.openDoor();
    sprite.play(animKey(id, 'walk', 'down'), true);
    await new Promise<void>((r) => this.tweens.add({ targets: sprite, y: GUEST_DOOR.y, alpha: 1, duration: 420, onComplete: () => r() }));
    this.closeDoor();
    if (!gone()) await this.walkGuest(g, walkBetween({ x: g.sprite.x, y: g.sprite.y }, GUEST_SPOT));
    if (!gone()) {
      this.faceGuest(true);
      // Something for the shop: bread from the bakery, letters from the post.
      sprite.play(animKey(id, 'gift', 'left'), true);
      await wait(1000);
      if (!gone()) handed?.();
      sprite.play(animKey(id, 'idle', 'left'), true);
      for (const t of turns) {
        if (gone()) break;
        if (t.speaker === id) {
          g.speech = t.text;
          this.onSay?.(id, t.text);
        } else if (this.anchorOf(t.speaker as ActorId) === null || this.speech.has(t.speaker as ActorId)) {
          continue;
        } else {
          this.say(t.speaker as ActorId, t.text);
        }
        await wait(2000 + 150 * [...t.text].length);
        if (t.speaker === id) g.speech = undefined;
        else if (this.speech.get(t.speaker as ActorId)?.text === t.text) this.say(t.speaker as ActorId, null);
        await wait(300);
      }
    }
    g.speech = undefined;
    this.faceGuest(false);
    await this.walkGuest(g, walkBetween({ x: g.sprite.x, y: g.sprite.y }, GUEST_DOOR));
    await this.openDoor();
    sprite.play(animKey(id, 'walk', 'up'), true);
    await new Promise<void>((r) => this.tweens.add({ targets: sprite, y: GUEST_DOOR.y - 8, alpha: 0, duration: 420, onComplete: () => r() }));
    this.closeDoor();
    sprite.destroy();
    shadow.destroy();
    this.guest = undefined;
    void this.passWindows(id, 'out');
  }

  /** Work came in: a guest in the shop says goodbye and heads out. */
  sendGuestAway() {
    // Also tells someone still out on the street, who then walks on past the door.
    this.guestTrip++;
    this.guest?.tween?.stop();
  }

  /** Is a neighbour in the shop? */
  hasGuest(): boolean {
    return !!this.guest || this.guestComing;
  }

  /** The player's look changed (settings): the shop shows it at once, even mid-walk. */
  setYouLook(n: number) {
    if (n === this.youLook) return;
    this.youLook = n;
    const y = this.you;
    if (!y) return;
    const anim = y.sprite.anims.currentAnim?.key;
    const prefix = /^you-\d+-/;
    y.sprite.setTexture(avatarKey(n), y.sprite.frame.name);
    if (anim && prefix.test(anim)) y.sprite.play(anim.replace(prefix, `${avatarKey(n)}-`), true);
  }

  /**
   * A commission starts: the player comes in at the front door, hands the slip over at the counter and
   * sits down in the chair by the lamp to wait. Resolves once they are seated (or called off).
   */
  youArrive(): Promise<void> {
    // Straight back with another slip (a retry): let them finish going out first, then come in again.
    if (this.you?.leaving) return this.you.leaving.then(() => this.youArrive());
    if (this.you) return this.you.arriving ?? Promise.resolve();
    const key = avatarKey(this.youLook);
    const sprite = this.add.sprite(YOU_DOOR.x, YOU_DOOR.y - 8, key).setOrigin(0.5, 1).setAlpha(0).setDepth(YOU_DOOR.y);
    const shadow = this.add.ellipse(YOU_DOOR.x, YOU_DOOR.y, 11, 4, 0x3b2a1e, 0.28).setAlpha(0);
    const y: You = { sprite, shadow, seated: false, trip: 0 };
    this.you = y;
    sprite.setInteractive({ useHandCursor: true, pixelPerfect: true })
      .on('pointerover', () => (y.hovered = true))
      .on('pointerout', () => (y.hovered = false))
      .on('pointerdown', () => this.onYouClick());
    const trip = y.trip;
    const off = () => trip !== y.trip;
    y.arriving = (async () => {
      // A neighbour on the way out goes first, so two people never squeeze through the door at once.
      for (let i = 0; i < 20 && this.guest; i++) await this.wait(200);
      await this.openDoor();
      sprite.play(this.youAnim('walk', 'down'), true);
      await new Promise<void>((r) => this.tweens.add({ targets: sprite, y: YOU_DOOR.y, alpha: 1, duration: 420, onComplete: () => r() }));
      this.closeDoor();
      if (!off()) await this.walkYou(y, walkBetween({ x: sprite.x, y: sprite.y }, YOU_COUNTER));
      if (off()) return;
      this.faceGuest(true);
      sprite.play(this.youAnim('gift', 'left'), true);
      await this.wait(HAND_OVER_MS);
      this.faceGuest(false);
      if (!off()) await this.walkYou(y, walkBetween({ x: sprite.x, y: sprite.y }, YOU_SEAT));
      if (off()) return;
      y.seated = true;
      sprite.play(this.youAnim('sit', YOU_SEAT.facing), true);
    })();
    return y.arriving;
  }

  /** The commission is over: up from the chair, over to the counter for the result, and home through the front door. */
  youLeave(): Promise<void> {
    const y = this.you;
    if (!y) return Promise.resolve();
    y.leaving ??= this.leaveShop(y);
    return y.leaving;
  }

  private async leaveShop(y: You): Promise<void> {
    await y.arriving;
    if (this.you !== y) return;
    const trip = ++y.trip;
    const off = () => trip !== y.trip;
    y.seated = false;
    await this.walkYou(y, walkBetween({ x: y.sprite.x, y: y.sprite.y }, YOU_COUNTER));
    if (off()) return;
    this.faceGuest(true);
    y.sprite.play(this.youAnim('idle', 'left'), true);
    await this.wait(PICK_UP_MS);
    this.faceGuest(false);
    if (off()) return;
    await this.walkYou(y, walkBetween({ x: y.sprite.x, y: y.sprite.y }, YOU_DOOR));
    if (off()) return;
    await this.openDoor();
    y.sprite.play(this.youAnim('walk', 'up'), true);
    await new Promise<void>((r) => this.tweens.add({ targets: y.sprite, y: YOU_DOOR.y - 8, alpha: 0, duration: 420, onComplete: () => r() }));
    this.closeDoor();
    if (this.you === y) this.dropYou();
  }

  /** Take the player out of the shop at once (a replay was stopped part way). */
  dropYou() {
    const y = this.you;
    if (!y) return;
    y.trip++;
    y.tween?.stop();
    y.sprite.destroy();
    y.shadow.destroy();
    this.you = undefined;
  }

  /** Is the player in the shop, and are they sitting down? */
  youState(): 'away' | 'about' | 'seated' {
    return !this.you ? 'away' : this.you.seated ? 'seated' : 'about';
  }

  private youAnim(anim: string, facing: Facing) {
    return animKey(avatarKey(this.youLook), anim, facing);
  }

  private wait(ms: number) {
    return new Promise<void>((r) => this.time.delayedCall(ms, r));
  }

  /** Walk the player along points; a newer walk (the trip changed) stops this one where it is. */
  private walkYou(y: You, points: { x: number; y: number }[]): Promise<void> {
    const trip = y.trip;
    return points.reduce((done, to) => done.then(() => new Promise<void>((r) => {
      const from = { x: y.sprite.x, y: y.sprite.y };
      const dist = Math.hypot(to.x - from.x, to.y - from.y);
      if (dist < 1 || trip !== y.trip || !y.sprite.active) return r();
      y.sprite.play(this.youAnim('walk', facingTowards(from, to)), true);
      y.tween = this.tweens.add({
        targets: y.sprite, x: to.x, y: to.y, duration: (dist / YOU_SPEED) * 1000,
        onUpdate: () => y.sprite.setDepth(y.sprite.y), onComplete: () => r(), onStop: () => r(),
      });
    })), Promise.resolve());
  }

  /** Walk a guest along points; sent away (the trip changed) part way, they stop where they are. */
  private walkGuest(g: Guest, points: { x: number; y: number }[]): Promise<void> {
    const trip = this.guestTrip;
    return points.reduce((done, to) => done.then(() => new Promise<void>((r) => {
      const from = { x: g.sprite.x, y: g.sprite.y };
      const dist = Math.hypot(to.x - from.x, to.y - from.y);
      if (dist < 1 || trip !== this.guestTrip) return r();
      g.sprite.play(animKey(g.id, 'walk', facingTowards(from, to)), true);
      g.tween = this.tweens.add({
        targets: g.sprite, x: to.x, y: to.y, duration: (dist / GUEST_SPEED) * 1000,
        onUpdate: () => g.sprite.setDepth(g.sprite.y), onComplete: () => r(), onStop: () => r(),
      });
    })), Promise.resolve());
  }

  /** Adeng turns to a guest at the counter while they talk, and back again after. */
  private faceGuest(on: boolean) {
    const adeng = this.actors.get('adeng')!;
    if (adeng.at !== 'counter' || adeng.outside || adeng.inGarden || adeng.tween?.isPlaying() || adeng.pose !== 'idle') return;
    adeng.facing = on ? 'right' : standPoint('counter', 'adeng').facing;
    this.hold(adeng);
  }

  /** Who is out in the garden and settled at a spot, for what they say out there. */
  gardenVisitors(): { id: ActorId; spot: SpotId }[] {
    return this.garden.settled().filter((v) => this.actors.get(v.id)?.inGarden);
  }

  isInGarden(actorId: ActorId): boolean {
    return !!this.actors.get(actorId)?.inGarden;
  }

  /** Who could wander out to the garden now: at home, standing about, not talking, not out. */
  freeForGarden(): ActorId[] {
    return ACTORS.filter((a) => {
      const actor = this.actors.get(a.id)!;
      return actor.at === a.home && !actor.outside && !actor.inGarden && !actor.tween?.isPlaying() && !this.speech.has(a.id)
        && (a.id === 'cat' || actor.pose === 'idle');
    }).map((a) => a.id);
  }

  /**
   * Go out to the garden through the back door, and over to a spot there. Any walk that comes along
   * meanwhile (a commission needing them) takes over and the trip is off.
   */
  async visitGarden(actorId: ActorId, spot: GardenSpot) {
    const actor = this.actors.get(actorId);
    if (!actor || actor.outside || actor.inGarden) return;
    const trip = ++actor.trip;
    actor.tween?.stop();
    if (actorId === 'cat') actor.sprite.anims.resume();
    await this.followPath(actor, pathToBackDoor({ x: actor.sprite.x, y: actor.sprite.y }));
    if (actor.trip !== trip) return;
    await this.throughBackDoor(actor, 'out');
    if (actor.trip !== trip) return;
    actor.inGarden = true;
    void this.garden.arrive(actorId, spot);
  }

  /** In from the garden: across the lawn if anyone is watching out there, then in through the back door. */
  private async backFromGarden(actor: Actor) {
    // Already on the way in: nobody else needs to fetch them. What they were saying out there stays out there.
    actor.inGarden = false;
    this.speech.delete(actor.id);
    await this.garden.leave(actor.id, this.view !== 'garden');
    actor.sprite.setPosition(BACK_DOOR_SPOT.x, BACK_DOOR_SPOT.y + 8).setDepth(BACK_DOOR_SPOT.y);
    await this.throughBackDoor(actor, 'in');
  }

  /** Open the back door and step through it, fading out going out or in coming back. */
  private async throughBackDoor(actor: Actor, way: 'out' | 'in') {
    if (this.view === 'shop') this.onSound?.('door');
    this.backDoor.play('back-door-open');
    await new Promise((r) => this.time.delayedCall(DOOR_MS, r));
    if (actor.id !== 'cat') actor.sprite.play(animKey(actor.id, 'walk', way === 'out' ? 'down' : 'up'), true);
    const to = way === 'out' ? { y: BACK_DOOR_SPOT.y + 8, alpha: 0 } : { y: BACK_DOOR_SPOT.y, alpha: 1 };
    await new Promise<void>((done) => {
      actor.tween = this.tweens.chain({ tweens: [{ targets: [actor.sprite], ...to, duration: 420 }], onComplete: () => done(), onStop: () => done() });
    });
    this.backDoor.play('back-door-close');
  }

  /** Look out at the garden, or back into the shop: a quick fade while the camera moves over. */
  showGarden() {
    this.setView('garden');
  }

  showShop() {
    this.setView('shop');
  }

  private setView(view: 'shop' | 'garden') {
    if (view === this.view) return;
    this.view = view;
    this.highlight(null);
    const cam = this.cameras.main;
    const move = () => cam.setScroll(view === 'garden' ? GARDEN_X : 0, 0);
    this.onView?.(view);
    if (this.reducedMotion) return move();
    cam.fadeOut(VIEW_FADE_MS, 27, 23, 18);
    cam.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      move();
      cam.fadeIn(VIEW_FADE_MS, 27, 23, 18);
    });
  }

  /** Put a character at an anchor at once, without walking (catching up after the window was hidden). */
  place(actorId: ActorId, anchor: AnchorId) {
    const actor = this.actors.get(actorId);
    if (!actor) return;
    actor.trip++;
    actor.tween?.stop();
    if (actor.inGarden) this.garden.remove(actorId);
    actor.inGarden = false;
    const spot = standPoint(anchor, actorId);
    actor.at = anchor;
    actor.outside = anchor === 'door' && actorId !== 'cat';
    this.street.place(actorId, actor.outside, this.tintColor);
    actor.sprite.setPosition(spot.x, spot.y).setDepth(spot.y).setAlpha(actor.outside ? 0 : 1);
    actor.facing = spot.facing;
    actor.pose = this.poseAt(actor.pose, actor);
    this.hold(actor);
  }

  labels(): LabelPos[] {
    if (this.view === 'garden') return this.gardenLabels();
    // Names appear only on hover; the art shows who is who and what each place is.
    const object = this.hovered !== 'board' ? this.objects.find((o) => o.id === this.hovered) : undefined;
    const zones = ZONES.filter((z) => z.id === this.hovered && !object).map((z) => ({ key: `z-${z.id}`, text: z.label, x: z.x + z.w / 2, y: z.y - 2, kind: 'zone' as const }));
    if (object) {
      const O = strings.ui.objects;
      const name = object.id.startsWith('grow-') ? O.grown[object.id.slice(5) as GrowthId] : O.names[object.id as keyof typeof O.names];
      zones.push({ key: `z-${object.id}`, text: name, x: object.x + object.w / 2, y: object.y - 2, kind: 'zone' as const });
    }
    if (this.hovered === 'bell') zones.push({ key: 'z-bell', text: strings.zones.bell, x: BELL_POS.x + 3, y: BELL_POS.y - 2, kind: 'zone' as const });
    if (this.hovered === 'backdoor') zones.push({ key: 'z-garden', text: strings.zones.garden, x: BACK_DOOR.x + 8, y: BACK_DOOR.y - 2, kind: 'zone' as const });
    const actors = ACTORS.filter((a) => a.id === this.hovered).map((a) => {
      const { sprite, height } = this.actors.get(a.id)!;
      return { key: `a-${a.id}`, text: a.name, x: sprite.x, y: sprite.y - height - 1, kind: 'actor' as const };
    });
    // Someone out on an errand can't be heard in the shop, but her mood shows over her in the street inset.
    const bubbles = ACTORS.filter((a) => this.speech.has(a.id)).flatMap((a) => {
      const { sprite, height, outside, inGarden } = this.actors.get(a.id)!;
      const { text, icon } = this.speech.get(a.id)!;
      if (inGarden) return [];
      if (!outside) return [{ key: `b-${a.id}`, text, icon, x: sprite.x, y: sprite.y - height - 2, kind: 'bubble' as const }];
      const head = this.street.who === a.id ? this.street.headPos(height) : null;
      return head && icon ? [{ key: `b-${a.id}`, text: '', icon, x: head.x, y: head.y, kind: 'bubble' as const }] : [];
    });
    const g = this.guest;
    const guest = !g ? [] : [
      ...(g.hovered ? [{ key: `a-${g.id}`, text: strings.guests[g.id], x: g.sprite.x, y: g.sprite.y - 31, kind: 'actor' as const }] : []),
      ...(g.speech ? [{ key: `b-${g.id}`, text: g.speech, x: g.sprite.x, y: g.sprite.y - 32, kind: 'bubble' as const }] : []),
    ];
    const you = this.you?.hovered
      ? [{ key: 'a-you', text: this.youName || strings.you.label, x: this.you.sprite.x, y: this.you.sprite.y - (this.you.seated ? 26 : 31), kind: 'actor' as const }]
      : [];
    return [...zones, ...actors, ...bubbles, ...guest, ...you];
  }

  private bedsLabel(): string {
    const count = (stage: string) => this.garden.beds.filter((b) => b === stage).length;
    const A = strings.ui.access;
    const says = [count('ripe') && fill(A.bedsRipe, { n: String(count('ripe')) }), count('sprout') && fill(A.bedsSprout, { n: String(count('sprout')) })];
    return says.some(Boolean) ? `${A.hotspotBeds}${A.bedsSay}${says.filter(Boolean).join(A.bedsAnd)}` : A.bedsBare;
  }

  /** In the garden view: the door's name on hover, and what anyone out there says. */
  private gardenLabels(): LabelPos[] {
    const door = this.garden.hovered === 'door' || this.hovered === 'shopdoor'
      ? [{ key: 'z-shop', text: strings.zones.shop, x: GARDEN_DOOR.x + 8, y: GARDEN_DOOR.y - 2, kind: 'zone' as const }]
      : [];
    const { animals } = this.garden;
    const beds = this.garden.hovered === 'beds' || this.hovered === 'beds'
      ? [{ key: 'z-beds', text: this.bedsLabel(), x: 53, y: 68, kind: 'zone' as const }]
      : [];
    const dog = animals.dogHead();
    const hens = animals.hensHead();
    const names = [
      ...(this.garden.hovered === 'dog' || this.hovered === 'dog' ? [{ key: 'a-dog', text: strings.animals.dog, x: dog.x, y: dog.y - 1, kind: 'actor' as const }] : []),
      ...((this.garden.hovered === 'hens' || this.hovered === 'hens') && hens ? [{ key: 'a-hens', text: strings.animals.hens, x: hens.x, y: hens.y - 1, kind: 'actor' as const }] : []),
    ];
    const pat = animals.bubble ? [{ key: 'b-dog', text: '', icon: animals.bubble.icon, x: dog.x, y: dog.y - 2, kind: 'bubble' as const }] : [];
    const bubbles = this.garden.heads().filter((h) => this.speech.has(h.id)).map((h) => {
      const { text, icon } = this.speech.get(h.id)!;
      return { key: `b-${h.id}`, text, icon, x: h.x, y: h.y, kind: 'bubble' as const };
    });
    return [...door, ...beds, ...names, ...pat, ...bubbles];
  }
}
