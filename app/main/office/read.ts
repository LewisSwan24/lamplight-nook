import { readFileSync } from 'node:fs';
import { extname, posix } from 'node:path';
import { entryText, readZip, type ZipEntries } from './unzip';
import type { Book } from './formula';
import type { Cell } from './specs';
import { letters } from './xlsx';
import { child, children, elements, find, findAll, ownText, parseXml, textOf, type El } from './xml';

/** What read_document says about a PDF: Claude Code's own Read takes PDFs, a few pages at a time. */
export const PDF_HINT = 'This is a PDF. Read it with the Read tool instead, passing `pages` (at most 20 pages at a time, such as "1-20").';

/** The most of a sheet read_document returns (road-to-1.3.md C1). */
export const SHEET_MAX_ROWS = 2_000;
export const SHEET_MAX_COLUMNS = 50;

/**
 * The text of a Word, Excel or PowerPoint file for the staff (road-to-1.3.md C1): Word as Markdown-ish text, each sheet
 * as CSV, each slide's title, text and notes. A package past the unpacking limits throws a ZipError.
 * `numbered` (C3) puts the numbers the edit tools go by in front: [12] for Word's twelfth paragraph, [2.3] for the third
 * text box of slide 2, and a sheet's column letters and row numbers, with each formula next to its value.
 */
export function readDocument(file: string, { numbered = false } = {}): string {
  const ext = extname(file).toLowerCase();
  if (ext === '.pdf') return PDF_HINT;
  if (ext !== '.docx' && ext !== '.xlsx' && ext !== '.pptx') throw new Error(`read_document reads .docx, .xlsx and .pptx files (and points to Read for .pdf), not ${ext || 'this file'}.`);
  const zip = readZip(readFileSync(file));
  return ext === '.docx' ? readDocx(zip, numbered) : ext === '.xlsx' ? readXlsx(zip, numbered) : readPptx(zip, numbered);
}

export const xml = (zip: ZipEntries, name: string): El | undefined => {
  const text = entryText(zip, name);
  return text === undefined ? undefined : parseXml(text);
};

/** A part's relationships, id -> the target's name in the package. */
export function rels(zip: ZipEntries, part: string): Map<string, { type: string; target: string }> {
  const dir = posix.dirname(part);
  const root = xml(zip, posix.join(dir, '_rels', `${posix.basename(part)}.rels`));
  const out = new Map<string, { type: string; target: string }>();
  for (const r of root ? findAll(root, 'Relationship') : []) {
    if (r.attrs.TargetMode?.toLowerCase() === 'external') continue;
    const t = r.attrs.Target ?? '';
    out.set(r.attrs.Id, { type: r.attrs.Type ?? '', target: t.startsWith('/') ? t.slice(1) : posix.normalize(posix.join(dir, t)) });
  }
  return out;
}

// Word

/** The paragraphs edit_docx numbers, in the order of the text: the body's, table cells' included, none inside another. */
export const docxParagraphs = (doc: El): El[] => findAll(find(doc, 'body') ?? doc, 'p');

