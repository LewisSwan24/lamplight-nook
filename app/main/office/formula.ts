/**
 * Spreadsheet functions that reach outside the workbook when it is calculated: fetch from the web (WEBSERVICE, IMAGE,
 * the IMPORT* family other apps read), call into Windows (CALL, REGISTER, EXEC), or pull from a running program (RTD).
 * FILTERXML is here because with WEBSERVICE it is how a formula sends cell contents to a server. HYPERLINK is not: it does
 * nothing until the user clicks, and Excel asks first, like a link in the text.
 */
const REACHES_OUT = /\b(WEBSERVICE|FILTERXML|IMAGE|IMPORTXML|IMPORTDATA|IMPORTHTML|IMPORTFEED|IMPORTRANGE|CALL|REGISTER(\.ID)?|EXEC|RTD)\s*\(/i;

/**
 * Why a formula is not to be written or opened, or undefined when it stays inside the workbook (road-to-1.3.md C1).
 * Text in double quotes is left out first, so a pipe or a bracket inside a label does not count; a quoted URL is caught by
 * the function it is passed to. A pipe outside quotes is a DDE call (cmd|'/c calc'!A0), a backslash a path to another
 * file. Brackets: a made workbook has no tables, so any bracket is a reference to another workbook; in a saved one Excel
 * writes that reference as [1], [2]..., while a table's own columns (Table1[Price]) are fine.
 */
export function formulaProblem(formula: string, saved = false): string | undefined {
  const bare = formula.replace(/"(?:[^"]|"")*"/g, '""');
  if (REACHES_OUT.test(bare)) return 'calls a function that reaches outside the workbook';
  if (bare.includes('|')) return 'is a DDE call to another program';
  if (bare.includes('\\')) return 'points at a file path';
  if (saved ? /\[\d+\]/.test(bare) : bare.includes('[')) return 'points at another workbook';
  return undefined;
}
