import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { computeBook, formulaProblem, type Value } from '../app/main/office/formula';
import { previewHtml } from '../app/main/office/preview';
import { bookCells, readDocument } from '../app/main/office/read';
import { officeSafe } from '../app/main/office/safe';
import type { Cell, SheetSpec } from '../app/main/office/specs';
import { readZip } from '../app/main/office/unzip';
import { makeXlsx, sheetCells } from '../app/main/office/xlsx';
import { ledgerBook } from '../tools/sim/ledger.mjs';

// The family ledger (plan-1.8.md H5): a workbook with a sheet a month, categories the user can change, a summary that
// works itself out and a pie chart of where the money went. The writer learns charts and lists to pick from, and the
// formulas it writes are worked out here the way Excel would, to show they add up.

const save = (name: string, buf: Buffer) => {
  const file = join(mkdtempSync(join(tmpdir(), 'ledger-')), name);
  writeFileSync(file, buf);
  return file;
};
const part = (buf: Buffer, name: string) => readZip(buf).get(name)?.().toString('utf8');

const spending: SheetSpec = {
  sheets: [{
    name: 'Spending',
    columns: [{ header: 'What' }, { header: 'Amount', format: 'money' }],
    rows: [['Food', 120], ['Bus', 30], ['Rent', 700], ['Total', { f: '=SUM(B2:B4)' }]],
    charts: [{ type: 'pie', title: 'Where it went', labels: 'A2:A4', values: 'B2:B4' }],
  }],
};

describe('charts in a made workbook', () => {
  it('draws a pie chart of a range, anchored beside the table, as a chart Excel recalculates', () => {
    const buf = makeXlsx(spending);
    const chart = part(buf, 'xl/charts/chart1.xml')!;
    expect(chart).toContain('<c:pieChart>');
    expect(chart).toContain("<c:cat><c:strRef><c:f>'Spending'!$A$2:$A$4</c:f></c:strRef></c:cat>");
    expect(chart).toContain("<c:val><c:numRef><c:f>'Spending'!$B$2:$B$4</c:f></c:numRef></c:val>");
    expect(chart).toContain('<a:t>Where it went</a:t>');
    // Each slice says what share it is.
    expect(chart).toContain('<c:showPercent val="1"/>');
    expect(part(buf, 'xl/worksheets/sheet1.xml')).toMatch(/<\/sheetData><drawing r:id="rId1"\/><\/worksheet>$/);
    expect(part(buf, 'xl/worksheets/_rels/sheet1.xml.rels')).toContain('Target="../drawings/drawing1.xml"');
    expect(part(buf, 'xl/drawings/_rels/drawing1.xml.rels')).toContain('Target="../charts/chart1.xml"');
    // Beside the table: one column past the last, from the second row.
    expect(part(buf, 'xl/drawings/drawing1.xml')).toContain('<xdr:from><xdr:col>3</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>1</xdr:row>');
    const types = part(buf, '[Content_Types].xml')!;
    expect(types).toContain('<Override PartName="/xl/charts/chart1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>');
    expect(types).toContain('<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>');
    // Still a workbook the shop opens with a click, and reads as before.
    const file = save('spending.xlsx', buf);
    expect(officeSafe(file)).toEqual({ ok: true });
    expect(readDocument(file)).toContain('Total,=SUM(B2:B4)');
  });

  it('draws a column chart with its two axes, placed where it is asked, and numbers charts across the workbook', () => {
    const buf = makeXlsx({
      sheets: [
        { name: 'A', columns: [{ header: 'x' }], rows: [[1]], charts: [{ type: 'pie', title: 'one', labels: 'A2:A2', values: 'A2:A2' }] },
        { name: 'Months', columns: [{ header: 'Month' }, { header: 'Out' }], rows: [['Jan', 3], ['Feb', 4]], charts: [{ type: 'bar', title: 'By month', labels: 'A2:A3', values: "'Months'!B2:B3", at: 'E3' }] },
      ],
    });
    const chart = part(buf, 'xl/charts/chart2.xml')!;
    expect(chart).toContain('<c:barChart><c:barDir val="col"/><c:grouping val="clustered"/>');
    expect(chart).toContain('<c:catAx>');
    expect(chart).toContain('<c:valAx>');
    expect(chart).toContain("<c:f>'Months'!$B$2:$B$3</c:f>");
    expect(part(buf, 'xl/worksheets/_rels/sheet2.xml.rels')).toContain('Target="../drawings/drawing2.xml"');
    expect(part(buf, 'xl/drawings/_rels/drawing2.xml.rels')).toContain('Target="../charts/chart2.xml"');
    expect(part(buf, 'xl/drawings/drawing2.xml')).toContain('<xdr:from><xdr:col>4</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>2</xdr:row>');
  });

  it('refuses a chart over something that is not a range of this workbook', () => {
    const chart = (labels: string, values = 'B2:B4') => ({ sheets: [{ ...spending.sheets[0], charts: [{ type: 'pie' as const, title: 't', labels, values }] }] });
    for (const bad of ['A2', 'SUM(A2:A4)', "'Other'!A2:A4", '[1]Spending!A2:A4', 'A2:A4|x']) expect(() => makeXlsx(chart(bad)), bad).toThrow(/range/i);
    // A pie is drawn from one row or one column, its labels as many as its values.
    expect(() => makeXlsx(chart('A2:B4'))).toThrow(/one column or one row/);
    expect(() => makeXlsx(chart('A2:A3'))).toThrow(/as many/);
  });
});