function readDocx(zip: ZipEntries, numbered: boolean): string {
  const doc = xml(zip, 'word/document.xml');
  if (!doc) throw new Error('This .docx has no document part.');
  const number = new Map(docxParagraphs(doc).map((p, i) => [p, i + 1]));
  const tag = (p: El) => (numbered && number.has(p) ? `[${number.get(p)}] ` : '');
  // Style ids differ by language (a Chinese Word may call Heading 1 "1"), so headings are known by the style's name.
  const names = new Map<string, string>();
  const styles = xml(zip, 'word/styles.xml');
  for (const s of styles ? findAll(styles, 'style') : []) names.set(s.attrs.styleId, (child(s, 'name')?.attrs.val ?? '').toLowerCase());
  const level = (p: El): number => {
    const id = child(child(p, 'pPr'), 'pStyle')?.attrs.val ?? '';
    const name = names.get(id) ?? id.toLowerCase();
    if (name === 'title') return 1;
    const m = /^heading ?([1-6])$/.exec(name);
    return m ? Number(m[1]) : 0;
  };
  const isList = (p: El): boolean => {
    const pPr = child(p, 'pPr');
    const num = child(child(pPr, 'numPr'), 'numId')?.attrs.val;
    if (num !== undefined) return num !== '0';
    const id = child(pPr, 'pStyle')?.attrs.val ?? '';
    return /^list (bullet|number)/.test(names.get(id) ?? '');
  };
  const paraText = (p: El) => textOf(p, 't', ['Fallback', 'del']).trim();
  const cell = (tc: El) => findAll(tc, 'p').filter((p) => paraText(p)).map((p) => tag(p) + paraText(p)).join(' ').replace(/\|/g, '\\|');

  const blocks: { list: boolean; text: string }[] = [];
  const walk = (parent: El) => {
    for (const el of elements(parent)) {
      if (el.name === 'p') {
        const text = paraText(el);
        if (!text) continue;
        const h = level(el);
        if (h) blocks.push({ list: false, text: `${tag(el)}${'#'.repeat(h)} ${text}` });
        else blocks.push({ list: isList(el), text: tag(el) + (isList(el) ? `- ${text}` : text) });
      } else if (el.name === 'tbl') {
        const rows = children(el, 'tr').map((tr) => children(tr, 'tc').map(cell));
        if (!rows.length) continue;
        const width = Math.max(...rows.map((r) => r.length));
        const line = (r: string[]) => `| ${Array.from({ length: width }, (_, i) => r[i] ?? '').join(' | ')} |`;
        blocks.push({ list: false, text: [line(rows[0]), line(Array(width).fill('---')), ...rows.slice(1).map(line)].join('\n') });
      } else if (el.name === 'sdt' || el.name === 'sdtContent' || el.name === 'customXml' || el.name === 'body') {
        walk(el);
      }
    }
  };
  walk(find(doc, 'body') ?? doc);
  // Blank lines between blocks, none between the items of one list.
  return blocks.map((b, i) => (i && !(b.list && blocks[i - 1].list) ? '\n' : '') + b.text).join('\n');
}

// Excel

/** Built-in number formats that show a date (ECMA-376 18.8.30). */
const DATE_FORMATS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47]);

