import { zip } from '../zip';
import type { Cell, ColumnFormat, SheetSpec } from './specs';

/**
 * Writes a workbook from a SheetSpec as plain SpreadsheetML (road-to-1.3.md C1). The parts are the fewest Excel opens
 * without asking to repair: content types, the workbook, its sheets and a style sheet. Text goes in as inline strings,
 * so there is no shared string table to keep in step, and formulas go in without a value: Excel works them out on
 * opening, since the workbook asks for a full calculation on load.
 */
export function makeXlsx(spec: SheetSpec): Buffer {
  const seen = new Set<string>();
  for (const s of spec.sheets) {
    // Excel compares sheet names without case and refuses a workbook with two the same.
    if (seen.has(s.name.toLowerCase())) throw new Error(`Two sheets are both called "${s.name}"; give each its own name.`);
    seen.add(s.name.toLowerCase());
  }
  const n = spec.sheets.length;
  const sheetList = spec.sheets.map((s, i) => ({ name: s.name, part: `xl/worksheets/sheet${i + 1}.xml`, body: sheetXml(s, i === 0) }));
  return zip([
    {
      name: '[Content_Types].xml',
      data: `${HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">`
        + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        + '<Default Extension="xml" ContentType="application/xml"/>'
        + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
        + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
        + sheetList.map((s) => `<Override PartName="/${s.part}" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')
        + '</Types>',
    },
    {
      name: '_rels/.rels',
      data: `${HEAD}<Relationships xmlns="${PKG_RELS}"><Relationship Id="rId1" Type="${DOC_RELS}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    },
    {
      name: 'xl/workbook.xml',
      data: `${HEAD}<workbook xmlns="${MAIN}" xmlns:r="${DOC_RELS}"><bookViews><workbookView/></bookViews><sheets>`
        + sheetList.map((s, i) => `<sheet name="${esc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')
        + '</sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>',
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      data: `${HEAD}<Relationships xmlns="${PKG_RELS}">`
        + sheetList.map((s, i) => `<Relationship Id="rId${i + 1}" Type="${DOC_RELS}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')
        + `<Relationship Id="rId${n + 1}" Type="${DOC_RELS}/styles" Target="styles.xml"/></Relationships>`,
    },
    { name: 'xl/styles.xml', data: STYLES },
    ...sheetList.map((s) => ({ name: s.part, data: s.body })),
  ]);
}

const HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const PKG_RELS = 'http://schemas.openxmlformats.org/package/2006/relationships';
const DOC_RELS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

// The cell styles, by index in cellXfs: 0 plain, 1 the bold header, then one for each column format. Custom number
// formats start at 164, past Excel's built-in ones.
const FORMATS: ColumnFormat[] = ['text', 'number', 'money', 'date', 'percent'];
const NUM_FMT: Record<ColumnFormat, number> = { text: 49, number: 0, money: 164, date: 165, percent: 166 };
const styleOf = (format: ColumnFormat | undefined) => (format ? 2 + FORMATS.indexOf(format) : 0);
const STYLES = `${HEAD}<styleSheet xmlns="${MAIN}">`
  + '<numFmts count="3"><numFmt numFmtId="164" formatCode="#,##0.00"/><numFmt numFmtId="165" formatCode="yyyy-mm-dd"/><numFmt numFmtId="166" formatCode="0.0%"/></numFmts>'
  + '<fonts count="2"><font><sz val="11"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font></fonts>'
  + '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>'
  + '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
  + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
  + `<cellXfs count="${2 + FORMATS.length}"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>`
  + '<xf numFmtId="49" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyNumberFormat="1"/>'
  + FORMATS.map((f) => `<xf numFmtId="${NUM_FMT[f]}" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>`).join('')
  + '</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';

function sheetXml(sheet: SheetSpec['sheets'][number], first: boolean): string {
  const cols = sheet.columns;
  const pane = sheet.freezeHeader ? '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/>' : '';
  const widths = cols.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.width ?? Math.min(60, Math.max(12, c.header.length + 2))}" customWidth="1"/>`).join('');
  const header = `<row r="1">${cols.map((c, i) => text(`${letters(i)}1`, c.header, 1)).join('')}</row>`;
  const rows = sheet.rows.map((row, r) => `<row r="${r + 2}">${row.map((cell, i) => cellXml(`${letters(i)}${r + 2}`, cell, cols[i]?.format)).join('')}</row>`).join('');
  return `${HEAD}<worksheet xmlns="${MAIN}" xmlns:r="${DOC_RELS}">`
    + `<sheetViews><sheetView${first ? ' tabSelected="1"' : ''} workbookViewId="0">${pane}</sheetView></sheetViews>`
    + `<sheetFormatPr defaultRowHeight="15"/><cols>${widths}</cols><sheetData>${header}${rows}</sheetData></worksheet>`;
}

function cellXml(ref: string, cell: Cell, format: ColumnFormat | undefined): string {
  const s = styleOf(format);
  if (typeof cell === 'object') return `<c r="${ref}" s="${s}"><f>${esc(cell.f.replace(/^=/, ''))}</f></c>`;
  if (typeof cell === 'number') return `<c r="${ref}" s="${s}"><v>${cell}</v></c>`;
  // A date column's 2026-11-19 becomes the day number Excel keeps dates as, so it sorts and sums like a date.
  const day = format === 'date' ? serial(cell) : undefined;
  if (day !== undefined) return `<c r="${ref}" s="${s}"><v>${day}</v></c>`;
  return text(ref, cell, s);
}

const text = (ref: string, value: string, s: number) =>
  `<c r="${ref}" s="${s}" t="inlineStr"><is><t${/^\s|\s$/.test(value) ? ' xml:space="preserve"' : ''}>${esc(value)}</t></is></c>`;

/** 2026-11-19 or 2026-11-19 14:30 as an Excel serial day; anything else stays text. */
function serial(value: string): number | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(value.trim());
  if (!m) return undefined;
  const ms = Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0));
  return Number.isNaN(ms) ? undefined : ms / 86_400_000 + 25569;
}

/** 0 -> A, 26 -> AA. */
function letters(i: number): string {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

/** Escaped for XML, without the control characters XML 1.0 cannot hold at all (Excel would ask to repair). U+FFFE and U+FFFF are written as escapes and changed with a shell edit: the invisible-character hook removes them otherwise. */
const esc = (s: string) => s
  .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g, '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
