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
 * It is read the way Excel tokenises it: text in double quotes is a string, left out so a pipe or a bracket inside a
 * label does not count (a quoted URL is caught by the function it is passed to); text in single quotes is a sheet name,
 * which may hold double quotes and must not hide what follows, and which names another workbook when it holds a bracket
 * or a path. A quote never closed is not a formula Excel reads, so it is refused rather than guessed at. Outside quotes,
 * a pipe is a DDE call (cmd|'/c calc'!A0), a backslash a path. Brackets: a made workbook has no tables, so any bracket is
 * another workbook; in a saved one Excel writes that reference as [1], [2]..., while a table's columns (Table1[Price])
 * are fine.
 */
export function formulaProblem(formula: string, saved = false): string | undefined {
  if (UNWRITABLE.test(formula)) return 'has characters a workbook cannot hold';
  const otherBook = saved ? /\[\d+\]/ : /\[/;
  let bare = '';
  for (let i = 0; i < formula.length; i++) {
    const quote = formula[i];
    if (quote !== '"' && quote !== "'") {
      bare += quote;
      continue;
    }
    let inner = '';
    for (i++; ; i++) {
      if (i >= formula.length) return 'has a quote that is never closed';
      if (formula[i] !== quote) inner += formula[i];
      else if (formula[i + 1] === quote) inner += formula[i++];
      else break;
    }
    if (quote === "'") {
      if (inner.includes('\\')) return 'points at a file path';
      if (otherBook.test(inner)) return 'points at another workbook';
    }
    bare += quote === '"' ? '""' : "'sheet'";
  }
  if (REACHES_OUT.test(bare)) return 'calls a function that reaches outside the workbook';
  if (bare.includes('|')) return 'is a DDE call to another program';
  if (bare.includes('\\')) return 'points at a file path';
  if (otherBook.test(bare)) return 'points at another workbook';
  return undefined;
}
