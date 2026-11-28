import Phaser from 'phaser';
import { CUBBIES, PER_CUBBY, type BookId } from '../../shared/books';
import type { RoomId } from '../../shared/scenes';
import { pieceData } from './pieces';

/**
 * The bookshop's big bookcase (plan-2.0.md J13), four rows of four cubbies, drawn empty over the room's picture and
 * filled a cubby to a book list; and, at home, the book you borrowed lying on top of the shelf.
 *
 * The bookcase in bookshop.png is Modern Interiors' library case with its books in. Each cubby's inside, 8 by 7 pixels,
 * is painted over as an empty back board, then each book on the shelf is a spine 2 pixels wide, its colour and height
 * the same every time for that book.
 */
const shelfPiece = (room: RoomId) => pieceData(room).pieces.find((p) => p.name === 'shelf')!;

/** Where each cubby's inside starts in the case's picture, and how big it is. */
const COLS = [3, 14, 25, 36] as const;
const ROWS = [9, 18, 27, 36] as const;
const INSIDE = { w: 8, h: 7 } as const;
const SPINE_W = 2;
/** The back of an empty cubby, the shadow under the board above it, and the board it stands on (its edge, then its top). */
const BACK = 0x6b3a2e;
const BACK_SHADOW = 0x4a2a2a;
const BOARD_EDGE = 0xb35e3f;
const BOARD = 0xca8854;
/** Spine colours, from the case's own books. */
const SPINES = [0x3c5ac8, 0xed931e, 0xf2b22b, 0xe86419, 0xa73a30, 0x5c8c46, 0xd87a8c, 0xe8dcc0] as const;
const BAND = 0xfff1c8;

const hash = (s: string): number => {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return h;
};
/** A book's spine: its colour and how tall it stands, 5 to 7 pixels. */
export const spineOf = (book: BookId): { color: number; h: number } => {
  const h = hash(book);
  return { color: SPINES[h % SPINES.length], h: 5 + ((h >>> 8) % 3) };
};

/** Where the inside of cubby `i` is in the room, counted along each row from the top left. */
export function cubbyAt(i: number): { x: number; y: number; w: number; h: number } {
  const p = shelfPiece('bookshop');
  return { x: p.x + COLS[i % COLS.length], y: p.y + ROWS[Math.floor(i / COLS.length)], ...INSIDE };
}

export class BookCase {
  private readonly backs: Phaser.GameObjects.Graphics;
  private readonly spines: Phaser.GameObjects.Graphics;
  private shown: BookId[][] = [];

  constructor(scene: Phaser.Scene) {
    const depth = shelfPiece('bookshop').base;
    this.backs = scene.add.graphics().setDepth(depth + 0.02);
    this.spines = scene.add.graphics().setDepth(depth + 0.03);
    for (let i = 0; i < CUBBIES; i++) {
      const at = cubbyAt(i);
      this.backs.fillStyle(BACK, 1).fillRect(at.x, at.y, at.w, at.h);
      this.backs.fillStyle(BACK_SHADOW, 1).fillRect(at.x, at.y, at.w, 1);
      // The picture has books lying on some boards too: each board is drawn bare.
      this.backs.fillStyle(BOARD_EDGE, 1).fillRect(at.x, at.y + at.h, 1, 1);
      this.backs.fillStyle(BOARD, 1).fillRect(at.x + 1, at.y + at.h, at.w - 1, 1);
    }
  }

  /** The books in each cubby, as many cubbies as there are; a book out on loan leaves its gap. */
  setShelf(cubbies: BookId[][], lent: BookId | null) {
    this.shown = cubbies.slice(0, CUBBIES).map((books) => books.slice(0, PER_CUBBY).filter((b) => b !== lent));
    this.spines.clear();
    cubbies.slice(0, CUBBIES).forEach((books, i) => {
      const at = cubbyAt(i);
      books.slice(0, PER_CUBBY).forEach((book, n) => {
        if (book === lent) return;
        const s = spineOf(book);
        const x = at.x + n * SPINE_W;
        const top = at.y + at.h - s.h;
        this.spines.fillStyle(s.color, 1).fillRect(x, top, SPINE_W, s.h);
        this.spines.fillStyle(BAND, 0.8).fillRect(x, top + 1, SPINE_W, 1);
        this.spines.fillStyle(0x3a3a50, 0.5).fillRect(x + SPINE_W - 1, top, 1, s.h);
      });
    });
  }

  /** How many books stand in each filled cubby, for the scenarios. */
  look(): number[] {
    return this.shown.map((books) => books.length);
  }
}

/** The borrowed book on top of the home shelf, lying flat: a cover and the edge of its pages. */
const LENT_W = 11;
const LENT_H = 3;
export const lentSpot = (room: RoomId): { x: number; y: number; w: number; h: number } => {
  const p = shelfPiece(room);
  return { x: p.x + 30, y: p.y + 2, w: LENT_W, h: LENT_H + 1 };
};

type Hooks = { activate: () => void; hover: (on: boolean) => void };

export class LentBook {
  private readonly img: Phaser.GameObjects.Graphics;
  private readonly zone: Phaser.GameObjects.Zone;
  /** The title of the book on the shelf, for its label, or null with none. */
  title: string | null = null;

  constructor(scene: Phaser.Scene, private room: RoomId, hooks: Hooks) {
    const at = lentSpot(room);
    const depth = shelfPiece(room).base + 0.05;
    this.img = scene.add.graphics({ x: at.x, y: at.y }).setDepth(depth).setVisible(false);
    this.zone = scene.add.zone(at.x - 1, at.y - 2, at.w + 2, at.h + 3).setOrigin(0).setDepth(depth + 0.01)
      .on('pointerdown', () => hooks.activate())
      .on('pointerover', () => hooks.hover(true))
      .on('pointerout', () => hooks.hover(false));
  }

  /** Put the borrowed book on the shelf, or take it away. */
  set(book: { id: BookId; title: string } | null) {
    this.title = book?.title ?? null;
    this.img.clear().setVisible(!!book);
    if (book) {
      const { color } = spineOf(book.id);
      this.img.fillStyle(0x3a3a50, 0.35).fillRect(1, LENT_H, LENT_W, 1);
      this.img.fillStyle(color, 1).fillRect(0, 0, LENT_W, LENT_H);
      this.img.fillStyle(0xe8dcc0, 1).fillRect(1, 1, LENT_W - 1, 1);
      this.img.fillStyle(BAND, 0.8).fillRect(2, 0, 1, LENT_H);
    }
    if (book) this.zone.setInteractive({ useHandCursor: true });
    else this.zone.disableInteractive();
  }

  get shown(): boolean {
    return this.title !== null;
  }

  /** The keyboard's and the label's place, while a book is there. */
  targets(): { id: 'lentbook'; x: number; y: number; w: number; h: number }[] {
    return this.shown ? [{ id: 'lentbook', ...lentSpot(this.room) }] : [];
  }
}
