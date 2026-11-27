import { computeBook, type Value } from './formula';
import { dataUri } from './picture';
import type { Block, DocSpec, SheetSpec, SlideSpec } from './specs';
import { letters, sheetCells } from './xlsx';

/** How much of a document, a sheet or a list the thumbnail has room for. */
const DOC_BLOCKS = 14;
const SHEET_ROWS = 14;
const SHEET_COLS = 8;
const SLIDE_BULLETS = 6;

/**
 * A page that looks roughly like the first page of a made document, the top of a workbook's first sheet or a deck's
 * first slide, drawn from the same spec the file was made from (road-to-1.3.md C1). The result card photographs it for
 * its 280-pixel thumbnail. Everything is inline: no script, no outside address, pictures as data: addresses, and a
 * content policy that would stop anything else anyway.
 */
export function previewHtml(kind: 'docx', spec: DocSpec, images: (rel: string) => Buffer): string;
export function previewHtml(kind: 'xlsx', spec: SheetSpec, images: (rel: string) => Buffer): string;
export function previewHtml(kind: 'pptx', spec: SlideSpec, images: (rel: string) => Buffer): string;
export function previewHtml(kind: 'docx' | 'xlsx' | 'pptx', spec: DocSpec | SheetSpec | SlideSpec, images: (rel: string) => Buffer): string {
  const body = kind === 'docx' ? docPage(spec as DocSpec, images) : kind === 'xlsx' ? sheetPage(spec as SheetSpec) : slidePage(spec as SlideSpec, images);
  return `<!doctype html><html><head><meta charset="utf-8">`
    + `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'">`
    + `<style>${CSS}</style></head><body class="${kind}">${body}</body></html>`;
}

const CSS = [
  '*{box-sizing:border-box;margin:0;padding:0}',
  'body{width:560px;background:#e5e7eb;font-family:"Segoe UI","Microsoft YaHei",sans-serif;color:#1f2937}',
  '.page{margin:16px;background:#fff;height:744px;padding:40px 44px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.2);font-size:12px;line-height:1.45}',
  '.page h1{font-size:22px;margin:0 0 10px}.page h2{font-size:17px;margin:12px 0 6px}.page h3{font-size:14px;margin:10px 0 4px}',
  '.page .title{font-size:28px;font-weight:600;margin-bottom:14px}.page p{margin:0 0 8px}.page ul,.page ol{margin:0 0 8px 20px}',
  '.page table{border-collapse:collapse;width:100%;margin:0 0 8px}.page td,.page th{border:1px solid #9ca3af;padding:2px 5px;text-align:left}',
  '.page figure{text-align:center;margin:0 0 8px}.page img{max-width:100%;max-height:300px}.page figcaption{font-style:italic;color:#4b5563}',
  '.sheet{margin:16px;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.2);font-size:12px}',
  '.sheet .tab{padding:6px 10px;background:#f3f4f6;font-weight:600;border-bottom:1px solid #d1d5db}',
  '.sheet table{border-collapse:collapse;width:100%;table-layout:fixed}.sheet td,.sheet th{border:1px solid #d1d5db;padding:3px 5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
  '.sheet th{background:#f9fafb;font-weight:700}.sheet td.n{text-align:right}',
  '.slide{margin:16px;background:#fff;height:297px;padding:22px 28px;box-shadow:0 1px 4px rgba(0,0,0,.2);position:relative;overflow:hidden}',
  '.slide h1{font-size:24px;border-left:5px solid var(--accent);padding-left:10px;color:var(--title);margin-bottom:14px}',
  '.slide.cover{display:flex;flex-direction:column;justify-content:center;text-align:center}',
  '.slide.cover h1{border:0;padding:0;font-size:32px;margin-bottom:8px}.slide.cover .bar{width:160px;height:4px;background:var(--accent);margin:0 auto 12px}',
  '.slide ul{margin-left:22px;font-size:16px;line-height:1.5}.slide .cols{display:flex;gap:20px}.slide .cols ul{flex:1}',
  '.slide .pic{text-align:center}.slide img{max-width:100%;max-height:200px}',
].join('');

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** **bold** and *italic*, as in the document. */
const inline = (s: string) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\*(.+?)\*/g, '<i>$1</i>');

function docPage(spec: DocSpec, images: (rel: string) => Buffer): string {
  const parts: string[] = spec.title ? [`<div class="title">${esc(spec.title)}</div>`] : [];
  const blocks: Block[] = [];
  for (const b of spec.blocks) {
    if ('pageBreak' in b || blocks.length >= DOC_BLOCKS) break;
    blocks.push(b);
  }
  for (const b of blocks) {
    if ('h' in b) parts.push(`<h${b.h}>${esc(b.text)}</h${b.h}>`);
    else if ('p' in b) parts.push(`<p>${inline(b.p)}</p>`);
    else if ('list' in b) parts.push(`<${b.ordered ? 'ol' : 'ul'}>${b.list.map((i) => `<li>${inline(i)}</li>`).join('')}</${b.ordered ? 'ol' : 'ul'}>`);
    else if ('table' in b) {
      parts.push(`<table><tr>${b.table.head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr>`
        + b.table.rows.slice(0, 12).map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('') + '</table>');
    } else if ('image' in b) {
      parts.push(`<figure><img src="${dataUri(images(b.image))}" alt="">${b.caption ? `<figcaption>${esc(b.caption)}</figcaption>` : ''}</figure>`);
    }
  }
  return `<div class="page">${parts.join('')}</div>`;
}