function readXlsx(zip: ZipEntries, numbered: boolean): string {
  const book = xml(zip, 'xl/workbook.xml');
  if (!book) throw new Error('This .xlsx has no workbook part.');
  const links = rels(zip, 'xl/workbook.xml');
  const shared = (() => {
    const sst = xml(zip, 'xl/sharedStrings.xml');
    // Phonetic guides (rPh) are not part of the cell's text.
    return sst ? children(find(sst, 'sst') ?? sst, 'si').map((si) => textOf(si, 't', ['rPh'])) : [];
  })();
  const dateStyles = (() => {
    const styles = xml(zip, 'xl/styles.xml');
    if (!styles) return new Set<number>();
    const custom = new Map(findAll(styles, 'numFmt').map((f) => [Number(f.attrs.numFmtId), f.attrs.formatCode ?? '']));
    // A custom format is a date when it has d or y outside quoted text and [colour] or [condition] brackets.
    const isDate = (id: number) => DATE_FORMATS.has(id) || /[dy]/i.test((custom.get(id) ?? '').replace(/"[^"]*"|\[[^\]]*\]|\\./g, ''));
    const xfs = children(find(styles, 'cellXfs'), 'xf');
    return new Set(xfs.flatMap((xf, i) => (isDate(Number(xf.attrs.numFmtId ?? 0)) ? [i] : [])));
  })();

  const out: string[] = [];
  for (const s of findAll(book, 'sheet')) {
    const target = links.get(s.attrs.id)?.target;
    const sheet = target ? xml(zip, target) : undefined;
    if (!sheet) continue;
    const hidden = s.attrs.state && s.attrs.state !== 'visible' ? ' (hidden)' : '';
    const grid: string[][] = [];
    let rowCount = 0;
    let colCount = 0;
    let next = 0;
    for (const row of findAll(sheet, 'row')) {
      const r = row.attrs.r ? Number(row.attrs.r) - 1 : next;
      next = r + 1;
      let nextCol = 0;
      for (const c of children(row, 'c')) {
        const col = c.attrs.r ? column(c.attrs.r) : nextCol;
        nextCol = col + 1;
        const value = cellValue(c, shared, dateStyles, numbered);
        if (value === '') continue;
        rowCount = Math.max(rowCount, r + 1);
        colCount = Math.max(colCount, col + 1);
        if (r >= SHEET_MAX_ROWS || col >= SHEET_MAX_COLUMNS) continue;
        (grid[r] ??= [])[col] = value;
      }
    }
    out.push(`## ${s.attrs.name}${hidden}`);
    const rows = Math.min(rowCount, SHEET_MAX_ROWS);
    // Numbered, the first line names the columns and each row starts with its number; empty rows are left out.
    if (numbered) out.push(['', ...Array.from({ length: Math.min(colCount, SHEET_MAX_COLUMNS) }, (_, i) => letters(i))].join(','));
    for (let r = 0; r < rows; r++) {
      const cells = grid[r] ?? [];
      let end = cells.length;
      while (end > 0 && !cells[end - 1]) end--;
      if (numbered && !end) continue;
      out.push([...(numbered ? [String(r + 1)] : []), ...Array.from({ length: end }, (_, i) => csv(cells[i] ?? ''))].join(','));
    }
    if (rowCount > SHEET_MAX_ROWS || colCount > SHEET_MAX_COLUMNS) {
      out.push(`(Showing the first ${rows} of ${rowCount} rows and ${Math.min(colCount, SHEET_MAX_COLUMNS)} of ${colCount} columns.)`);
    }
    // Lists to pick from and charts are not cells, but a check after saving needs to see what they draw from too.
    for (const v of findAll(sheet, 'dataValidation')) {
      const from = child(v, 'formula1');
      if (v.attrs.type === 'list' && from) out.push(`(Drop-down list in ${v.attrs.sqref}, from ${ownText(from)}.)`);
    }
    out.push(...sheetCharts(zip, target!));
    out.push('');
  }
  return out.join('\n').trimEnd();
}

/** Each chart on a sheet in a line: its kind, its title and the ranges it draws (labels, then values). */
function sheetCharts(zip: ZipEntries, sheetPart: string): string[] {
  const out: string[] = [];
  for (const drawing of rels(zip, sheetPart).values()) {
    if (!drawing.type.endsWith('/drawing')) continue;
    for (const part of rels(zip, drawing.target).values()) {
      const chart = part.type.endsWith('/chart') ? xml(zip, part.target) : undefined;
      const area = find(chart, 'plotArea');
      const plot = area && elements(area).find((e) => /Chart$/.test(e.name));
      if (!chart || !plot) continue;
      const bar = plot.name === 'barChart' || plot.name === 'bar3DChart';
      const kind = bar ? (child(plot, 'barDir')?.attrs.val === 'bar' ? 'Bar' : 'Column') : plot.name.replace(/(3D)?Chart$/, '').replace(/^./, (c) => c.toUpperCase());
      const title = find(chart, 'title');
      const name = title && textOf(title) ? ` "${textOf(title)}"` : '';
      const refs = (n: string) => children(plot, 'ser').flatMap((s) => {
        const f = find(child(s, n), 'f');
        return f ? [ownText(f)] : [];
      });
      const said = [refs('cat').length ? `labels ${refs('cat')[0]}` : '', refs('val').length ? `values ${refs('val').join(' and ')}` : ''].filter(Boolean);
      out.push(`(${kind} chart${name}${said.length ? `: ${said.join(', ')}` : ''}.)`);
    }
  }
  return out;
}

/** A1 -> 0, AB7 -> 27. */
function column(ref: string): number {
  let n = 0;
  for (const ch of ref.toUpperCase()) {
    if (ch < 'A' || ch > 'Z') break;
    n = n * 26 + ch.charCodeAt(0) - 64;
  }
  return n - 1;
}

function cellValue(c: El, shared: string[], dateStyles: Set<number>, numbered = false): string {
  const v = child(c, 'v');
  const raw = v ? ownText(v) : undefined;
  const f = child(c, 'f');
  // Numbered for changing: a formula shows itself and what it came to, so it is not typed over by its value.
  if (numbered && f && ownText(f) && raw !== undefined && raw !== '') return `=${ownText(f)} → ${cellValue(c, shared, dateStyles)}`;
  // A formula Excel never calculated (one the app wrote) has no value yet: show the formula itself.
  if ((raw === undefined || raw === '') && f) {
    const formula = ownText(f);
    return formula ? `=${formula}` : '';
  }
  switch (c.attrs.t) {
    case 's':
      return shared[Number(raw)] ?? '';
    case 'inlineStr':
      return textOf(child(c, 'is') ?? c, 't', ['rPh']);
    case 'b':
      return raw === '1' ? 'TRUE' : 'FALSE';
    case 'str':
    case 'e':
      return raw ?? '';
    default:
      if (raw === undefined) return '';
      return dateStyles.has(Number(c.attrs.s ?? 0)) && raw !== '' && !Number.isNaN(Number(raw)) ? date(Number(raw)) : raw;
  }
}

/** An Excel serial date (days since 1899-12-30) as 2026-11-19, with the time when it has one. */
function date(serial: number): string {
  const ms = Math.round((serial - 25569) * 86_400_000);
  const iso = new Date(ms).toISOString();
  return iso.endsWith('T00:00:00.000Z') ? iso.slice(0, 10) : iso.slice(0, 19).replace('T', ' ');
}

/** A CSV field, quoted when it holds a comma, a quote or a line break. */
const csv = (s: string) => (/[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

// PowerPoint

/** The text boxes edit_pptx numbers on a slide: its shapes with text, in order, groups opened up. */
export const slideBoxes = (slide: El): El[] => shapes(find(slide, 'spTree')).filter((s) => s.name === 'sp' && child(s, 'txBody'));

/** The slides' parts, in the order of the deck. */
export function slideParts(zip: ZipEntries, pres: El): string[] {
  const links = rels(zip, 'ppt/presentation.xml');
  return findAll(find(pres, 'sldIdLst') ?? pres, 'sldId').map((id) => links.get(id.attrs.id)?.target ?? '');
}

function readPptx(zip: ZipEntries, numbered: boolean): string {
  const pres = xml(zip, 'ppt/presentation.xml');
  if (!pres) throw new Error('This .pptx has no presentation part.');
  const out: string[] = [];
  slideParts(zip, pres).forEach((part, i) => {
    const slide = part ? xml(zip, part) : undefined;
    if (!part || !slide) return;
    if (numbered) {
      // Every box by its number, empty ones too, its lines under the first; tables have no number, as they are not changed.
      out.push(`## Slide ${i + 1}`);
      const boxes = slideBoxes(slide);
      for (const shape of shapes(find(slide, 'spTree'))) {
        const lines = paragraphs(shape);
        const k = boxes.indexOf(shape);
        if (k < 0) out.push(...lines.map((l) => `(table) ${l}`));
        else out.push(`[${i + 1}.${k + 1}] ${lines[0] ?? '(empty)'}`, ...lines.slice(1).map((l) => `    ${l}`));
      }
    }
    let title = '';
    const body: string[] = [];
    for (const shape of shapes(find(slide, 'spTree'))) {
      const type = find(child(shape, 'nvSpPr'), 'ph')?.attrs.type;
      const lines = paragraphs(shape);
      if (!title && (type === 'title' || type === 'ctrTitle')) title = lines.join(' ');
      // Slide numbers, dates and footers repeat on every slide and say nothing.
      else if (type !== 'sldNum' && type !== 'dt' && type !== 'ftr') body.push(...lines);
    }
    if (!numbered) out.push(`## Slide ${i + 1}${title ? `: ${title}` : ''}`, ...body);
    const notesPart = [...rels(zip, part).values()].find((r) => r.type.endsWith('/notesSlide'))?.target;
    const notes = notesPart ? xml(zip, notesPart) : undefined;
    const notesBody = notes && shapes(find(notes, 'spTree')).find((s) => find(child(s, 'nvSpPr'), 'ph')?.attrs.type === 'body');
    const said = notesBody ? paragraphs(notesBody).join('\n') : '';
    if (said) out.push(`Notes: ${said}`);
    out.push('');
  });
  return out.join('\n').trimEnd();
}

/** The shapes and tables of a slide in order, groups opened up. */
function shapes(tree: El | undefined): El[] {
  const out: El[] = [];
  for (const el of tree ? elements(tree) : []) {
    if (el.name === 'sp' || el.name === 'graphicFrame') out.push(el);
    else if (el.name === 'grpSp') out.push(...shapes(el));
    else if (el.name === 'AlternateContent') out.push(...shapes(child(el, 'Choice')));
  }
  return out;
}

/** A shape's lines of text: its paragraphs, or a table's rows with cells between bars. */
function paragraphs(shape: El): string[] {
  const table = find(shape, 'tbl');
  if (table) return children(table, 'tr').map((tr) => children(tr, 'tc').map((tc) => findAll(tc, 'p').map((p) => textOf(p).trim()).join(' ')).join(' | '));
  return findAll(child(shape, 'txBody') ?? shape, 'p').map((p) => textOf(p).trim()).filter(Boolean);
}

/**
 * A workbook's cells, by sheet and address, as formula.ts works them out (plan-1.8.md H5): text, numbers, and a formula
 * as its formula (whatever value Excel last saved with it is left out, so it is worked out afresh). TRUE and FALSE come
 * back as text; an empty cell is left out.
 */
export function bookCells(buf: Buffer): Book {
  const zip = readZip(buf);
  const book = xml(zip, 'xl/workbook.xml');
  if (!book) throw new Error('This .xlsx has no workbook part.');
  const links = rels(zip, 'xl/workbook.xml');
  const sst = xml(zip, 'xl/sharedStrings.xml');
  const shared = sst ? children(find(sst, 'sst') ?? sst, 'si').map((si) => textOf(si, 't', ['rPh'])) : [];
  return findAll(book, 'sheet').map((s) => {
    const target = links.get(s.attrs.id)?.target;
    const sheet = target ? xml(zip, target) : undefined;
    const cells: Record<string, Cell> = {};
    for (const c of sheet ? findAll(sheet, 'c') : []) {
      const ref = c.attrs.r;
      if (!ref) continue;
      const f = child(c, 'f');
      const formula = f ? ownText(f) : '';
      if (formula) {
        cells[ref] = { f: `=${formula}` };
        continue;
      }
      const v = child(c, 'v');
      const raw = v ? ownText(v) : undefined;
      const t = c.attrs.t;
      if (t === 'inlineStr') cells[ref] = textOf(child(c, 'is') ?? c, 't', ['rPh']);
      else if (t === 's') cells[ref] = shared[Number(raw)] ?? '';
      else if (t === 'b') cells[ref] = raw === '1' ? 'TRUE' : 'FALSE';
      else if (t === 'str' || t === 'e') cells[ref] = raw ?? '';
      else if (raw !== undefined && raw !== '') cells[ref] = Number(raw);
    }
    return { name: s.attrs.name ?? '', cells };
  });
}
