import { z } from 'zod';

/**
 * What the staff hand over instead of OOXML (road-to-1.3.md C1): the structure of a document, a workbook or a deck.
 * The app turns it into the file, so a model never writes Office XML itself.
 */
export type DocSpec = { title?: string; blocks: Block[] };
export type Block =
  | { h: 1 | 2 | 3; text: string }
  | { p: string } // **bold** and *italic*, nothing else
  | { list: string[]; ordered?: boolean }
  | { table: { head: string[]; rows: string[][] } }
  | { image: string; caption?: string } // a path relative to the commission folder
  | { pageBreak: true };
export type ColumnFormat = 'text' | 'number' | 'money' | 'date' | 'percent';
export type Cell = string | number | { f: string };
export type SheetSpec = {
  sheets: {
    name: string;
    columns: { header: string; width?: number; format?: ColumnFormat }[];
    rows: Cell[][]; // f is a formula, such as =SUM(B2:B20)
    freezeHeader?: boolean;
  }[];
};
export type SlideLayout = 'title' | 'bullets' | 'image' | 'two';
export type SlideSpec = {
  title: string;
  accent?: string;
  slides: { layout: SlideLayout; title: string; bullets?: string[]; image?: string; right?: string[]; notes?: string }[];
};

// Bounds, so a runaway model cannot ask for a file the size of a database. Each is well past what a report, a
// workbook a person reads, or a talk needs:
// - any one piece of text: 20,000 characters (a long paragraph is about 1,000);
// - a document: 2,000 blocks, a list 500 items, a table 50 columns and 2,000 rows;
// - a workbook: 50 sheets, each 100 columns and 20,000 rows (Excel's own name limit of 31 characters for a sheet);
// - a deck: 200 slides, each with 50 bullets per side.
const TEXT = 20_000;
const text = z.string().max(TEXT);
const line = z.string().max(1_000);
const file = z.string().min(1).max(500);

const block = z.union([
  z.object({ h: z.union([z.literal(1), z.literal(2), z.literal(3)]), text: line }),
  z.object({ p: text }),
  z.object({ list: z.array(text).min(1).max(500), ordered: z.boolean().optional() }),
  z.object({ table: z.object({ head: z.array(line).min(1).max(50), rows: z.array(z.array(text).max(50)).max(2_000) }) }),
  z.object({ image: file, caption: line.optional() }),
  z.object({ pageBreak: z.literal(true) }),
]);

/** make_docx's input: the output path, relative to the commission folder, and the document. */
export const docSpecShape = {
  file,
  title: line.optional(),
  blocks: z.array(block).min(1).max(2_000),
};

const cell = z.union([text, z.number(), z.object({ f: z.string().min(1).max(TEXT) })]);
const sheet = z.object({
  // Excel refuses names past 31 characters or with any of : \ / ? * [ ]
  name: z.string().min(1).max(31).regex(/^[^:\\/?*[\]]+$/),
  columns: z.array(z.object({
    header: line,
    width: z.number().min(1).max(255).optional(), // characters, as Excel counts them; 255 is its widest
    format: z.enum(['text', 'number', 'money', 'date', 'percent']).optional(),
  })).min(1).max(100),
  rows: z.array(z.array(cell).max(100)).max(20_000),
  freezeHeader: z.boolean().optional(),
});

/** make_xlsx's input. */
export const sheetSpecShape = {
  file,
  sheets: z.array(sheet).min(1).max(50),
};

const bullets = z.array(line).max(50);
const slide = z.object({
  layout: z.enum(['title', 'bullets', 'image', 'two']),
  title: line,
  bullets: bullets.optional(),
  image: file.optional(),
  right: bullets.optional(),
  notes: text.optional(),
});

/** make_pptx's input. */
export const slideSpecShape = {
  file,
  title: line,
  accent: z.string().regex(/^#?[0-9a-fA-F]{6}$/).optional(), // a hex colour, with or without the #
  slides: z.array(slide).min(1).max(200),
};
