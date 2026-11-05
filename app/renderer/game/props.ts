import type { Facing } from './layout';

/**
 * Small things a character holds, drawn at the hand. The art pack has no writing or drinking, so a page and a pencil or a
 * cup tells what the character is doing (rules/anim-fallback.yaml). Pure, apart from CafeScene turning the rows into textures.
 * Rows are drawn for a character facing right; CafeScene mirrors them for the left.
 */
export const PROP_IDS = ['pencil', 'cup', 'hammer'] as const;
export type PropId = (typeof PROP_IDS)[number];

const INK = 0x2a2233;
export const PROPS: Record<PropId, { frames: string[][]; colors: Record<string, number> }> = {
  pencil: {
    colors: { k: INK, p: 0xf6efdf, l: 0x9a9184, s: 0xcfc6b4, y: 0xe8b84a, d: 0x3b2a1e },
    frames: [
      [
        '.....yk...',
        'kkkkyykkk.',
        'kpyyypppk.',
        'kdyyppppk.',
        'kpplllppk.',
        'kppppppsk.',
        'kkkkkkkkk.',
      ],
      [
        '........yk',
        'kkkkkkkyyk',
        'kppppyyyk.',
        'kplldyypk.',
        'kpplllppk.',
        'kppppppsk.',
        'kkkkkkkkk.',
      ],
    ],
  },
  cup: {
    colors: { k: INK, c: 0x6b432c, w: 0xf4ecdc },
    frames: [[
      'kkkkk.',
      'kccckk',
      'kwwwkk',
      '.kkk..',
    ]],
  },
  hammer: {
    colors: { k: INK, g: 0xa4a8ae, w: 0x8a5a2b },
    frames: [[
      'kkkkkk',
      'kggggk',
      'kkkkkk',
      '..kw..',
      '..kw..',
      '..kw..',
    ]],
  },
};

/** Which drawing to show. `now` is the scene's clock in milliseconds, and 0 keeps it still (reduced motion). */
export function propFrame(prop: PropId, now: number): number {
  return Math.floor(now / 200) % PROPS[prop].frames.length;
}

/**
 * Where it is, from the character's feet. The page lies out on the table in front of whoever sits there; a cup is raised
 * to the mouth now and then; a hammer taps.
 */
export function propOffset(prop: PropId, facing: Facing, pose: string, now: number): { x: number; y: number } {
  const side = facing === 'left' ? -1 : 1;
  if (prop === 'pencil') return { x: side * 14, y: pose === 'sit' ? -7 : -9 };
  if (prop === 'cup') return now % 4000 > 3000 ? { x: side * 6, y: -12 } : { x: side * 8, y: -7 };
  return { x: side * 8, y: -8 - (Math.floor(now / 300) % 2) * 2 };
}