function sheetPage(spec: SheetSpec): string {
  const s = spec.sheets[0];
  const cols = s.columns.slice(0, SHEET_COLS);
  // A formula shows what it comes to, as Excel will show it on opening (plan-1.8.md H5): money with two places.
  const worked = computeBook(sheetCells(spec))[s.name];
  const value = (v: Value | undefined, i: number) => {
    if (v === undefined || (typeof v === 'object' && v !== null)) return `<td class="n">${esc(v ? v.error : '')}</td>`;
    if (typeof v !== 'number') return `<td>${esc(String(v))}</td>`;
    return `<td class="n">${cols[i].format === 'money' ? v.toFixed(2) : String(Math.round(v * 1e6) / 1e6)}</td>`;
  };
  const cell = (c: SheetSpec['sheets'][number]['rows'][number][number] | undefined, r: number, i: number) =>
    c == null ? '<td></td>' : typeof c === 'number' ? `<td class="n">${c}</td>` : typeof c === 'object' ? value(worked[`${letters(i)}${r + 2}`], i) : `<td>${esc(c)}</td>`;
  return `<div class="sheet"><div class="tab">${esc(s.name)}</div><table>`
    + `<tr>${cols.map((c) => `<th>${esc(c.header)}</th>`).join('')}</tr>`
    + s.rows.slice(0, SHEET_ROWS).map((row, r) => `<tr>${cols.map((_, i) => cell(row[i], r, i)).join('')}</tr>`).join('')
    + '</table></div>';
}

function slidePage(spec: SlideSpec, images: (rel: string) => Buffer): string {
  const s = spec.slides[0];
  const accent = `#${(spec.accent ?? '2F6FDE').replace(/^#/, '')}`;
  const style = `--accent:${accent};--title:${spec.accent ? accent : '#1F2937'}`;
  const list = (items?: string[]) => (items?.length ? `<ul>${items.slice(0, SLIDE_BULLETS).map((b) => `<li>${esc(b)}</li>`).join('')}</ul>` : '');
  if (s.layout === 'title') {
    return `<div class="slide cover" style="${style}"><h1>${esc(s.title)}</h1><div class="bar"></div>${(s.bullets ?? []).slice(0, 2).map((b) => `<p>${esc(b)}</p>`).join('')}</div>`;
  }
  const body = s.layout === 'image' ? (s.image ? `<div class="pic"><img src="${dataUri(images(s.image))}" alt=""></div>` : '')
    : s.layout === 'two' ? `<div class="cols">${list(s.bullets) || '<ul></ul>'}${list(s.right)}</div>`
    : list(s.bullets);
  return `<div class="slide" style="${style}"><h1>${esc(s.title)}</h1>${body}</div>`;
}

/**
 * The preview of a file the shop changed rather than made (road-to-1.3.md C3), drawn from what read_document reads in
 * it: Word's headings, paragraphs, lists and tables; the first sheet with its first row as the header; the first slide.
 * Rough, as the thumbnail is: pictures and formatting are not in the text.
 */
export function previewOfText(kind: 'docx' | 'xlsx' | 'pptx', text: string): string {
  const none = () => Buffer.alloc(0);
  const lines = text.split('\n');
  if (kind === 'docx') {
    const blocks: Block[] = [];
    for (const line of lines) {
      const last = blocks[blocks.length - 1];
      const h = /^(#{1,6}) (.*)$/.exec(line);
      if (!line.trim() || /^\| (?:--- \| )*--- \|$/.test(line)) continue;
      if (h) blocks.push({ h: Math.min(3, h[1].length) as 1 | 2 | 3, text: h[2] });
      else if (line.startsWith('- ')) {
        if (last && 'list' in last) last.list.push(line.slice(2));
        else blocks.push({ list: [line.slice(2)] });
      } else if (line.startsWith('| ')) {
        const cells = line.slice(2, -2).split(/(?<!\\) \| /).map((c) => c.replace(/\\\|/g, '|'));
        if (last && 'table' in last) last.table.rows.push(cells);
        else blocks.push({ table: { head: cells, rows: [] } });
      } else blocks.push({ p: line.replace(/\*/g, '') });
    }
    return previewHtml('docx', { blocks }, none);
  }
  if (kind === 'xlsx') {
    const start = lines.findIndex((l) => l.startsWith('## '));
    const end = lines.findIndex((l, i) => i > start && !l);
    const rows = csvRows(lines.slice(start + 1, end < 0 ? undefined : end).join('\n'));
    const head = rows[0] ?? [];
    const cell = (c: string) => (c !== '' && !Number.isNaN(Number(c)) ? Number(c) : c);
    return previewHtml('xlsx', { sheets: [{ name: lines[start]?.slice(3) ?? '', columns: head.map((header) => ({ header })), rows: rows.slice(1).map((r) => r.map(cell)) }] }, none);
  }
  const slides: SlideSpec['slides'] = [];
  for (const line of lines) {
    const head = /^## Slide \d+(?:: (.*))?$/.exec(line);
    if (head) slides.push({ layout: slides.length ? 'bullets' : 'title', title: head[1] ?? '', bullets: [] });
    else if (line && !line.startsWith('Notes: ') && slides.length) slides[slides.length - 1].bullets!.push(line);
  }
  return previewHtml('pptx', { title: slides[0]?.title ?? '', slides: slides.length ? slides : [{ layout: 'title', title: '' }] }, none);
}

/** CSV as read_document writes it: commas, quotes doubled inside quoted fields, line breaks inside them kept. */
function csvRows(text: string): string[][] {
  const rows: string[][] = [[]];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; } else if (c === '"') quoted = false; else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { rows[rows.length - 1].push(field); field = ''; } else if (c === '\n') { rows[rows.length - 1].push(field); field = ''; rows.push([]); } else field += c;
  }
  rows[rows.length - 1].push(field);
  return rows.filter((r) => r.some(Boolean));
}
