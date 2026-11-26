import type { Cell } from './specs';

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

/**
 * Working the formulas out (plan-1.8.md H5). A made workbook goes out with no values in its formula cells, since Excel
 * calculates on opening; this works them out the way Excel would, for the subset a household sheet needs: numbers,
 * text, references within and across sheets, the arithmetic and comparison operators, & for joining text, and SUM,
 * SUMIF, SUMIFS, COUNT, COUNTA, COUNTIF, COUNTIFS, AVERAGE, MIN, MAX, IF, IFERROR, AND, OR, NOT, ROUND, INT and ABS.
 * It shows what a ledger's summary comes to in the result card's preview, and lets the tests check it adds up.
 * Anything else comes out as an error value rather than a guess: #NAME? for a function it does not know.
 */
export type Value = number | string | boolean | { error: string };
/** A workbook as its cells: each sheet's name, and its cells by address (A1). */
export type Book = { name: string; cells: Record<string, Cell> }[];

type Err = { error: string };
type Blank = null;
type Scalar = number | string | boolean | Blank | Err;
type Area = { sheet: string; c0: number; r0: number; c1: number; r1: number };
type Node =
  | { k: 'lit'; v: number | string | boolean }
  | { k: 'ref'; area: Area; single: boolean }
  | { k: 'bad'; error: string }
  | { k: 'neg'; a: Node }
  | { k: 'op'; op: string; a: Node; b: Node }
  | { k: 'call'; name: string; args: Node[] };
type Tok = { t: 'num'; v: number } | { t: 'str'; v: string } | { t: 'ref'; sheet?: string; text: string } | { t: 'name'; v: string } | { t: 'op'; v: string };

const fail = (error: string): Err => ({ error });
const isErr = (v: unknown): v is Err => typeof v === 'object' && v !== null && 'error' in v;

/** A1 -> [0, 0]; a whole column (C) has no row. */
function address(text: string): { c: number; r?: number } {
  const m = /^\$?([A-Z]{1,3})(?:\$?(\d+))?$/i.exec(text)!;
  let c = 0;
  for (const ch of m[1].toUpperCase()) c = c * 26 + ch.charCodeAt(0) - 64;
  return { c: c - 1, r: m[2] ? Number(m[2]) - 1 : undefined };
}

