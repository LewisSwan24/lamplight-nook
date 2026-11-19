/**
 * Spreadsheet functions that reach outside the workbook when it is calculated: fetch from the web (WEBSERVICE, IMAGE,
 * the IMPORT* family other apps read), call into Windows (CALL, REGISTER, EXEC), or pull from a running program (RTD).
 * FILTERXML is here because with WEBSERVICE it is how a formula sends cell contents to a server. HYPERLINK is not: it does
 * nothing until the user clicks, and Excel asks first, like a link in the text.
 */
const REACHES_OUT = /\b(WEBSERVICE|FILTERXML|IMAGE|IMPORTXML|IMPORTDATA|IMPORTHTML|IMPORTFEED|IMPORTRANGE|CALL|REGISTER(\.ID)?|EXEC|RTD)\s*\(/i;

/**
 * Characters XML cannot carry, which the writer drops (xlsx.ts esc): left in, a name split by one would pass this check and
 * be written whole. Built from char codes because the invisible-character hook strips U+FFFE and U+FFFF from source.
 */
const UNWRITABLE = new RegExp(`[\\u0000-\\u0008\\u000b\\u000c\\u000e-\\u001f${String.fromCharCode(0xfffe, 0xffff)}]`);

/**
 * Why a formula is not to be written or opened, or undefined when it stays inside the workbook (road-to-1.3.md C1).
 * The whole text is looked at as it is, quotes and all. Telling strings, sheet names and table columns apart the way
 * Excel does is where checks like this get fooled (a quote inside brackets or a sheet name hides what follows), so none of
 * it is attempted: a label that merely mentions WEBSERVICE( or holds a pipe is refused too, which costs little. A pipe is
 * how a DDE call is written (cmd|'/c calc'!A0), a backslash a path to another file. Brackets: a made workbook has no
 * tables, so any bracket is another workbook; in a saved one Excel writes that reference as [1], [2]..., while a table's
 * columns (Table1[Price]) are fine.
 */
export function formulaProblem(formula: string, saved = false): string | undefined {
  if (UNWRITABLE.test(formula)) return 'has characters a workbook cannot hold';
  if (REACHES_OUT.test(formula)) return 'calls a function that reaches outside the workbook';
  if (formula.includes('|')) return 'holds a pipe, which is how a DDE call to another program is written';
  if (formula.includes('\\')) return 'points at a file path';
  if (saved ? /\[\d+\]/.test(formula) : formula.includes('[')) return 'points at another workbook';
  return undefined;
}
