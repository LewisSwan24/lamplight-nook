import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from 'node:path';
import { z } from 'zod';
import { fill, LOCALES, strings } from '../../shared/i18n';
import type { NookResult, NookServer, NookTool, ToolCtx } from '../nook-tools';
import { isInside, reallyInside } from '../paths';
import { makeDocx } from './docx';
import { editDocx, editPptx, editXlsx, NotEditable, type DocxEdit, type PptxEdit, type XlsxEdit } from './edit';
import { imageFile, outputPath } from './paths';
import { makePptx } from './pptx';
import { previewHtml, previewOfText } from './preview';
import { readDocument } from './read';
import { officeSafe } from './safe';
import { docSpecShape, fillSheets, sheetSpecShape, slideSpecShape, type DocSpec, type SheetInput, type SlideSpec } from './specs';
import { ZipError } from './unzip';
import { makeXlsx } from './xlsx';

/** Runs whose previews are kept: the card of a recent round needs its own, and nothing older is looked at. */
export const MAX_PREVIEW_RUNS = 50;

export type OfficeDeps = {
  /** <data folder>/previews: each round's preview pages in a folder of its own, named after the run. */
  previews: string;
  /** A page in the commission folder as a PDF (print.ts pageToPdf), handed in so the tools need no window to be tested. */
  toPdf: (folder: string, file: string) => Promise<Buffer>;
  /** A page in the commission folder drawn as a PNG of that size (print.ts pageToPng), likewise (road-to-1.3.md C2). */
  toPng: (folder: string, file: string, size: { width: number; height: number }) => Promise<Buffer>;
};

/** The sides render_png draws, in CSS pixels. */
export const MIN_SIDE = 16;
export const MAX_SIDE = 4096;
const side = z.number().int().min(MIN_SIDE).max(MAX_SIDE);

/** The page a make_pdf or render_png call names: inside the commission folder, and a web page. */
function pageOf(workDir: string, page: string): string {
  const source = inside(workDir, page, 'use a page');
  if (!/^\.html?$/i.test(extname(source))) throw new Error(`${page} is not a web page (.html).`);
  return source;
}

const said = (text: string): NookResult => ({ content: [{ type: 'text', text }] });
const fileOf = (input: unknown) => String((input as { file?: unknown }).file ?? '');

/** A file the staff name, relative to the commission folder: only inside it, links followed. Reasons are for Claude. */
function inside(workDir: string, rel: string, what: string): string {
  const full = isAbsolute(rel) ? rel : resolve(workDir, rel);
  if (!isInside(workDir, full) || !reallyInside(workDir, full)) throw new Error(`${rel} is outside the commission folder; ${what} inside it.`);
  return full;
}

/** Where a made file's preview goes: the page itself, or for a PDF a note of which page it was printed from. */
const previewOf = (previews: string, run: string, made: string, ext: '.html' | '.page') => join(previews, run, `${basename(made)}${ext}`);

function keepPreview(d: OfficeDeps, run: string, made: string, ext: '.html' | '.page', body: string) {
  const fresh = !existsSync(join(d.previews, run));
  mkdirSync(join(d.previews, run), { recursive: true });
  writeFileSync(previewOf(d.previews, run, made, ext), body);
  if (fresh) prunePreviews(d.previews);
}

/** Run folders are named r<time>, so the oldest sort first. Keeps the newest `keep`. */
export function prunePreviews(dir: string, keep = MAX_PREVIEW_RUNS) {
  if (!existsSync(dir)) return;
  const names = readdirSync(dir).sort();
  for (const name of names.slice(0, Math.max(0, names.length - keep))) {
    // Antivirus or an indexer may be holding a file: it goes next time.
    try {
      rmSync(join(dir, name), { recursive: true, force: true });
    } catch {
      continue;
    }
  }
}

type Kind = 'docx' | 'xlsx' | 'pptx';

