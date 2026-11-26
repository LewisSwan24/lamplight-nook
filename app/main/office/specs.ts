import { z } from 'zod';

/**
 * What the staff hand over instead of OOXML (road-to-1.3.md C1): the structure of a document, a workbook or a deck.
 * The app turns it into the file, so a model never writes Office XML itself.
 */
/** `accent`: the colour of the title, headings and table headers; `size`: the body type in points (plan-1.8.md H0). */
export type DocSpec = { title?: string; accent?: string; size?: number; blocks: Block[] };
export type Block =
  | { h: 1 | 2 | 3; text: string }
  | { p: string } // **bold** and *italic*, nothing else
  | { list: string[]; ordered?: boolean }
  | { table: { head: string[]; rows: string[][] } }
  | { image: string; caption?: string } // a path relative to the commission folder
  | { pageBreak: true };
export type ColumnFormat = 'text' | 'number' | 'money' | 'date' | 'percent';
/** null leaves the cell out, so a block can stand to the right of columns left empty (plan-1.8.md H5). */
export type Cell = string | number | { f: string } | null;
/**
 * A chart drawn from ranges of the workbook (plan-1.8.md H5): a pie of one column or row of values, or columns side by
 * side. `labels` and `values` are ranges such as "H7:H21" on this sheet or "'Year'!C2:C13"; `at` is the cell its top
 * left corner sits on, one column past the table and a row down unless given.
 */
export type ChartSpec = { type: 'pie' | 'bar'; title: string; labels: string; values: string; at?: string };
export type SheetSpec = {
  sheets: {
    name: string;
    /** `list`: the column's cells offer a drop-down of a range of the workbook or of a few words (plan-1.8.md H5). */
    columns: { header: string; width?: number; format?: ColumnFormat; list?: string | string[] }[];
    rows: Cell[][]; // f is a formula, such as =SUM(B2:B20)
    freezeHeader?: boolean;
    charts?: ChartSpec[];
  }[];
};
/** What make_xlsx is handed: a sheet may instead be `like` one given before it (plan-1.8.md H5). */
export type SheetInput = { sheets: (Partial<SheetSpec['sheets'][number]> & { name: string; like?: string })[] };
/**
 * The workbook a make_xlsx call describes, each sheet given `like` another filled in. Twelve months alike would be
 * twelve copies of one long structure, and the real-key runs of plan-1.8.md H5 showed a model writing them out stops
 * after the first. So a sheet may be like one given before it: a copy of its columns, rows, lists and charts, with
 * whatever the sheet gives itself in their place. A chart title naming the sheet it copies takes the new name.
 */
export function fillSheets(input: SheetInput): SheetSpec {
  const sheets: SheetSpec['sheets'] = [];
  for (const { like, ...own } of input.sheets) {
    const from = like === undefined ? undefined : sheets.find((s) => s.name === like);
    if (like !== undefined && !from) throw new Error(`The sheet "${own.name}" is like "${like}" but no sheet before it has that name; give that sheet first, in full.`);
    const base = from && { ...from, charts: from.charts?.map((c) => ({ ...c, title: c.title.replaceAll(from.name, own.name) })) };
    const sheet = structuredClone({ ...base, ...own });
    if (!sheet.columns || !sheet.rows) throw new Error(`The sheet "${own.name}" has no columns and rows; give them, or like: the name of a sheet before it to copy.`);
    sheets.push({ ...sheet, columns: sheet.columns, rows: sheet.rows });
  }
  return { sheets };
}
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
  accent: z.string().regex(/^#?[0-9a-fA-F]{6}$/).optional(), // a hex colour, with or without the #
  size: z.number().int().min(9).max(16).optional(), // points
  blocks: z.array(block).min(1).max(2_000),
};

const cell = z.union([text, z.number(), z.object({ f: z.string().min(1).max(TEXT) }), z.null()]);
const range = z.string().min(3).max(100);
// A chart a sheet carries: ten is more than any summary a person reads needs.
const chart = z.object({
  type: z.enum(['pie', 'bar']),
  title: line,
  labels: range,
  values: range,
  at: z.string().regex(/^[A-Z]{1,3}[1-9]\d{0,4}$/).optional(),
});
const sheet = z.object({
  // Excel refuses names past 31 characters or with any of : \ / ? * [ ]
  name: z.string().min(1).max(31).regex(/^[^:\\/?*[\]]+$/),
  // The name of a sheet given before this one to copy; what this one gives replaces that part of the copy.
  like: z.string().min(1).max(31).optional(),
  columns: z.array(z.object({
    header: line,
    width: z.number().min(1).max(255).optional(), // characters, as Excel counts them; 255 is its widest
    format: z.enum(['text', 'number', 'money', 'date', 'percent']).optional(),
    list: z.union([range, z.array(z.string().min(1).max(100)).min(1).max(50)]).optional(),
  })).min(1).max(100).optional(),
  rows: z.array(z.array(cell).max(100)).max(20_000).optional(),
  freezeHeader: z.boolean().optional(),
  charts: z.array(chart).max(10).optional(),
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
