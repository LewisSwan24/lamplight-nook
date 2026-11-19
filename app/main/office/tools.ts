import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from 'node:path';
import { z } from 'zod';
import { fill, strings } from '../../shared/i18n';
import type { NookResult, NookServer, NookTool, ToolCtx } from '../nook-tools';
import { isInside, reallyInside } from '../paths';
import { makeDocx } from './docx';
import { imageFile, outputPath } from './paths';
import { makePptx } from './pptx';
import { previewHtml } from './preview';
import { readDocument } from './read';
import { docSpecShape, sheetSpecShape, slideSpecShape, type DocSpec, type SheetSpec, type SlideSpec } from './specs';
import { ZipError } from './unzip';
import { makeXlsx } from './xlsx';

/** Runs whose previews are kept: the card of a recent round needs its own, and nothing older is looked at. */
export const MAX_PREVIEW_RUNS = 50;

export type OfficeDeps = {
  /** <data folder>/previews: each round's preview pages in a folder of its own, named after the run. */
  previews: string;
  /** A page in the commission folder as a PDF (print.ts pageToPdf), handed in so the tools need no window to be tested. */
  toPdf: (folder: string, file: string) => Promise<Buffer>;
};

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
      const data = kind === 'docx' ? await makeDocx(spec as DocSpec, images)
        : kind === 'xlsx' ? makeXlsx(spec as SheetSpec)
        : await makePptx(spec as SlideSpec, images);
      // The preview is drawn first: a picture it cannot take stops the call before anything is written.
      const page = kind === 'docx' ? previewHtml('docx', spec as DocSpec, images) : kind === 'xlsx' ? previewHtml('xlsx', spec as SheetSpec, images) : previewHtml('pptx', spec as SlideSpec, images);
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
        description: 'Read a Word (.docx), Excel (.xlsx) or PowerPoint (.pptx) file in the commission folder as plain text: Word with its headings and tables, each sheet as CSV (at most 2,000 rows and 50 columns), each slide\'s title, text and notes. `file` is relative to the commission folder. For a PDF, use the Read tool instead.',
        label: (input) => fill(O().readDocument, { file: fileOf(input) }),
        schema: { file: z.string().min(1).max(500) },
        run: async (input, ctx) => {
          const file = fileOf(input);
          try {
            return said(readDocument(inside(ctx.workDir, file, 'read files')));
          } catch (err) {
            if (!(err instanceof ZipError)) throw err;
            return { ...said(err.reason === 'tooBig'
              ? `${file} is too big to read: unpacked it would pass the limit. Ask the user for a smaller file or the part that matters.`
              : `${file} cannot be read: it is not a Word, Excel or PowerPoint file that can be opened.`), isError: true };
          }
        },
      },
      maker(d, 'docx', () => O().makeDocx,
        'Make a Word document (.docx) from its structure; never write Office XML yourself. `file` is the new file\'s path relative to the commission folder, ending in .docx. Blocks: {h: 1|2|3, text} a heading; {p} a paragraph, where **bold** and *italic* work and nothing else; {list, ordered?}; {table: {head, rows}}; {image, caption?} a .png, .jpg or .gif in the commission folder; {pageBreak: true}.',
        docSpecShape),
      maker(d, 'xlsx', () => O().makeXlsx,
        'Make an Excel workbook (.xlsx) from its structure; never write Office XML yourself. `file` is the new file\'s path relative to the commission folder, ending in .xlsx. Each sheet: a name, columns (header, width in characters, format text|number|money|date|percent), rows of cells. A cell is text, a number, or {f: "=SUM(B2:B20)"} for a formula that stays live; formulas use only this workbook, never other files or the web. freezeHeader keeps the first row in view.',
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
          const { page } = input as { page: string };
          const source = inside(ctx.workDir, page, 'use a page');
          if (!/^\.html?$/i.test(extname(source))) throw new Error(`${page} is not a web page (.html).`);
          const full = outputPath(ctx.workDir, fileOf(input), '.pdf', ctx.preexisting);
          const pdf = await d.toPdf(ctx.workDir, source);
          mkdirSync(dirname(full), { recursive: true });
          writeFileSync(full, pdf);
          keepPreview(d, ctx.run, full, '.page', source);
          return said(`Saved ${relative(ctx.workDir, source)} as ${relative(ctx.workDir, full)} (${pdf.length} bytes).`);
        },
      },
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