/**
 * The changed copy an edit tool may write (road-to-1.3.md C3): named with the revised prefix (of any language, as the
 * shop may have switched since the round began), and by the rule make_* write by, so never over the original or any
 * other file that was there before the round.
 */
function revisedPath(ctx: ToolCtx, rel: string, ext: string): string {
  const prefix = strings.ui.files.revisedPrefix;
  if (!Object.values(LOCALES).some((S) => basename(rel).startsWith(S.ui.files.revisedPrefix))) {
    throw new Error(`${rel}: the changed copy's name must start with "${prefix}", such as "${prefix}report${ext}". The original is never changed.`);
  }
  return outputPath(ctx.workDir, rel, ext, ctx.preexisting);
}

const text = z.string().max(20_000);
const count = z.number().int().min(0).max(100_000);
const EDITS: Record<Kind, z.ZodTypeAny> = {
  docx: z.union([
    z.object({ n: count, text }),
    z.object({ n: count, delete: z.literal(true) }),
    z.object({ after: count, text, like: count.optional() }),
  ]),
  pptx: z.object({ slide: count, box: count, text }),
  xlsx: z.object({ sheet: z.string().min(1).max(100), cell: z.string().min(2).max(10), value: z.union([text, z.number(), z.object({ f: z.string().min(1).max(20_000) })]) }),
};

/** Why a workbook is not changed, for the staff, when the look inside it Office files get before opening fails. */
const UNSAFE_BOOK = 'This workbook holds something that reaches outside it (macros, an embedded object, or a link or formula to another file or the web), and a changed workbook is recalculated when it opens.';

/**
 * edit_docx, edit_xlsx, edit_pptx (road-to-1.3.md C3): the file `from` (the original, usually) changed by number and
 * written as `file`, the revised copy, with a preview page for the card as the make_ tools keep. The original is only
 * read. A workbook these do not change gets the staff told to write the changes down instead.
 */
function editor(d: OfficeDeps, kind: Kind, label: () => string, description: string): NookTool {
  return {
    name: `edit_${kind}`,
    kind: 'make',
    description,
    label: (input) => fill(label(), { file: fileOf(input) }),
    schema: { from: z.string().min(1).max(500), file: z.string().min(1).max(500), edits: z.array(EDITS[kind]).min(1).max(500) },
    run: async (input, ctx) => {
      const { from, edits } = input as { from: string; edits: unknown[] };
      const ext = `.${kind}`;
      const full = revisedPath(ctx, fileOf(input), ext);
      const source = inside(ctx.workDir, from, 'change a file');
      if (extname(source).toLowerCase() !== ext) throw new Error(`${from} is not a ${ext} file; edit_${kind} changes ${ext} files.`);
      let data: Buffer;
      try {
        if (kind === 'xlsx' && !officeSafe(source).ok) throw new NotEditable(UNSAFE_BOOK);
        const buf = readFileSync(source);
        data = kind === 'docx' ? editDocx(buf, edits as DocxEdit[], { author: strings.app.title, date: new Date().toISOString().replace(/\.\d+Z$/, 'Z') })
          : kind === 'pptx' ? editPptx(buf, edits as PptxEdit[])
          : editXlsx(buf, edits as XlsxEdit[]);
      } catch (err) {
        if (err instanceof NotEditable) {
          const list = join(dirname(relative(ctx.workDir, full)), `${basename(full, ext)}.md`).replace(/^\.[\\/]/, '');
          return { ...said(`${err.message} Nothing was changed. Write the changes down instead, as "${list}": for each one the sheet, the cell, what it holds now and what it should hold, and why. Say in your reply that the workbook itself was left as it was.`), isError: true };
        }
        if (err instanceof ZipError) return { ...said(`${from} cannot be changed: it is not a file that can be opened, or it is too big.`), isError: true };
        throw err;
      }
      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(full, data);
      keepPreview(d, ctx.run, full, '.html', previewOfText(kind, readDocument(full)));
      const how = kind === 'docx'
        ? 'as tracked changes the user can accept or reject one by one in Word. A changed paragraph keeps its style and the formatting of its first words; formatting inside it that differed (a bold word, another font) may be gone, so say so in your reply if it matters'
        : kind === 'pptx' ? 'each box\'s new lines in the formatting of the lines they replace' : 'and Excel recalculates the workbook when it opens';
      return said(`Wrote ${relative(ctx.workDir, full)} from ${relative(ctx.workDir, source)} with ${edits.length} change${edits.length === 1 ? '' : 's'}, ${how}. To change it again, call this again from the original with every change, or from ${relative(ctx.workDir, full)} for paragraphs, boxes or cells not changed yet (its numbers have moved: read it again first).`);
    },
  };
}