describe('lists to pick from', () => {
  it('gives a column a drop-down list from a range of the workbook or from a few words, past its last row', () => {
    const buf = makeXlsx({
      sheets: [
        { name: 'Book', columns: [{ header: 'Kind', list: "'Kinds'!$A$2:$A$9" }, { header: 'Sign', list: ['in', 'out'] }], rows: [] },
        { name: 'Kinds', columns: [{ header: 'Kind' }], rows: [['Food'], ['Rent']] },
      ],
    });
    const sheet = part(buf, 'xl/worksheets/sheet1.xml')!;
    expect(sheet).toContain('<dataValidations count="2">');
    expect(sheet).toContain('<dataValidation type="list" allowBlank="1" showErrorMessage="1" sqref="A2:A500"><formula1>\'Kinds\'!$A$2:$A$9</formula1></dataValidation>');
    expect(sheet).toContain('<formula1>&quot;in,out&quot;</formula1>');
    expect(officeSafe(save('book.xlsx', buf))).toEqual({ ok: true });
  });

  it('refuses a list that reaches outside, or words a list cannot hold', () => {
    const book = (list: string | string[]): SheetSpec => ({ sheets: [{ name: 'S', columns: [{ header: 'A', list }], rows: [] }] });
    expect(() => makeXlsx(book('WEBSERVICE("http://x")'))).toThrow(/formula/i);
    expect(() => makeXlsx(book(['a,b']))).toThrow(/comma/);
    expect(() => makeXlsx(book(['say "hi"']))).toThrow(/quote/);
  });

  it('leaves a null cell out, so a block can stand to the right of empty columns', () => {
    const buf = makeXlsx({ sheets: [{ name: 'S', columns: [{ header: 'A' }, { header: 'B' }, { header: 'C' }], rows: [[null, null, 'x']] }] });
    expect(part(buf, 'xl/worksheets/sheet1.xml')).toContain('<row r="2"><c r="C2" s="0" t="inlineStr"><is><t>x</t></is></c></row>');
  });
});

