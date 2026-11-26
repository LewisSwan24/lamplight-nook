import { zip } from '../zip';
import { formulaProblem, type Book } from './formula';
import type { Cell, ChartSpec, ColumnFormat, SheetSpec } from './specs';

/**
 * Writes a workbook from a SheetSpec as plain SpreadsheetML (road-to-1.3.md C1). The parts are the fewest Excel opens
 * without asking to repair: content types, the workbook, its sheets and a style sheet. Text goes in as inline strings,
 * so there is no shared string table to keep in step, and formulas go in without a value: Excel works them out on
 * opening, since the workbook asks for a full calculation on load.
 * Since plan-1.8.md H5 a sheet can carry charts, each a drawing part pointing at a chart part over ranges of the
 * workbook, and a column can offer a drop-down list to pick from.
 */
export function makeXlsx(spec: SheetSpec): Buffer {
  const seen = new Set<string>();
  for (const s of spec.sheets) {
    // Excel compares sheet names without case and refuses a workbook with two the same.
    if (seen.has(s.name.toLowerCase())) throw new Error(`Two sheets are both called "${s.name}"; give each its own name.`);
    seen.add(s.name.toLowerCase());
  }
  const n = spec.sheets.length;
  const names = spec.sheets.map((s) => s.name);
  // Charts are numbered across the workbook; a sheet with any has one drawing of its own to hold them.
  let charts = 0;
  let drawings = 0;
  const sheetList = spec.sheets.map((s, i) => {
    const own = (s.charts ?? []).map((c) => ({ n: ++charts, spec: c, xml: chartXml(c, s.name, names) }));
    const drawing = own.length ? ++drawings : 0;
    return { name: s.name, n: i + 1, part: `xl/worksheets/sheet${i + 1}.xml`, body: sheetXml(s, i === 0, drawing > 0), charts: own, drawing, columns: s.columns.length };
  });
  const drawn = sheetList.filter((s) => s.drawing);
  const allCharts = sheetList.flatMap((s) => s.charts);
  return zip([
    {
      name: '[Content_Types].xml',
      data: `${HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">`
        + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        + '<Default Extension="xml" ContentType="application/xml"/>'
        + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
        + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
        + sheetList.map((s) => `<Override PartName="/${s.part}" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')
        + drawn.map((s) => `<Override PartName="/xl/drawings/drawing${s.drawing}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>`).join('')
        + allCharts.map((c) => `<Override PartName="/xl/charts/chart${c.n}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>`).join('')
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
    ...drawn.flatMap((s) => [
      { name: `xl/worksheets/_rels/sheet${s.n}.xml.rels`, data: rels([[`${DOC_RELS}/drawing`, `../drawings/drawing${s.drawing}.xml`]]) },
      { name: `xl/drawings/drawing${s.drawing}.xml`, data: drawingXml(s.charts.map((c) => c.spec), s.columns) },
      { name: `xl/drawings/_rels/drawing${s.drawing}.xml.rels`, data: rels(s.charts.map((c) => [`${DOC_RELS}/chart`, `../charts/chart${c.n}.xml`])) },
    ]),
    ...allCharts.map((c) => ({ name: `xl/charts/chart${c.n}.xml`, data: c.xml })),
  ]);
}

/** A part's relationships, numbered rId1, rId2... in order. */
const rels = (list: [type: string, target: string][]) =>
  `${HEAD}<Relationships xmlns="${PKG_RELS}">${list.map(([type, target], i) => `<Relationship Id="rId${i + 1}" Type="${type}" Target="${target}"/>`).join('')}</Relationships>`;

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

function sheetXml(sheet: SheetSpec['sheets'][number], first: boolean, drawing: boolean): string {
  const cols = sheet.columns;
  const pane = sheet.freezeHeader ? '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/>' : '';
  const widths = cols.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.width ?? Math.min(60, Math.max(12, c.header.length + 2))}" customWidth="1"/>`).join('');
  const header = `<row r="1">${cols.map((c, i) => text(`${letters(i)}1`, c.header, 1)).join('')}</row>`;
  // An empty cell (null, or a hole) is left out, and so is a row with nothing in it.
  const rows = sheet.rows.map((row, r) => {
    const cells = Array.from(row, (cell, i) => (cell == null ? '' : cellXml(`${letters(i)}${r + 2}`, cell, cols[i]?.format))).join('');
    return cells ? `<row r="${r + 2}">${cells}</row>` : '';
  }).join('');
  // A list to pick from reaches well past the rows written, since the point of most such columns is to be filled in.
  const lists = cols.flatMap((c, i) => (c.list === undefined ? [] : [
    `<dataValidation type="list" allowBlank="1" showErrorMessage="1" sqref="${letters(i)}2:${letters(i)}${Math.max(sheet.rows.length + 1, LIST_ROWS)}"><formula1>${esc(listFormula(c.list))}</formula1></dataValidation>`,
  ]));
  return `${HEAD}<worksheet xmlns="${MAIN}" xmlns:r="${DOC_RELS}">`
    + `<sheetViews><sheetView${first ? ' tabSelected="1"' : ''} workbookViewId="0">${pane}</sheetView></sheetViews>`
    + `<sheetFormatPr defaultRowHeight="15"/><cols>${widths}</cols><sheetData>${header}${rows}</sheetData>`
    + (lists.length ? `<dataValidations count="${lists.length}">${lists.join('')}</dataValidations>` : '')
    + (drawing ? '<drawing r:id="rId1"/>' : '')
    + '</worksheet>';
}

/** How far down a column's list to pick from reaches, at least. */
const LIST_ROWS = 500;

/** A list to pick from as Excel keeps it: a range of the workbook, or the words themselves in quotes. */
function listFormula(list: string | string[]): string {
  if (typeof list === 'string') {
    const f = list.replace(/^=/, '');
    const problem = formulaProblem(f);
    if (problem) throw new Error(`The list formula ${f} ${problem}; formulas may not fetch from the web, run programs or point at other files.`);
    return f;
  }
  for (const w of list) {
    if (w.includes(',')) throw new Error(`The list word "${w}" holds a comma, which Excel reads as the end of a word; leave it out.`);
    if (w.includes('"')) throw new Error(`The list word ${w} holds a double quote, which a list cannot hold; leave it out.`);
  }
  const words = `"${list.join(',')}"`;
  if (words.length > 257) throw new Error('A list of words may be at most 255 characters together; put a longer one on a sheet and give its range.');
  return words;
}

function cellXml(ref: string, cell: Exclude<Cell, null>, format: ColumnFormat | undefined): string {
  const s = styleOf(format);
  if (typeof cell === 'object') {
    // The workbook calculates on opening (fullCalcOnLoad), so a formula that reaches outside would run the moment the
    // user opens it, sending what is in the cells along.
    const problem = formulaProblem(cell.f);
    if (problem) throw new Error(`The formula ${cell.f} ${problem}; formulas may not fetch from the web, run programs or point at other files.`);
    return `<c r="${ref}" s="${s}"><f>${esc(cell.f.replace(/^=/, ''))}</f></c>`;
  }
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
export function letters(i: number): string {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

/** Escaped for XML, without the control characters XML 1.0 cannot hold at all (Excel would ask to repair). U+FFFE and U+FFFF are written as escapes and changed with a shell edit: the invisible-character hook removes them otherwise. */
const esc = (s: string) => s
  .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g, '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The same escaping for the edit tools (edit.ts). */
export { esc as xmlText };

// Charts (plan-1.8.md H5)

const CHART = 'http://schemas.openxmlformats.org/drawingml/2006/chart';
const DML = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const XDR = 'http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing';
/** How many columns wide and rows tall a chart stands, and how far apart charts placed one below another are. */
const CHART_COLS = 8;
const CHART_ROWS = 16;

type Span = { sheet: string; c0: number; r0: number; c1: number; r1: number };
const SPAN = /^(?:'((?:[^']|'')+)'!|([^'!:]+)!)?\$?([A-Z]{1,3})\$?([1-9]\d{0,6}):\$?([A-Z]{1,3})\$?([1-9]\d{0,6})$/;