/** make_docx, make_xlsx, make_pptx: the file from its structure, written where Write could, and its preview page kept. */
function maker(d: OfficeDeps, kind: Kind, label: () => string, description: string, schema: typeof docSpecShape | typeof sheetSpecShape | typeof slideSpecShape): NookTool {
  return {
    name: `make_${kind}`,
    kind: 'make',
    description,
    label: (input) => fill(label(), { file: fileOf(input) }),
    schema,
    run: async (input, ctx: ToolCtx) => {
      const { file, ...spec } = input as { file: string };
      const full = outputPath(ctx.workDir, file, `.${kind}`, ctx.preexisting);
      const images = (rel: string) => imageFile(ctx.workDir, rel);
      const book = kind === 'xlsx' ? fillSheets(spec as SheetInput) : undefined;
      const data = kind === 'docx' ? await makeDocx(spec as DocSpec, images)
        : book ? makeXlsx(book)
        : await makePptx(spec as SlideSpec, images);
      // The preview is drawn first: a picture it cannot take stops the call before anything is written.
      const page = kind === 'docx' ? previewHtml('docx', spec as DocSpec, images) : book ? previewHtml('xlsx', book, images) : previewHtml('pptx', spec as SlideSpec, images);
      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(full, data);
      keepPreview(d, ctx.run, full, '.html', page);
      return said(`Wrote ${relative(ctx.workDir, full)} (${data.length} bytes).`);
    },
  };
}

/**
 * The shop's own tool server, nook-office (road-to-1.3.md C1), on every round: Word, Excel and PowerPoint files read as
 * text and made from a structure, so the staff never write Office XML; and a page saved as a PDF. Everything stays in
 * the commission folder, and nothing reaches the network.
 */