describe('working out the formulas', () => {
  const values = (cells: Record<string, Cell>, more: { name: string; cells: Record<string, Cell> }[] = []) => computeBook([{ name: 'S', cells }, ...more]).S;

  it('adds, multiplies and sums ranges, an empty cell counting as nothing', () => {
    const v = values({ A1: 2, A2: 3, A3: { f: '=A1*A2+1' }, A4: { f: '=SUM(A1:A3,10)' }, A5: { f: '=(A1+A2)/2-A9' }, A6: { f: '=-A1^2' }, A7: { f: '="a"&A1' } });
    // As in Excel, a minus sign in front binds tighter than a power: -2^2 is 4.
    expect([v.A3, v.A4, v.A5, v.A6, v.A7]).toEqual([7, 22, 2.5, 4, 'a2']);
  });

  it('sums by a label or a comparison, across sheets, with quoted names and fixed references', () => {
    const v = values({
      A1: 'Food', B1: 10, A2: 'Bus', B2: 5, A3: 'food', B3: 7, A4: 'Rent', B4: 700,
      C1: { f: '=SUMIF(A1:A4,"Food",B1:B4)' },
      C2: { f: "=SUMIF($A$1:$A$4,'Other sheet'!A1,$B$1:$B$4)" },
      C3: { f: '=SUMIF(B1:B4,">8")' },
      C4: { f: '=SUMIFS(B1:B4,A1:A4,"<>Rent",B1:B4,"<10")' },
      C5: { f: '=COUNTIF(A1:A4,"food")' },
      C6: { f: "='Other sheet'!B1*2" },
    }, [{ name: 'Other sheet', cells: { A1: 'Bus', B1: 21 } }]);
    expect([v.C1, v.C2, v.C3, v.C4, v.C5, v.C6]).toEqual([17, 5, 710, 12, 2, 42]);
  });

  it('chooses with IF, rounds, and keeps an empty text an empty text', () => {
    const v = values({ A1: '', A2: 3.14159, B1: { f: '=IF(A1="","",A1)' }, B2: { f: '=IF(A2>3,ROUND(A2,2),0)' }, B3: { f: '=MAX(A2,4)+MIN(1,2)+AVERAGE(2,4)+ABS(-1)' }, B4: { f: '=IFERROR(1/0,9)' } });
    expect([v.B1, v.B2, v.B3, v.B4]).toEqual(['', 3.14, 9, 9]);
  });

  it('gives an error, not a number, for what it cannot work out', () => {
    const v = values({ A1: { f: '=1/0' }, A2: { f: '=NOPE(1)' }, A3: { f: '=A4+1' }, A4: { f: '=A3+1' }, A5: { f: '="x"+1' }, A6: { f: "='Gone'!A1" } });
    expect([v.A1, v.A2, v.A3, v.A5, v.A6]).toEqual([{ error: '#DIV/0!' }, { error: '#NAME?' }, { error: '#REF!' }, { error: '#VALUE!' }, { error: '#REF!' }]);
  });

  // The preview works a made workbook out in the main process, from whatever the model handed make_xlsx: neither a
  // range over the whole sheet nor a criterion full of wildcards may keep it busy.
  it('reads a whole-sheet range only as far as the cells that are there', () => {
    const start = Date.now();
    const v = computeBook([{ name: 'S', cells: { A1: 1, B20000: 2 } }, { name: 'T', cells: { A1: { f: '=SUM(S!A:XFD)' }, A2: { f: '=SUM(S!A1:XFD20000)' } } }]).T;
    expect([v.A1, v.A2]).toEqual([3, 3]);
    expect(Date.now() - start).toBeLessThan(2_000);
  });

  // The real budget is a few million cells; a small one here keeps the test from holding the worker for seconds.
  it('stops once the cells read pass the budget, the rest coming out as an error', () => {
    const cells: Record<string, Cell> = { CV100: 1 };
    for (let r = 1; r <= 3; r++) cells[`A${r}`] = { f: '=SUM(B1:CV100)' };
    const v = computeBook([{ name: 'S', cells }], 20_000).S;
    expect([v.A1, v.A2, v.A3]).toEqual([1, 1, { error: '#VALUE!' }]);
  });

  it('matches wildcards in time that grows with the text, not with how many stars there are', () => {
    const start = Date.now();
    const v = values({ A1: 'a'.repeat(20_000), B1: { f: `=COUNTIF(A1,"${'*a'.repeat(30)}*b")` }, B2: { f: `=COUNTIF(A1,"${'*a'.repeat(30)}*")` }, B3: { f: '=COUNTIF(A1,"a?a~*")' } });
    expect([v.B1, v.B2, v.B3]).toEqual([0, 1, 0]);
    expect(Date.now() - start).toBeLessThan(2_000);
    const w = values({ A1: 'a*b', A2: 'axb', B1: { f: '=COUNTIF(A1:A2,"a~*b")' }, B2: { f: '=COUNTIF(A1:A2,"a?b")' }, B3: { f: '=COUNTIF(A1:A2,"<>a*")' } });
    expect([w.B1, w.B2, w.B3]).toEqual([1, 2, 0]);
  });

  it('counts the matching against the same budget, and refuses a criterion past Excel\'s 255 characters', () => {
    const cells: Record<string, Cell> = {};
    for (let r = 1; r <= 30; r++) cells[`A${r}`] = 'a'.repeat(2_000);
    cells.B1 = { f: `=COUNTIF(A1:A30,"${'*a'.repeat(120)}*b")` };
    cells.B2 = { f: `=COUNTIF(A1:A3,"${'a'.repeat(256)}")` };
    // About 2,000 steps a cell, 30 cells: far more matching than the 20,000 budget, though only 33 cells are read.
    const v = computeBook([{ name: 'S', cells }], 20_000).S;
    expect([v.B1, v.B2]).toEqual([{ error: '#VALUE!' }, { error: '#VALUE!' }]);
    // Copying and lowercasing a long text costs its length, even when the match is settled at the first letter.
    const long: Record<string, Cell> = {};
    for (let r = 1; r <= 5; r++) long[`A${r}`] = 'a'.repeat(30_000);
    long.B1 = { f: '=COUNTIF(A1:A5,"b*")' };
    long.B2 = { f: '=COUNTIF(A1:A5,">b")' };
    const w = computeBook([{ name: 'S', cells: long }], 50_000).S;
    expect([w.B1, w.B2]).toEqual([{ error: '#VALUE!' }, { error: '#VALUE!' }]);
    // An everyday criterion over a few cells still counts.
    expect(values({ A1: 'Rent', A2: 'rent bill', B1: { f: '=COUNTIF(A1:A2,"rent*")' } }).B1).toBe(2);
  });

  it('shows what a formula comes to in the preview, rather than the formula', () => {
    const html = previewHtml('xlsx', spending, () => Buffer.alloc(0));
    expect(html).toContain('<td class="n">850.00</td>');
    expect(html).not.toContain('=SUM');
  });
});