/** A chart's range, on its own sheet unless it names another of this workbook. */
function span(text: string, what: string, sheet: string, names: string[]): Span {
  const m = SPAN.exec(text.trim().replace(/^=/, ''));
  if (!m || formulaProblem(text)) throw new Error(`The chart's ${what} "${text}" is not a range of this workbook; give one like H7:H21 or 'Year'!C2:C13.`);
  const named = m[1]?.replace(/''/g, "'") ?? m[2];
  const on = named === undefined ? sheet : names.find((n) => n.toLowerCase() === named.toLowerCase());
  if (on === undefined) throw new Error(`The chart's ${what} "${text}" names a sheet this workbook does not have; give a range of one of its sheets.`);
  const col = (s: string) => [...s].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
  const [c0, c1] = [col(m[3]), col(m[5])].sort((a, b) => a - b);
  const [r0, r1] = [Number(m[4]) - 1, Number(m[6]) - 1].sort((a, b) => a - b);
  return { sheet: on, c0, r0, c1, r1 };
}

/** A range as a chart keeps it: always with its sheet, quoted, and fixed. */
const spanRef = (s: Span) => `'${s.sheet.replace(/'/g, "''")}'!$${letters(s.c0)}$${s.r0 + 1}:$${letters(s.c1)}$${s.r1 + 1}`;