const REF_AT = /^(\$?[A-Z]{1,3}\$?\d+(?::\$?[A-Z]{1,3}\$?\d+)?|\$?[A-Z]{1,3}:\$?[A-Z]{1,3})(?![A-Za-z0-9_(!.])/i;
const NAME_AT = /^[A-Za-z_\u0080-\uffff][\w.\u0080-\uffff]*/;
const NUM_AT = /^(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?/;

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  const refAfterSheet = (sheet: string) => {
    const m = REF_AT.exec(src.slice(i));
    if (!m) throw new SyntaxError(`no cell after ${sheet}!`);
    out.push({ t: 'ref', sheet, text: m[1] });
    i += m[1].length;
  };
  while (i < src.length) {
    const ch = src[i];
    const rest = src.slice(i);
    if (/\s/.test(ch)) i++;
    else if (ch === '"') {
      let s = '';
      for (i++; ; i++) {
        if (i >= src.length) throw new SyntaxError('open quote');
        if (src[i] === '"') {
          if (src[i + 1] !== '"') break;
          i++;
        }
        s += src[i];
      }
      i++;
      out.push({ t: 'str', v: s });
    } else if (ch === "'") {
      let s = '';
      for (i++; ; i++) {
        if (i >= src.length) throw new SyntaxError('open quote');
        if (src[i] === "'") {
          if (src[i + 1] !== "'") break;
          i++;
        }
        s += src[i];
      }
      i++;
      if (src[i] !== '!') throw new SyntaxError('a quoted name that is not a sheet');
      i++;
      refAfterSheet(s);
    } else if (REF_AT.test(rest)) {
      const m = REF_AT.exec(rest)!;
      out.push({ t: 'ref', text: m[1] });
      i += m[1].length;
    } else if (NUM_AT.test(rest)) {
      const m = NUM_AT.exec(rest)!;
      out.push({ t: 'num', v: Number(m[0]) });
      i += m[0].length;
    } else if (NAME_AT.test(rest)) {
      const name = NAME_AT.exec(rest)![0];
      i += name.length;
      if (src[i] === '!') {
        i++;
        refAfterSheet(name);
      } else out.push({ t: 'name', v: name });
    } else {
      const two = rest.slice(0, 2);
      const op = ['<>', '<=', '>='].includes(two) ? two : ch;
      if (!'+-*/^&=<>(),%'.includes(op[0])) throw new SyntaxError(`unexpected ${ch}`);
      out.push({ t: 'op', v: op });
      i += op.length;
    }
  }
  return out;
}

/** Excel's order, loosest first: comparison, &, + and -, * and /, ^, then a sign in front (so -2^2 is 4). */
const LEVELS = [['=', '<>', '<', '>', '<=', '>='], ['&'], ['+', '-'], ['*', '/'], ['^']];

function parse(src: string, sheet: string): Node {
  const toks = tokenize(src.replace(/^=/, ''));
  let at = 0;
  const peek = () => toks[at];
  const isOp = (v: string) => peek()?.t === 'op' && (peek() as { v: string }).v === v;
  const expect = (v: string) => {
    if (!isOp(v)) throw new SyntaxError(`expected ${v}`);
    at++;
  };
  const level = (n: number): Node => {
    if (n === LEVELS.length) return unary();
    let a = level(n + 1);
    while (peek()?.t === 'op' && LEVELS[n].includes((peek() as { v: string }).v)) {
      const op = (toks[at++] as { v: string }).v;
      a = { k: 'op', op, a, b: level(n + 1) };
    }
    return a;
  };
  const unary = (): Node => {
    if (isOp('-')) {
      at++;
      return { k: 'neg', a: unary() };
    }
    if (isOp('+')) {
      at++;
      return unary();
    }
    let node = primary();
    while (isOp('%')) {
      at++;
      node = { k: 'op', op: '/', a: node, b: { k: 'lit', v: 100 } };
    }
    return node;
  };
  const primary = (): Node => {
    const tok = toks[at++];
    if (!tok) throw new SyntaxError('ends too soon');
    if (tok.t === 'num' || tok.t === 'str') return { k: 'lit', v: tok.v };
    if (tok.t === 'ref') {
      const [from, to = from] = tok.text.split(':');
      const a = address(from);
      const b = address(to);
      const whole = a.r === undefined;
      return {
        k: 'ref',
        single: !tok.text.includes(':'),
        area: { sheet: tok.sheet ?? sheet, c0: Math.min(a.c, b.c), c1: Math.max(a.c, b.c), r0: whole ? 0 : Math.min(a.r!, b.r!), r1: whole ? Infinity : Math.max(a.r!, b.r!) },
      };
    }
    if (tok.t === 'name') {
      const name = tok.v.toUpperCase();
      if (isOp('(')) {
        at++;
        const args: Node[] = [];
        if (!isOp(')')) {
          for (;;) {
            args.push(isOp(',') || isOp(')') ? { k: 'lit', v: '' } : level(0));
            if (isOp(')')) break;
            expect(',');
          }
        }
        expect(')');
        return { k: 'call', name, args };
      }
      if (name === 'TRUE' || name === 'FALSE') return { k: 'lit', v: name === 'TRUE' };
      return { k: 'bad', error: '#NAME?' };
    }
    if (tok.v === '(') {
      const inner = level(0);
      expect(')');
      return inner;
    }
    throw new SyntaxError(`unexpected ${tok.v}`);
  };
  const node = level(0);
  if (at < toks.length) throw new SyntaxError('left over');
  return node;
}

/** Every cell of a workbook worked out: a formula as what it comes to, anything else as it is. */
export function computeBook(book: Book): Record<string, Record<string, Value>> {
  const sheets = new Map(book.map((s) => [s.name.toLowerCase(), s]));
  const lastRow = new Map(book.map((s) => [s.name.toLowerCase(), Math.max(0, ...Object.keys(s.cells).map((ref) => address(ref).r ?? 0))]));
  const done = new Map<string, Scalar>();
  const busy = new Set<string>();

  const cellAt = (sheet: string, c: number, r: number): Scalar => {
    const s = sheets.get(sheet.toLowerCase());
    if (!s) return fail('#REF!');
    const ref = `${letter(c)}${r + 1}`;
    const key = `${s.name}!${ref}`;
    if (done.has(key)) return done.get(key)!;
    const cell = s.cells[ref];
    if (cell === undefined || cell === null) return null;
    if (typeof cell !== 'object') return cell;
    if (busy.has(key)) return fail('#REF!');
    busy.add(key);
    let v: Scalar;
    try {
      v = evaluate(parse(cell.f, s.name), s.name);
    } catch {
      v = fail('#NAME?');
    }
    busy.delete(key);
    // A formula that comes to an empty cell shows 0, as in Excel.
    if (v === null) v = 0;
    done.set(key, v);
    return v;
  };

  /** The cells of an area, row by row; a whole column stops at the sheet's last row. */
  const cellsOf = (a: Area): Scalar[][] => {
    if (!sheets.has(a.sheet.toLowerCase())) return [[fail('#REF!')]];
    const r1 = Math.min(a.r1, lastRow.get(a.sheet.toLowerCase())!);
    const rows: Scalar[][] = [];
    for (let r = a.r0; r <= r1; r++) {
      const row: Scalar[] = [];
      for (let c = a.c0; c <= a.c1; c++) row.push(cellAt(a.sheet, c, r));
      rows.push(row);
    }
    return rows;
  };

  const scalar = (n: Node, sheet: string): Scalar => {
    if (n.k === 'ref') {
      if (!n.single) return fail('#VALUE!');
      return cellAt(n.area.sheet, n.area.c0, n.area.r0);
    }
    return evaluate(n, sheet);
  };

  const evaluate = (n: Node, sheet: string): Scalar => {
    switch (n.k) {
      case 'lit':
        return n.v;
      case 'bad':
        return fail(n.error);
      case 'ref':
        return scalar(n, sheet);
      case 'neg': {
        const a = toNumber(scalar(n.a, sheet));
        return isErr(a) ? a : -a;
      }
      case 'op':
        return operate(n.op, scalar(n.a, sheet), scalar(n.b, sheet));
      case 'call':
        return call(n.name, n.args, sheet);
    }
  };

  /** What a function's argument holds: every cell of a range, or the one value. */
  const spread = (n: Node, sheet: string): { values: Scalar[]; fromRange: boolean } =>
    n.k === 'ref' && !n.single ? { values: cellsOf(n.area).flat(), fromRange: true } : { values: [scalar(n, sheet)], fromRange: n.k === 'ref' };

  /** The numbers among the arguments as SUM sees them: in a range only numbers count; typed in, text that reads as one does. */
  const numbers = (args: Node[], sheet: string): number[] | Err => {
    const out: number[] = [];
    for (const arg of args) {
      const { values, fromRange } = spread(arg, sheet);
      for (const v of values) {
        if (isErr(v)) return v;
        if (typeof v === 'number') out.push(v);
        else if (!fromRange && v !== null && v !== '') {
          const x = toNumber(v);
          if (isErr(x)) return x;
          out.push(x);
        }
      }
    }
    return out;
  };

  const area = (n: Node | undefined): Area | undefined => (n?.k === 'ref' ? n.area : undefined);
  /** The cells of `of`, lined up with those of the first range, as SUMIF lines its sum range up with its range. */
  const along = (first: Area, of: Area): Scalar[] => cellsOf({ sheet: of.sheet, c0: of.c0, r0: of.r0, c1: of.c0 + (first.c1 - first.c0), r1: of.r0 + (Math.min(first.r1, lastRow.get(first.sheet.toLowerCase()) ?? 0) - first.r0) }).flat();

  /** Which rows meet every (range, criterion) pair, as SUMIFS and COUNTIFS read them. */
  const meeting = (pairs: [Node, Node][], sheet: string): boolean[] | Err => {
    const first = area(pairs[0][0]);
    if (!first) return fail('#VALUE!');
    let keep: boolean[] | undefined;
    for (const [range, criterion] of pairs) {
      const a = area(range);
      if (!a) return fail('#VALUE!');
      const crit = scalar(criterion, sheet);
      if (isErr(crit)) return crit;
      const test = matcher(crit);
      const hits = along(first, a).map(test);
      keep = keep ? keep.map((k, i) => k && hits[i]) : hits;
    }
    return keep!;
  };

  const call = (name: string, args: Node[], sheet: string): Scalar => {
    const arg = (i: number) => (args[i] ? scalar(args[i], sheet) : null);
    switch (name) {
      case 'SUM':
      case 'AVERAGE':
      case 'MIN':
      case 'MAX':
      case 'COUNT': {
        const xs = numbers(args, sheet);
        if (isErr(xs)) return xs;
        if (name === 'SUM') return xs.reduce((s, x) => s + x, 0);
        if (name === 'COUNT') return xs.length;
        if (name === 'AVERAGE') return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : fail('#DIV/0!');
        return xs.length ? (name === 'MIN' ? Math.min(...xs) : Math.max(...xs)) : 0;
      }
      case 'COUNTA':
        return args.flatMap((a) => spread(a, sheet).values).filter((v) => v !== null).length;
      case 'SUMIF':
      case 'COUNTIF': {
        const range = area(args[0]);
        if (!range || !args[1]) return fail('#VALUE!');
        const keep = meeting([[args[0], args[1]]], sheet);
        if (isErr(keep)) return keep;
        if (name === 'COUNTIF') return keep.filter(Boolean).length;
        const sum = area(args[2]) ?? range;
        return add(along(range, sum).filter((_, i) => keep[i]));
      }
      case 'SUMIFS':
      case 'COUNTIFS': {
        const sumAt = name === 'SUMIFS' ? 1 : 0;
        const pairs: [Node, Node][] = [];
        for (let i = sumAt; i + 1 < args.length; i += 2) pairs.push([args[i], args[i + 1]]);
        if (!pairs.length || (args.length - sumAt) % 2) return fail('#VALUE!');
        const keep = meeting(pairs, sheet);
        if (isErr(keep)) return keep;
        if (name === 'COUNTIFS') return keep.filter(Boolean).length;
        const sum = area(args[0]);
        if (!sum) return fail('#VALUE!');
        return add(along(area(pairs[0][0])!, sum).filter((_, i) => keep[i]));
      }
      case 'IF': {
        const test = truth(arg(0));
        if (isErr(test)) return test;
        return test ? arg(1) ?? 0 : args.length > 2 ? arg(2) ?? 0 : false;
      }
      case 'IFERROR': {
        const v = arg(0);
        return isErr(v) ? arg(1) : v;
      }
      case 'AND':
      case 'OR': {
        const all = args.flatMap((a) => spread(a, sheet).values).filter((v) => v !== null);
        const truths = all.map(truth);
        const bad = truths.find(isErr);
        if (bad) return bad;
        return name === 'AND' ? truths.every(Boolean) : truths.some(Boolean);
      }
      case 'NOT': {
        const t = truth(arg(0));
        return isErr(t) ? t : !t;
      }
      case 'ROUND':
      case 'INT':
      case 'ABS': {
        const x = toNumber(arg(0));
        if (isErr(x)) return x;
        if (name === 'ABS') return Math.abs(x);
        if (name === 'INT') return Math.floor(x);
        const places = toNumber(arg(1));
        if (isErr(places)) return places;
        const k = 10 ** Math.trunc(places);
        // Half away from zero, as Excel rounds, past the float error in numbers like 1.005.
        return (Math.sign(x) * Math.round(Math.abs(x) * k + 1e-9)) / k;
      }
      default:
        return fail('#NAME?');
    }
  };

  const out: Record<string, Record<string, Value>> = {};
  for (const s of book) {
    out[s.name] = {};
    for (const [ref, cell] of Object.entries(s.cells)) {
      if (cell === null) continue;
      const { c, r } = address(ref);
      const v = cellAt(s.name, c, r!);
      out[s.name][ref] = v === null ? '' : v;
    }
  }
  return out;
}

/** 0 -> A, 26 -> AA (as xlsx.ts writes them; kept here so this file stands on its own). */
function letter(i: number): string {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

function toNumber(v: Scalar): number | Err {
  if (isErr(v)) return v;
  if (v === null) return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  const t = v.trim();
  return t !== '' && Number.isFinite(Number(t)) ? Number(t) : fail('#VALUE!');
}

function truth(v: Scalar): boolean | Err {
  if (isErr(v)) return v;
  if (v === null) return false;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (/^true$/i.test(v)) return true;
  if (/^false$/i.test(v)) return false;
  return fail('#VALUE!');
}

const add = (vs: Scalar[]): number | Err => {
  let s = 0;
  for (const v of vs) {
    if (isErr(v)) return v;
    if (typeof v === 'number') s += v;
  }
  return s;
};

/** Excel orders numbers before text before TRUE and FALSE, and compares text without case. An empty cell is 0 or "". */
function compare(a: Exclude<Scalar, Err>, b: Exclude<Scalar, Err>): number {
  if (a === null) a = typeof b === 'string' ? '' : typeof b === 'boolean' ? false : 0;
  if (b === null) b = typeof a === 'string' ? '' : typeof a === 'boolean' ? false : 0;
  const rank = (v: number | string | boolean) => (typeof v === 'number' ? 0 : typeof v === 'string' ? 1 : 2);
  if (rank(a) !== rank(b)) return rank(a) - rank(b);
  if (typeof a === 'string') return a.toLowerCase().localeCompare((b as string).toLowerCase());
  return Number(a) - Number(b);
}

function operate(op: string, a: Scalar, b: Scalar): Scalar {
  if (isErr(a)) return a;
  if (isErr(b)) return b;
  if (op === '&') return `${show(a)}${show(b)}`;
  if (['=', '<>', '<', '>', '<=', '>='].includes(op)) {
    const d = compare(a, b);
    return { '=': d === 0, '<>': d !== 0, '<': d < 0, '>': d > 0, '<=': d <= 0, '>=': d >= 0 }[op]!;
  }
  const x = toNumber(a);
  const y = toNumber(b);
  if (isErr(x)) return x;
  if (isErr(y)) return y;
  switch (op) {
    case '+':
      return x + y;
    case '-':
      return x - y;
    case '*':
      return x * y;
    case '/':
      return y === 0 ? fail('#DIV/0!') : x / y;
    default:
      return x ** y;
  }
}

/** A value joined into text: TRUE as TRUE, an empty cell as nothing. */
const show = (v: Exclude<Scalar, Err>) => (v === null ? '' : typeof v === 'boolean' ? (v ? 'TRUE' : 'FALSE') : String(v));

/**
 * The test SUMIF and its kin put each cell to: "Food" (any case, * and ? as wildcards), a number, or a comparison
 * such as ">8" or "<>Rent". "" is an empty cell, "<>" one that is not.
 */
function matcher(crit: Exclude<Scalar, Err>): (v: Scalar) => boolean {
  if (typeof crit === 'number' || typeof crit === 'boolean') return (v) => !isErr(v) && v !== null && compare(v, crit) === 0;
  const m = /^(<>|<=|>=|=|<|>)?(.*)$/s.exec(crit ?? '')!;
  const op = m[1] ?? '=';
  const rest = m[2];
  const asNumber = rest.trim() !== '' && Number.isFinite(Number(rest)) ? Number(rest) : undefined;
  if (rest === '') return op === '<>' ? (v) => v !== null && v !== '' : (v) => v === null || v === '';
  if (asNumber !== undefined) {
    return (v) => {
      if (typeof v !== 'number') return op === '<>';
      return { '=': v === asNumber, '<>': v !== asNumber, '<': v < asNumber, '>': v > asNumber, '<=': v <= asNumber, '>=': v >= asNumber }[op]!;
    };
  }
  if (op === '=' || op === '<>') {
    const pattern = new RegExp(`^${rest.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/~\*/g, '\u0001').replace(/~\?/g, '\u0002').replace(/\*/g, '.*').replace(/\?/g, '.').replace(/\u0001/g, '\\*').replace(/\u0002/g, '\\?')}$`, 'is');
    const hit = (v: Scalar) => typeof v === 'string' && pattern.test(v);
    return op === '=' ? hit : (v) => !hit(v);
  }
  return (v) => typeof v === 'string' && { '<': v.toLowerCase() < rest.toLowerCase(), '>': v.toLowerCase() > rest.toLowerCase(), '<=': v.toLowerCase() <= rest.toLowerCase(), '>=': v.toLowerCase() >= rest.toLowerCase() }[op]!;
}
