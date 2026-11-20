import { zip } from '../zip';
import { formulaProblem } from './formula';
import { docxParagraphs, rels, slideBoxes, slideParts } from './read';
import { readZip, type ZipEntries } from './unzip';
import { xmlText } from './xlsx';
import { child, children, elements, findAll, parseXml, tagEnd, type El } from './xml';

/**
 * Changing a Word, PowerPoint or Excel file the user handed over (road-to-1.3.md C3). The staff never touch the XML:
 * they name what to change by the numbers read_document gives, and only that stretch of the part is rewritten, every
 * other byte of it and every other part left exactly as it was. Reasons are for Claude, in English.
 */

export type DocxEdit = { n: number; text: string } | { n: number; delete: true } | { after: number; text: string; like?: number };
export type PptxEdit = { slide: number; box: number; text: string };
export type XlsxEdit = { sheet: string; cell: string; value: string | number | { f: string } };
/** Who the tracked changes are by, and when (an ISO time, whole seconds). */
export type Reviser = { author: string; date: string };

/** A workbook this does not change: rewriting its cells could leave what hangs off them behind. */
export class NotEditable extends Error {}

type Splice = { start: number; end: number; text: string };

/** The text with each stretch replaced, the last first so the earlier positions still hold. */
function apply(text: string, splices: Splice[]): string {
  let out = text;
  for (const s of [...splices].sort((a, b) => b.start - a.start || b.end - a.end)) out = out.slice(0, s.start) + s.text + out.slice(s.end);
  return out;
}

/** The package again, with the named parts changed or (null) left out; everything else goes back as it came out. */
function repack(parts: ZipEntries, changed: Map<string, string | null>): Buffer {
  const entries: { name: string; data: Buffer | string }[] = [];
  for (const [name, get] of parts) {
    const now = changed.get(name);
    if (now === null) continue;
    entries.push({ name, data: now ?? get() });
  }
  return zip(entries);
}

const partText = (parts: ZipEntries, name: string, what: string): string => {
  const get = parts.get(name);
  if (!get) throw new Error(`This file has no ${what}.`);
  return get().toString('utf8');
};

/** An element's text as written, tags and all. */
const raw = (text: string, el: El | undefined) => (el ? text.slice(el.start, el.end) : '');
/** The prefix the part uses for an element (w, a, x), with its colon, or nothing for the default namespace. */
const prefixOf = (text: string, el: El) => /^<([^\s/>:]+:)?/.exec(text.slice(el.start))?.[1] ?? '';

// Word