/** One chart part: a pie whose slices say their share, or columns with their axes; its title on top. */
function chartXml(chart: ChartSpec, sheet: string, names: string[]): string {
  const labels = span(chart.labels, 'labels', sheet, names);
  const values = span(chart.values, 'values', sheet, names);
  const length = (s: Span, what: string) => {
    if (s.c0 !== s.c1 && s.r0 !== s.r1) throw new Error(`A chart is drawn from one column or one row; its ${what} "${what === 'labels' ? chart.labels : chart.values}" is a block.`);
    return Math.max(s.c1 - s.c0, s.r1 - s.r0) + 1;
  };
  if (length(labels, 'labels') !== length(values, 'values')) throw new Error(`A chart needs as many labels as values: ${chart.labels} and ${chart.values} differ in length.`);
  const series = `<c:idx val="0"/><c:order val="0"/><c:tx><c:v>${esc(chart.title)}</c:v></c:tx>`;
  const data = `<c:cat><c:strRef><c:f>${esc(spanRef(labels))}</c:f></c:strRef></c:cat><c:val><c:numRef><c:f>${esc(spanRef(values))}</c:f></c:numRef></c:val>`;
  const plot = chart.type === 'pie'
    ? `<c:pieChart><c:varyColors val="1"/><c:ser>${series}`
      // A slice with nothing in it says nothing: the share's format has no section for zero.
      + '<c:dLbls><c:numFmt formatCode="0%;;;" sourceLinked="0"/><c:showLegendKey val="0"/><c:showVal val="0"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="1"/><c:showBubbleSize val="0"/></c:dLbls>'
      + `${data}</c:ser><c:firstSliceAng val="0"/></c:pieChart>`
    : `<c:barChart><c:barDir val="col"/><c:grouping val="clustered"/><c:varyColors val="0"/><c:ser>${series}<c:invertIfNegative val="0"/>${data}</c:ser>`
      + '<c:gapWidth val="80"/><c:axId val="500"/><c:axId val="501"/></c:barChart>'
      + '<c:catAx><c:axId val="500"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="b"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:crossAx val="501"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/></c:catAx>'
      + '<c:valAx><c:axId val="501"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="l"/><c:majorGridlines/><c:numFmt formatCode="#,##0" sourceLinked="0"/><c:majorTickMark val="out"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:crossAx val="500"/><c:crosses val="autoZero"/><c:crossBetween val="between"/></c:valAx>';
  // A pie names its slices beside it; a single row of columns needs no key.
  const legend = chart.type === 'pie' ? '<c:legend><c:legendPos val="r"/><c:overlay val="0"/></c:legend>' : '';
  return `${HEAD}<c:chartSpace xmlns:c="${CHART}" xmlns:a="${DML}" xmlns:r="${DOC_RELS}"><c:roundedCorners val="0"/><c:chart>`
    + `<c:title><c:tx><c:rich><a:bodyPr/><a:p><a:r><a:t>${esc(chart.title)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title>`
    + `<c:autoTitleDeleted val="0"/><c:plotArea><c:layout/>${plot}</c:plotArea>${legend}<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart></c:chartSpace>`;
}

/** The drawing that places a sheet's charts: where asked, or one below another beside the table. */
function drawingXml(charts: ChartSpec[], columns: number): string {
  const anchors = charts.map((c, k) => {
    const at = c.at ? /^([A-Z]+)(\d+)$/.exec(c.at)! : undefined;
    const col = at ? [...at[1]].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1 : columns + 1;
    const row = at ? Number(at[2]) - 1 : 1 + k * (CHART_ROWS + 1);
    const corner = (c0: number, r0: number) => `<xdr:col>${c0}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${r0}</xdr:row><xdr:rowOff>0</xdr:rowOff>`;
    return `<xdr:twoCellAnchor><xdr:from>${corner(col, row)}</xdr:from><xdr:to>${corner(col + CHART_COLS, row + CHART_ROWS)}</xdr:to>`
      + `<xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${k + 2}" name="Chart ${k + 1}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr>`
      + '<xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm>'
      + `<a:graphic><a:graphicData uri="${CHART}"><c:chart xmlns:c="${CHART}" r:id="rId${k + 1}"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor>`;
  });
  return `${HEAD}<xdr:wsDr xmlns:xdr="${XDR}" xmlns:a="${DML}" xmlns:r="${DOC_RELS}">${anchors.join('')}</xdr:wsDr>`;
}

/**
 * The cells a SheetSpec writes, by sheet and address, as the workbook holds them: the header in row 1, a date column's
 * dates as day numbers, formulas with their =, empty cells left out. What formula.ts works out (plan-1.8.md H5).
 */
export function sheetCells(spec: SheetSpec): Book {
  return spec.sheets.map((s) => {
    const cells: Record<string, Cell> = {};
    s.columns.forEach((c, i) => (cells[`${letters(i)}1`] = c.header));
    s.rows.forEach((row, r) => Array.from(row).forEach((cell, i) => {
      if (cell == null) return;
      const day = s.columns[i]?.format === 'date' && typeof cell === 'string' ? serial(cell) : undefined;
      cells[`${letters(i)}${r + 2}`] = typeof cell === 'object' ? { f: `=${cell.f.replace(/^=/, '')}` } : day ?? cell;
    }));
    return { name: s.name, cells };
  });
}