describe('the stand-in\'s family ledger, worked out', () => {
  for (const lang of ['zh', 'en'] as const) {
    describe(lang, () => {
      const spec = ledgerBook(lang) as SheetSpec;
      const [jan, , mar] = spec.sheets;
      const year = spec.sheets[12];
      const kinds = spec.sheets[13];
      const label = (k: number) => kinds.rows[k][0] as string;
      /** Fill in a line of a month: date, item, category, money in, money out (the summary to the right stays). */
      const enter = (sheet: SheetSpec['sheets'][number], r: number, line: Cell[]) => {
        const row = (sheet.rows[r - 2] ??= []);
        line.forEach((c, i) => (row[i] = c));
        for (let i = 0; i < row.length; i++) row[i] ??= null;
      };
      const worked = (s: SheetSpec) => computeBook(bookCells(makeXlsx(s)));
      const byLabel = (v: Record<string, Value>) => Object.fromEntries(Array.from({ length: 15 }, (_, k) => [v[`H${7 + k}`], v[`I${7 + k}`]]));

      it('is twelve months, the year and the categories, each month with a list of categories and a pie chart', () => {
        expect(spec.sheets).toHaveLength(14);
        for (const m of spec.sheets.slice(0, 12)) {
          expect(m.columns[2].list, m.name).toBe(`'${kinds.name}'!$A$2:$A$16`);
          expect(m.charts, m.name).toEqual([expect.objectContaining({ type: 'pie', labels: 'H7:H21', values: 'I7:I21' })]);
        }
        expect(year.charts).toEqual([expect.objectContaining({ type: 'bar', labels: 'A2:A13', values: 'C2:C13' })]);
        const buf = makeXlsx(spec);
        expect([...readZip(buf).keys()].filter((n) => n.startsWith('xl/charts/'))).toHaveLength(13);
        expect(officeSafe(save('ledger.xlsx', buf))).toEqual({ ok: true });
      });

      it('writes only formulas that stay inside the workbook, and works out to nothing while it is empty', () => {
        const cells = bookCells(makeXlsx(spec));
        const formulas = cells.flatMap((s) => Object.values(s.cells).flatMap((c) => (c && typeof c === 'object' ? [c.f] : [])));
        expect(formulas.length).toBeGreaterThan(12 * 18);
        for (const f of formulas) expect(formulaProblem(f), f).toBeUndefined();
        const v = computeBook(cells);
        for (const m of spec.sheets.slice(0, 12)) {
          expect([v[m.name].I2, v[m.name].I3, v[m.name].I4], m.name).toEqual([0, 0, 0]);
          for (const [, value] of Object.entries(v[m.name])) expect(typeof value === 'object', `${m.name} ${JSON.stringify(value)}`).toBe(false);
        }
        expect(v[year.name].D14).toBe(0);
        // The summary lists the categories as they are, and leaves the empty slots empty.
        expect(Object.keys(byLabel(v[jan.name])).filter(Boolean)).toEqual(kinds.rows.map((r) => r[0]));
      });

      it('adds up a month as it is filled in: money in, money out, what is left, and the spending by category', () => {
        const s = structuredClone(spec);
        const [j, , m] = s.sheets;
        enter(j, 2, ['2026-01-03', 'pay', label(0), 5000]);
        enter(j, 3, ['2026-01-04', 'veg', label(3), null, 58.5]);
        enter(j, 4, ['2026-01-06', 'veg', label(3), null, 41.5]);
        enter(j, 5, ['2026-01-07', 'bus', label(5), null, 20]);
        enter(j, 6, ['2026-01-09', 'pills', label(6), null, 35.2]);
        enter(m, 2, ['2026-03-01', 'gift', label(7), null, 200]);
        const v = worked(s);
        expect(v[jan.name].I2).toBe(5000);
        expect(v[jan.name].I3).toBeCloseTo(155.2, 9);
        expect(v[jan.name].I4).toBeCloseTo(4844.8, 9);
        const cats = byLabel(v[jan.name]);
        expect([cats[label(0)], cats[label(3)], cats[label(5)], cats[label(6)], cats[label(7)]]).toEqual([0, 100, 20, 35.2, 0]);
        expect(byLabel(v[mar.name])[label(7)]).toBe(200);
        // The year: each month's line, and the whole year at the bottom.
        expect([v[year.name].B2, v[year.name].C2, v[year.name].C4, v[year.name].C3]).toEqual([5000, v[jan.name].I3, 200, 0]);
        expect(v[year.name].D14).toBeCloseTo(5000 - 155.2 - 200, 9);
      });

      it('follows a category the user renames or adds', () => {
        const s = structuredClone(spec);
        const k = s.sheets[13];
        k.rows[3][0] = lang === 'zh' ? '菜钱' : 'Market';
        k.rows.push([lang === 'zh' ? '养猫' : 'The cat', k.rows[4][1]]);
        enter(s.sheets[0], 2, ['2026-01-03', 'veg', k.rows[3][0], null, 30]);
        enter(s.sheets[0], 3, ['2026-01-04', 'food', k.rows[k.rows.length - 1][0], null, 12]);
        const cats = byLabel(worked(s)[jan.name]);
        expect(cats[k.rows[3][0] as string]).toBe(30);
        expect(cats[k.rows[k.rows.length - 1][0] as string]).toBe(12);
        expect(label(3) in cats).toBe(false);
      });
    });
  }
});

describe('a workbook read back cell by cell', () => {
  it('has what was written: text, numbers and formulas, by sheet and address', () => {
    const book = bookCells(makeXlsx(spending));
    expect(book).toEqual(sheetCells(spending));
    expect(book[0].cells).toMatchObject({ A1: 'What', B1: 'Amount', A2: 'Food', B2: 120, B5: { f: '=SUM(B2:B4)' } });
  });
});