/** Words, runs of spaces, and every other character on its own (a Chinese character is a word of its own). */
const tokens = (s: string) => s.match(/[\p{L}\p{N}_'’-]+|\s+|[\s\S]/gu) ?? [];
const CJK = /[　-鿿가-힯豈-﫿]/;

type Piece = { op: '=' | '-' | '+'; text: string };

/** The old text to the new, as kept, deleted and inserted pieces, word by word. */
export function diffWords(before: string, after: string): Piece[] {
  // Latin words are one token; Chinese, Japanese and Korean text is compared character by character.
  const split = (s: string) => tokens(s).flatMap((t) => (CJK.test(t) ? [...t] : [t]));
  const a = split(before);
  const b = split(after);
  let head = 0;
  while (head < a.length && head < b.length && a[head] === b[head]) head++;
  let tail = 0;
  while (tail < a.length - head && tail < b.length - head && a[a.length - 1 - tail] === b[b.length - 1 - tail]) tail++;
  const am = a.slice(head, a.length - tail);
  const bm = b.slice(head, b.length - tail);
  const middle: Piece[] = [];
  if (am.length * bm.length > 250_000) {
    // Too long to compare word by word: the changed middle goes as one deletion and one insertion.
    middle.push({ op: '-', text: am.join('') }, { op: '+', text: bm.join('') });
  } else {
    // Longest common subsequence, walked from the start.
    const w = bm.length + 1;
    const lcs = new Uint32Array((am.length + 1) * w);
    for (let i = am.length - 1; i >= 0; i--) {
      for (let j = bm.length - 1; j >= 0; j--) {
        lcs[i * w + j] = am[i] === bm[j] ? lcs[(i + 1) * w + j + 1] + 1 : Math.max(lcs[(i + 1) * w + j], lcs[i * w + j + 1]);
      }
    }
    let i = 0;
    let j = 0;
    while (i < am.length || j < bm.length) {
      if (i < am.length && j < bm.length && am[i] === bm[j]) middle.push({ op: '=', text: am[i++] }), j++;
      else if (j < bm.length && (i === am.length || lcs[i * w + j + 1] >= lcs[(i + 1) * w + j])) middle.push({ op: '+', text: bm[j++] });
      else middle.push({ op: '-', text: am[i++] });
    }
  }
  const pieces: Piece[] = [{ op: '=', text: a.slice(0, head).join('') }, ...middle, { op: '=', text: a.slice(a.length - tail).join('') }];
  // Neighbours of the same kind joined, empty ones dropped; a deletion goes before the insertion that replaces it.
  const out: Piece[] = [];
  for (const p of pieces) {
    if (!p.text) continue;
    const last = out[out.length - 1];
    if (last && last.op === p.op) last.text += p.text;
    else out.push({ ...p });
  }
  for (let k = 1; k < out.length; k++) {
    if (out[k - 1].op === '+' && out[k].op === '-') [out[k - 1], out[k]] = [out[k], out[k - 1]];
  }
  return out;
}

/** What a paragraph may hold to be rewritten: its properties, plain runs, proofing marks and bookmarks. */
const PARAGRAPH_KEEPS = new Set(['pPr', 'r', 'proofErr', 'bookmarkStart', 'bookmarkEnd', 'permStart', 'permEnd']);
/** What a run may hold: text, tabs, line breaks and its formatting. A page break, a picture or a field is more than that. */
const RUN_KEEPS = new Set(['rPr', 't', 'tab', 'br', 'cr', 'lastRenderedPageBreak', 'softHyphen', 'noBreakHyphen']);
/** A change already tracked, of text or of formatting. */
const TRACKED = ['ins', 'del', 'moveFrom', 'moveTo', 'rPrChange', 'pPrChange', 'sectPrChange'];

function plainParagraph(p: El): boolean {
  if (TRACKED.some((name) => findAll(p, name).length)) return false;
  return elements(p).every((k) => PARAGRAPH_KEEPS.has(k.name)
    && (k.name !== 'r' || elements(k).every((r) => RUN_KEEPS.has(r.name) && !(r.name === 'br' && r.attrs.type && r.attrs.type !== 'textWrapping'))));
}

/** A plain paragraph's text: tabs as tabs, line breaks as new lines. */
function paragraphText(p: El): string {
  let out = '';
  for (const r of children(p, 'r')) {
    for (const k of r.kids) {
      if (typeof k === 'string') continue;
      if (k.name === 't') out += k.kids.filter((s): s is string => typeof s === 'string').join('');
      else if (k.name === 'tab') out += '\t';
      else if (k.name === 'br' || k.name === 'cr') out += '\n';
    }
  }
  return out;
}

/**
 * Changes paragraphs of a Word document by their numbers (road-to-1.3.md C3), each change a tracked change Word lets the
 * user accept or reject: `text` rewrites a paragraph (only the words that differ are marked), `delete` takes it out mark
 * and all, `after` adds a new one after paragraph n (0 for the very start), looking like paragraph `like` (n by default).
 * A changed paragraph keeps its paragraph properties and the formatting of its first run; the rest of its formatting may
 * go, as the tool tells the staff. Every number is the paragraph's in the file as handed in.
 */
export function editDocx(buf: Buffer, edits: DocxEdit[], who: Reviser): Buffer {
  const parts = readZip(buf);
  const text = partText(parts, 'word/document.xml', 'document part');
  const paragraphs = docxParagraphs(parseXml(text));
  const at = (n: number, what = 'paragraph') => {
    if (!Number.isInteger(n) || n < 1 || n > paragraphs.length) throw new Error(`There is no ${what} ${n}: the document has paragraphs 1 to ${paragraphs.length}. Use the numbers read_document gives with numbered: true.`);
    return paragraphs[n - 1];
  };
  const w = paragraphs[0] ? prefixOf(text, paragraphs[0]) : 'w:';
  let id = Math.max(0, ...[...text.matchAll(/:id="(\d+)"/g)].map((m) => Number(m[1]))) + 1;
  const mark = (tag: 'ins' | 'del') => `<${w}${tag} ${w}id="${id++}" ${w}author="${xmlText(who.author)}" ${w}date="${who.date}"`;
  const run = (rPr: string, s: string, deleted = false) => {
    const t = deleted ? 'delText' : 't';
    const body = s.split(/(\t|\n)/).map((bit) => (bit === '\t' ? `<${w}tab/>` : bit === '\n' ? `<${w}br/>` : bit ? `<${w}${t} xml:space="preserve">${xmlText(bit)}</${w}${t}>` : '')).join('');
    return `<${w}r>${rPr}${body}</${w}r>`;
  };
  const look = (p: El) => {
    const firstRun = children(p, 'r').find((r) => child(r, 't')) ?? children(p, 'r')[0];
    return { pPr: child(p, 'pPr'), rPr: raw(text, child(firstRun, 'rPr')) };
  };
  const plain = (n: number) => {
    const p = at(n);
    if (!plainParagraph(p)) throw new Error(`paragraph ${n} has a link, a picture, a field, a comment, a footnote or a tracked change, so it is not rewritten as a whole. Leave it as it is and say so, or start again from the original if you changed it before.`);
    return p;
  };
  /** The paragraph's opening tag and its properties, with its mark (the end of the paragraph) marked too when asked. */
  const opening = (p: El, markTag?: 'ins' | 'del') => {
    const open = text.slice(p.start, tagEnd(text, p.start) + 1).replace(/\/>$/, '>');
    const pPr = child(p, 'pPr');
    if (!markTag) return open + raw(text, pPr);
    const tagged = `${mark(markTag)}/>`;
    if (!pPr) return `${open}<${w}pPr><${w}rPr>${tagged}</${w}rPr></${w}pPr>`;
    if (child(pPr, 'sectPr')) throw new Error('That paragraph ends a section of the document (its page layout changes after it), so it is not taken out; change its text instead.');
    const rPr = child(pPr, 'rPr');
    const props = raw(text, pPr);
    if (rPr) {
      const r0 = rPr.start - pPr.start;
      const inner = text.slice(rPr.start, rPr.end);
      const withMark = inner.endsWith('/>') ? `${inner.slice(0, -2)}>${tagged}</${w}rPr>` : inner.replace(/^(<[^>]*>)/, `$1${tagged}`);
      return open + props.slice(0, r0) + withMark + props.slice(r0 + inner.length);
    }
    const close = props.lastIndexOf('</');
    return props.endsWith('/>')
      ? `${open}${props.slice(0, -2)}><${w}rPr>${tagged}</${w}rPr></${w}pPr>`
      : `${open}${props.slice(0, close)}<${w}rPr>${tagged}</${w}rPr>${props.slice(close)}`;
  };
  const bookmarks = (p: El) => elements(p).filter((k) => k.name !== 'pPr' && k.name !== 'r' && k.name !== 'proofErr').map((k) => raw(text, k)).join('');

  const seen = new Set<number>();
  const splices: Splice[] = [];
  const added = new Map<number, string[]>();
  for (const e of edits) {
    if ('after' in e) {
      const where = e.after === 0 ? at(1) : at(e.after);
      const model = at(e.like ?? (e.after || 1));
      const { pPr, rPr } = look(model);
      // A new paragraph takes the style and list of the one it looks like, and its mark is the inserted part.
      const keep = pPr ? elements(pPr).filter((k) => k.name === 'pStyle' || k.name === 'numPr').map((k) => raw(text, k)).join('') : '';
      const xml = `<${w}p><${w}pPr>${keep}<${w}rPr>${mark('ins')}/></${w}rPr></${w}pPr>${mark('ins')}>${run(rPr, e.text)}</${w}ins></${w}p>`;
      const pos = e.after === 0 ? where.start : where.end;
      added.set(pos, [...(added.get(pos) ?? []), xml]);
      continue;
    }
    if (seen.has(e.n)) throw new Error(`Paragraph ${e.n} is changed twice; give each paragraph one change.`);
    seen.add(e.n);
    const p = plain(e.n);
    const { rPr } = look(p);
    const before = paragraphText(p);
    const now = 'delete' in e ? '' : e.text;
    const body = diffWords(before, now).map((piece) => (piece.op === '=' ? run(rPr, piece.text)
      : piece.op === '-' ? `${mark('del')}>${run(rPr, piece.text, true)}</${w}del>`
      : `${mark('ins')}>${run(rPr, piece.text)}</${w}ins>`)).join('');
    splices.push({ start: p.start, end: p.end, text: `${opening(p, 'delete' in e ? 'del' : undefined)}${bookmarks(p)}${body}</${w}p>` });
  }
  for (const [pos, xml] of added) splices.push({ start: pos, end: pos, text: xml.join('') });
  return repack(parts, new Map([['word/document.xml', apply(text, splices)]]));
}

// PowerPoint

/**
 * Replaces the text of text boxes, by slide and box number (road-to-1.3.md C3): one paragraph per line, each keeping the
 * paragraph properties of the old paragraph in its place (the last one for any extra) and the formatting of its first
 * run. PowerPoint has no tracked changes, so nothing marks what changed; the slides not named stay as they were.
 */
export function editPptx(buf: Buffer, edits: PptxEdit[]): Buffer {
  const parts = readZip(buf);
  const pres = parseXml(partText(parts, 'ppt/presentation.xml', 'presentation part'));
  const slides = slideParts(parts, pres);
  const bySlide = new Map<number, PptxEdit[]>();
  for (const e of edits) {
    if (!Number.isInteger(e.slide) || e.slide < 1 || e.slide > slides.length || !slides[e.slide - 1]) throw new Error(`There is no slide ${e.slide}: the deck has slides 1 to ${slides.length}.`);
    bySlide.set(e.slide, [...(bySlide.get(e.slide) ?? []), e]);
  }
  const changed = new Map<string, string>();
  for (const [n, list] of bySlide) {
    const name = slides[n - 1];
    const text = partText(parts, name, `slide ${n}`);
    const boxes = slideBoxes(parseXml(text));
    const seen = new Set<number>();
    const splices: Splice[] = [];
    for (const e of list) {
      const box = boxes[e.box - 1];
      if (!Number.isInteger(e.box) || !box) throw new Error(`There is no text box ${n}.${e.box}: slide ${n} has boxes ${n}.1 to ${n}.${boxes.length}.`);
      if (seen.has(e.box)) throw new Error(`Text box ${n}.${e.box} is changed twice; give each box one change.`);
      seen.add(e.box);
      const old = children(child(box, 'txBody'), 'p');
      const a = prefixOf(text, old[0] ?? box);
      const lines = e.text.split(/\r?\n/);
      const paragraphs = lines.map((line, i) => {
        const model = old[Math.min(i, old.length - 1)];
        const pPr = raw(text, child(model, 'pPr'));
        const rPr = raw(text, child(children(model, 'r')[0], 'rPr'));
        const end = raw(text, child(model, 'endParaRPr'));
        return `<${a}p>${pPr}${line ? `<${a}r>${rPr}<${a}t>${xmlText(line)}</${a}t></${a}r>` : ''}${end}</${a}p>`;
      }).join('');
      splices.push({ start: old[0].start, end: old[old.length - 1].end, text: paragraphs });
    }
    changed.set(name, apply(text, splices));
  }
  return repack(parts, changed);
}

// Excel

/** What a workbook may hang off its cells that a change of cells could leave wrong: charts, pivot tables, links out, tables. */
const EXTRAS = /^xl\/(charts|chartsheets|pivotTables|pivotCache|externalLinks|tables)\//i;

const ADDRESS = /^([A-Z]{1,3})([1-9]\d{0,6})$/;
const columnOf = (letters: string) => [...letters].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);

/**
 * Changes cells by sheet name and address (road-to-1.3.md C3): text, a number, or a formula that stays live, checked as
 * make_xlsx checks one. The calculation chain is dropped and the workbook asks to be recalculated on opening, so the
 * totals that depend on a changed cell come out right. A workbook with charts, pivot tables, links to other files or
 * tables is not changed at all (NotEditable): the staff write the changes down instead.
 */
export function editXlsx(buf: Buffer, edits: XlsxEdit[]): Buffer {
  const parts = readZip(buf);
  const extra = [...parts.keys()].find((name) => EXTRAS.test(name));
  if (extra) throw new NotEditable(`This workbook has ${/chart/i.test(extra) ? 'a chart' : /pivot/i.test(extra) ? 'a pivot table' : /external/i.test(extra) ? 'links to other files' : 'a table (Format as Table)'}, which changing its cells could leave wrong.`);
  const bookText = partText(parts, 'xl/workbook.xml', 'workbook part');
  const book = parseXml(bookText);
  const links = rels(parts, 'xl/workbook.xml');
  const sheets = findAll(book, 'sheet').map((s) => ({ name: s.attrs.name ?? '', part: links.get(s.attrs.id)?.target }));
  const texts = new Map<string, string>();
  for (const e of edits) {
    const sheet = sheets.find((s) => s.name.toLowerCase() === e.sheet.toLowerCase());
    if (!sheet?.part) throw new Error(`There is no sheet called "${e.sheet}"; the sheets are ${sheets.map((s) => `"${s.name}"`).join(', ')}.`);
    const address = ADDRESS.exec(e.cell.trim().toUpperCase());
    if (!address) throw new Error(`${e.cell} is not a cell address; give one like B3.`);
    if (typeof e.value === 'object') {
      const problem = formulaProblem(e.value.f);
      if (problem) throw new Error(`The formula ${e.value.f} ${problem}; formulas may not fetch from the web, run programs or point at other files.`);
    }
    const text = texts.get(sheet.part) ?? partText(parts, sheet.part, `sheet "${sheet.name}"`);
    texts.set(sheet.part, setCell(text, address[0], columnOf(address[1]), Number(address[2]), e.value, sheet.name));
  }
  // A formula's kept value may no longer hold once a cell it reads has changed, and a reader that does not calculate
  // (read_document, the card's thumbnail, a phone's preview) would show the old one. So every formula in every sheet
  // goes without a value, as make_xlsx writes them, and Excel works them all out on opening.
  for (const name of parts.keys()) {
    if (/^xl\/worksheets\/[^/]+\.xml$/i.test(name)) texts.set(name, withoutValues(texts.get(name) ?? partText(parts, name, name)));
  }
  const changed = new Map<string, string | null>(texts);
  // The chain lists the formula cells in the order Excel last worked them out; one that no longer holds a formula makes
  // Excel repair the file, so it goes, and Excel builds it again.
  const chain = [...parts.keys()].find((name) => name.toLowerCase() === 'xl/calcchain.xml');
  if (chain) {
    changed.set(chain, null);
    const types = partText(parts, '[Content_Types].xml', 'content types');
    changed.set('[Content_Types].xml', types.replace(/<Override\b[^>]*calcChain[^>]*\/>/gi, ''));
    const relsName = 'xl/_rels/workbook.xml.rels';
    changed.set(relsName, partText(parts, relsName, 'workbook relationships').replace(/<Relationship\b[^>]*calcChain[^>]*\/>/gi, ''));
  }
  changed.set('xl/workbook.xml', recalcOnLoad(bookText, book));
  return repack(parts, changed);
}

/** A sheet's formula cells without their last worked-out value, or the type that value had. */
function withoutValues(text: string): string {
  const splices: Splice[] = [];
  for (const c of findAll(parseXml(text), 'c')) {
    const v = child(c, 'v');
    if (!child(c, 'f') || !v) continue;
    splices.push({ start: v.start, end: v.end, text: '' });
    const open = text.slice(c.start, tagEnd(text, c.start) + 1);
    const typed = /\s+t\s*=\s*["'][^"']*["']/.exec(open);
    if (typed) splices.push({ start: c.start + typed.index, end: c.start + typed.index + typed[0].length, text: '' });
  }
  return apply(text, splices);
}

/** The workbook asking Excel for a full calculation when it opens. */
function recalcOnLoad(text: string, book: El): string {
  const calc = findAll(book, 'calcPr')[0];
  if (calc) {
    const tag = text.slice(calc.start, tagEnd(text, calc.start) + 1);
    const now = /\bfullCalcOnLoad\s*=\s*["'][^"']*["']/.test(tag)
      ? tag.replace(/\bfullCalcOnLoad\s*=\s*["'][^"']*["']/, 'fullCalcOnLoad="1"')
      : tag.replace(/^(<[^\s/>]+)/, '$1 fullCalcOnLoad="1"');
    return text.slice(0, calc.start) + now + text.slice(calc.start + tag.length);
  }
  // calcPr comes after the sheets and the defined names.
  const root = elements(book)[0];
  const before = [...elements(root)].reverse().find((k) => k.name === 'definedNames' || k.name === 'sheets');
  if (!before) throw new Error('This workbook has no list of sheets.');
  const p = prefixOf(text, root);
  return `${text.slice(0, before.end)}<${p}calcPr fullCalcOnLoad="1"/>${text.slice(before.end)}`;
}

/** One cell of a sheet's XML set to a value, its style kept; the row or the cell made when it is not there yet. */
function setCell(text: string, ref: string, col: number, row: number, value: XlsxEdit['value'], sheet: string): string {
  const root = parseXml(text);
  const data = findAll(root, 'sheetData')[0];
  if (!data) throw new Error(`Sheet "${sheet}" has no cells part.`);
  const p = prefixOf(text, data);
  const rows = children(data, 'row');
  if (rows.some((r) => !r.attrs.r)) throw new Error(`Sheet "${sheet}" does not number its rows, so cells cannot be placed in it.`);
  const cellXml = (style: string) => {
    const s = style ? ` s="${style}"` : '';
    if (typeof value === 'object') return `<${p}c r="${ref}"${s}><${p}f>${xmlText(value.f.replace(/^=/, ''))}</${p}f></${p}c>`;
    if (typeof value === 'number') return `<${p}c r="${ref}"${s}><${p}v>${value}</${p}v></${p}c>`;
    if (value === '') return `<${p}c r="${ref}"${s}/>`;
    return `<${p}c r="${ref}"${s} t="inlineStr"><${p}is><${p}t xml:space="preserve">${xmlText(value)}</${p}t></${p}is></${p}c>`;
  };
  const target = rows.find((r) => Number(r.attrs.r) === row);
  if (!target) {
    const next = rows.find((r) => Number(r.attrs.r) > row);
    const xml = `<${p}row r="${row}">${cellXml('')}</${p}row>`;
    if (next) return text.slice(0, next.start) + xml + text.slice(next.start);
    const inner = raw(text, data);
    if (inner.endsWith('/>')) return text.slice(0, data.start) + `${inner.slice(0, -2)}>${xml}</${p}sheetData>` + text.slice(data.end);
    const close = text.lastIndexOf('</', data.end - 1);
    return text.slice(0, close) + xml + text.slice(close);
  }
  const cells = children(target, 'c');
  if (cells.some((c) => !c.attrs.r)) throw new Error(`Row ${row} of sheet "${sheet}" does not name its cells, so cells cannot be placed in it.`);
  const cell = cells.find((c) => c.attrs.r.toUpperCase() === ref);
  if (cell) {
    const f = child(cell, 'f');
    if (f && (f.attrs.t === 'array' || (f.attrs.t === 'shared' && f.attrs.ref))) {
      throw new Error(`${ref} on sheet "${sheet}" starts a formula that fills other cells too; change those cells one by one, or leave it.`);
    }
    return text.slice(0, cell.start) + cellXml(cell.attrs.s ?? '') + text.slice(cell.end);
  }
  // A new cell in a row: before the first one to its right, and the row's span (a hint) dropped, as it may no longer hold.
  const right = cells.find((c) => columnOf(ADDRESS.exec(c.attrs.r.toUpperCase())?.[1] ?? 'A') > col);
  const open = text.slice(target.start, tagEnd(text, target.start) + 1);
  const opened = open.replace(/\s+spans\s*=\s*["'][^"']*["']/, '').replace(/\/>$/, '>');
  if (open.endsWith('/>')) return text.slice(0, target.start) + opened + cellXml('') + `</${p}row>` + text.slice(target.end);
  const at = right ? right.start : text.lastIndexOf('</', target.end - 1);
  return text.slice(0, target.start) + opened + text.slice(target.start + open.length, at) + cellXml('') + text.slice(at);
}