export function officeServer(d: OfficeDeps): NookServer {
  const O = () => strings.ui.office;
  return {
    name: 'office',
    tools: [
      {
        name: 'read_document',
        kind: 'read',
        description: 'Read a Word (.docx), Excel (.xlsx) or PowerPoint (.pptx) file in the commission folder as plain text: Word with its headings and tables, each sheet as CSV (at most 2,000 rows and 50 columns), each slide\'s title, text and notes. `file` is relative to the commission folder. For a PDF, use the Read tool instead. With numbered: true it shows the numbers the edit_ tools go by: [12] before Word\'s paragraph 12, [2.3] before the third text box of slide 2, and each sheet\'s column letters and row numbers, a formula shown next to its value.',
        label: (input) => fill(O().readDocument, { file: fileOf(input) }),
        schema: { file: z.string().min(1).max(500), numbered: z.boolean().optional() },
        run: async (input, ctx) => {
          const file = fileOf(input);
          try {
            return said(readDocument(inside(ctx.workDir, file, 'read files'), { numbered: Boolean((input as { numbered?: unknown }).numbered) }));
          } catch (err) {
            if (!(err instanceof ZipError)) throw err;
            return { ...said(err.reason === 'tooBig'
              ? `${file} is too big to read: unpacked it would pass the limit. Ask the user for a smaller file or the part that matters.`
              : `${file} cannot be read: it is not a Word, Excel or PowerPoint file that can be opened.`), isError: true };
          }
        },
      },
      maker(d, 'docx', () => O().makeDocx,
        'Make a Word document (.docx) from its structure; never write Office XML yourself. `file` is the new file\'s path relative to the commission folder, ending in .docx. Blocks: {h: 1|2|3, text} a heading; {p} a paragraph, where **bold** and *italic* work and nothing else; {list, ordered?}; {table: {head, rows}}; {image, caption?} a .png, .jpg or .gif in the commission folder; {pageBreak: true}. Optional: accent, a hex colour for the title, headings and table headers, and size, the body text in points (9 to 16), to carry out the designer\'s proposal.',
        docSpecShape),
      maker(d, 'xlsx', () => O().makeXlsx,
        'Make an Excel workbook (.xlsx) from its structure; never write Office XML yourself. `file` is the new file\'s path relative to the commission folder, ending in .xlsx. Each sheet: a name, columns (header, width in characters, format text|number|money|date|percent), rows of cells. A cell is text, a number, {f: "=SUM(B2:B20)"} for a formula that stays live, or null to leave it empty; formulas use only this workbook, never other files or the web. freezeHeader keeps the first row in view. A sheet like another, {name: "Feb", like: "Jan"}, is a copy of a sheet given before it, its columns, rows, lists and charts, with a chart title naming that sheet given the new name; anything it gives beside like replaces that part of the copy. Write the first of a run of sheets alike in full and the rest this way. A column\'s list makes its cells a drop-down: a range such as "\'Categories\'!$A$2:$A$16", or a few words ["In", "Out"]. charts: [{type: pie|bar, title, labels: "H7:H21", values: "I7:I21", at: "K2"}], each range one column or row of this sheet or, with its name, another; a pie names each slice and its share.',
        sheetSpecShape),
      maker(d, 'pptx', () => O().makePptx,
        'Make a PowerPoint deck (.pptx) from its structure; never write Office XML yourself. `file` is the new file\'s path relative to the commission folder, ending in .pptx. A title, an optional accent colour (hex), and slides: layout title|bullets|image|two, a title, bullets, image (a .png, .jpg or .gif in the commission folder), right (the second column of "two"), notes for the speaker.',
        slideSpecShape),
      {
        name: 'make_pdf',
        kind: 'make',
        description: 'Save a web page in the commission folder as an A4 PDF, as a browser\'s "Print to PDF" would, with its print styles. `page` is the page (.html) and `file` the new PDF, both relative to the commission folder. The page may use only files in the commission folder; nothing from the web loads.',
        label: (input) => fill(O().makePdf, { file: fileOf(input) }),
        schema: { page: z.string().min(1).max(500), file: z.string().min(1).max(500) },
        run: async (input, ctx) => {
          const source = pageOf(ctx.workDir, (input as { page: string }).page);
          const full = outputPath(ctx.workDir, fileOf(input), '.pdf', ctx.preexisting);
          const pdf = await d.toPdf(ctx.workDir, source);
          mkdirSync(dirname(full), { recursive: true });
          writeFileSync(full, pdf);
          keepPreview(d, ctx.run, full, '.page', source);
          return said(`Saved ${relative(ctx.workDir, source)} as ${relative(ctx.workDir, full)} (${pdf.length} bytes).`);
        },
      },
      {
        name: 'render_png',
        kind: 'make',
        description: `Draw a web page in the commission folder as a PNG picture (road-to-1.3.md C2), for a chart, a poster or anything else made as a page. \`page\` is the page (.html) and \`file\` the new PNG, both relative to the commission folder. \`width\` and \`height\` are the picture's size in CSS pixels, ${MIN_SIDE} to ${MAX_SIDE}: the page is opened in a window that size and what shows in it is the picture, so lay the page out to fill exactly that. The page may use only files in the commission folder; nothing from the web loads, web fonts included. Look at the PNG with Read afterwards.`,
        label: (input) => fill(O().renderPng, { file: fileOf(input) }),
        schema: { page: z.string().min(1).max(500), file: z.string().min(1).max(500), width: side, height: side },
        run: async (input, ctx) => {
          const { page, width, height } = input as { page: string; width: number; height: number };
          if (!side.safeParse(width).success || !side.safeParse(height).success) throw new Error(`width and height are whole numbers from ${MIN_SIDE} to ${MAX_SIDE}.`);
          const source = pageOf(ctx.workDir, page);
          const full = outputPath(ctx.workDir, fileOf(input), '.png', ctx.preexisting);
          const png = await d.toPng(ctx.workDir, source, { width, height });
          mkdirSync(dirname(full), { recursive: true });
          writeFileSync(full, png);
          return said(`Drew ${relative(ctx.workDir, source)} as ${relative(ctx.workDir, full)}, ${width} by ${height} pixels (${png.length} bytes).`);
        },
      },
      editor(d, 'docx', () => O().editDocx,
        'Change a Word document (.docx) by paragraph number, as tracked changes the user accepts or rejects in Word; never write Office XML yourself. Read `from` with read_document and numbered: true first. `from` is the file the numbers are from (the original), `file` the changed copy to write, named with the revised prefix and ending in .docx; `from` itself is never changed. Make every change in one call. Each edit is {n, text} to rewrite paragraph n (only the words that differ are marked), {n, delete: true} to take it out, or {after: n, text, like?} to add a paragraph after paragraph n (0 for the start) styled like paragraph `like` (n by default). In text, \\n is a line break and \\t a tab. Paragraphs holding a picture, a link, a field, a comment or a footnote cannot be rewritten.'),
      editor(d, 'xlsx', () => O().editXlsx,
        'Change an Excel workbook (.xlsx) cell by cell; never write Office XML yourself. Read `from` with read_document and numbered: true first. `from` is the workbook to start from (the original), `file` the changed copy to write, named with the revised prefix and ending in .xlsx; `from` itself is never changed. Each edit is {sheet, cell: "B3", value}: text, a number, "" to empty it, or {f: "=SUM(B2:B9)"} for a live formula, which may use only this workbook. A workbook with charts, pivot tables, tables or links to other files is not changed: you are told to write the changes down instead.'),
      editor(d, 'pptx', () => O().editPptx,
        'Change the text of a PowerPoint deck (.pptx) box by box; never write Office XML yourself. Read `from` with read_document and numbered: true first. `from` is the deck to start from (the original), `file` the changed copy to write, named with the revised prefix and ending in .pptx; `from` itself is never changed. Each edit is {slide, box, text}: box 3 of slide 2 is [2.3]; text replaces all the box\'s text, one paragraph per line (\\n). Tables and pictures are not changed.'),
    ],
  };
}

const PICTURES = /\.(png|jpe?g)$/i;

/**
 * What the result card's thumbnail is taken from (road-to-1.3.md C1): a page where it is, a picture shrunk, a Word,
 * Excel or PowerPoint file this round made through its preview page, a PDF it made through the page it was printed
 * from. Anything else (a file handed over, or one written some other way) gets no picture, only its name. `folder` is
 * what the page may load from.
 */
export function thumbSource(main: string, workDir: string, previews: string, run: string): { page: string; folder: string; preview?: true } | { image: string } | null {
  const ext = extname(main).toLowerCase();
  if (ext === '.html' || ext === '.htm') return { page: main, folder: workDir };
  if (PICTURES.test(ext)) return { image: main };
  if (ext === '.docx' || ext === '.xlsx' || ext === '.pptx') {
    const page = previewOf(previews, run, main, '.html');
    return existsSync(page) ? { page, folder: join(previews, run), preview: true } : null;
  }
  if (ext === '.pdf') {
    const note = previewOf(previews, run, main, '.page');
    if (!existsSync(note)) return null;
    const page = readFileSync(note, 'utf8');
    return isInside(workDir, page) && reallyInside(workDir, page) ? { page, folder: workDir } : null;
  }
  return null;
}
