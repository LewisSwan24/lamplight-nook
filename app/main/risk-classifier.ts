import { homedir } from 'node:os';
import { basename, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fill, strings } from '../shared/i18n';
import type { Risk, ToolKind } from '../shared/types';
import { isInside, reallyInside } from './paths';

/**
 * Risk level plus a plain-language reason shown on the confirmation card. `keep`: one of the user's files in a lent
 * folder, whose original must be kept before the step goes ahead.
 */
export type RiskVerdict = { risk: Risk; reason: string; keep?: string };

/** A tool of the shop's own or of a connection, as the cards and the rules need it (road-to-1.3.md C4, C6). */
export type NookEntry = { name?: string; kind: ToolKind; label: (input: unknown) => string; undoHow?: string; connection?: { id: string; label: string } };

/**
 * What a round with connections keeps an eye on (C6): whether the user paused every connection, which connection it has
 * read from (its name), and where a declined step is written down.
 */
export type RoundWatch = { paused: () => boolean; readFrom?: string; refused: (t: NookEntry, input: unknown) => void };

export type RiskContext = {
  workDir: string;
  /** Files (absolute paths) that existed before the commission started. Overwriting or deleting them is serious. */
  preexisting?: Set<string>;
  home?: string;
  /**
   * Working in a folder the user lent the shop (road-to-1.1.md A6), which they agreed to once: the file tools may change
   * their files without asking each time, and this keeps each original first.
   */
  keepOriginal?: (file: string) => void;
  /** The shop's own tools and the ticked connections of this round, by full name (mcp__nook-*, road-to-1.3.md C4). */
  nook?: Map<string, NookEntry>;
  /** The round's connections being watched (C6); none when no connection was ticked. */
  round?: RoundWatch;
};

/**
 * A nook tool goes by the kind it declared: reading, and making new files in the commission folder, go ahead (the tick on
 * the slip, or the tool being the shop's own, is the agreement); changing anything outside asks every time, defaulting to
 * no, and so does anything that cannot be undone: these are fixed here, never a setting (C6).
 */
const NOOK_RISK: Record<ToolKind, Risk> = { read: 'safe', make: 'safe', outside: 'serious', final: 'serious' };

const R = strings.risk;

const READ_ONLY_TOOLS = new Set(['Read', 'Glob', 'Grep']);
const WEB_READ_TOOLS = new Set(['WebSearch', 'WebFetch']);
const WRITE_TOOLS = new Set(['Write', 'Edit', 'NotebookEdit']);
const ASK_TOOLS = new Set(['AskUserQuestion']);
const DELEGATE_TOOLS = new Set(['Agent', 'Task']);
/** Claude's own to-do list (TodoWrite before Claude Code 2.1.2xx, the Task* tools after): nothing leaves the app. */
const PLAN_TOOLS = new Set(['TodoWrite', 'TaskCreate', 'TaskUpdate', 'TaskList', 'TaskGet']);

const SECRET_NAME = /(key|token|secret|credential|password|\.env$|\.pem$|id_rsa)/i;
const SYSTEM_DIRS = ['C:\\Windows', 'C:\\Program Files', 'C:\\Program Files (x86)', '/etc', '/usr', '/bin', '/sbin', '/System', '/Library'];

// Read-only commands with no side effects (by command name).
const SAFE_COMMANDS = new Set(['ls', 'dir', 'cat', 'type', 'head', 'tail', 'pwd', 'echo', 'wc', 'find', 'grep', 'node', 'npx', 'tree']);
/** node options that run nothing but the script (or nothing at all): anything else may run code given on the spot. */
const NODE_PLAIN = new Set(['-v', '--version', '-c', '--check', '--no-warnings', '--trace-warnings', '--enable-source-maps']);
const INSTALL = /\b(npm|pnpm|yarn)\s+(i|install|add)\b|\bpip3?\s+install\b/;
const DELETE = /(^|[\s;&|])(rm|rmdir|del|erase|rd|Remove-Item|mv|move|shred|truncate)(\s|$)/i;
const NETWORK_SEND = /\bgit\s+push\b|\b(curl|wget|Invoke-WebRequest|iwr)\b.*(-X\s*(POST|PUT|PATCH|DELETE)|--data|-d\s|--upload|-T\s|-Method\s+(Post|Put))|\bscp\b|\brsync\b|\bftp\b/i;
// PowerShell: pipes, redirects, subshells, chained commands are serious (we only read Bash below).
const COMPLEX = /[|><`]|\$\(|&&|\|\||;/;
/** find's actions that change or run things. */
const FIND_ACTION = /^-(delete|exec|execdir|ok|okdir|fprint|fprint0|fprintf|fls)$/;
/** Where output may go without it being a write: the null device, and the other output stream. */
const DISCARD = new Set(['/dev/null', 'NUL', 'nul']);

const ORDER: Risk[] = ['safe', 'ask', 'serious', 'blocked'];
const worse = (a: RiskVerdict, b: RiskVerdict) => (ORDER.indexOf(b.risk) > ORDER.indexOf(a.risk) ? b : a);

/** One simple command out of a command line: its words, and where its output and input are redirected. */
type Simple = { words: string[]; writes: string[]; reads: string[] };

/**
 * Remove here-documents with a quoted delimiter (cat > page.html <<'EOF' ... EOF): their body is literal text
 * for the command's input, never run. An unquoted delimiter expands $(...) in the body, so it is left in and the
 * line is not understood. Returns null for a here-string or an unfinished here-document.
 */
export function withoutHeredocs(cmd: string): string | null {
  if (/<<</.test(cmd)) return null;
  const lines = cmd.split('\n');
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = line.match(/<<(-?)\s*(['"])([A-Za-z_][\w-]*)\2/);
    if (!m) {
      if (/<</.test(line)) return null;
      out.push(line);
      continue;
    }
    if (/<</.test(line.slice((m.index ?? 0) + m[0].length))) return null; // two here-documents on one line
    out.push(line.slice(0, m.index) + line.slice((m.index ?? 0) + m[0].length));
    const end = lines.findIndex((l, j) => j > i && (m[1] ? l.replace(/^\t+/, '') : l) === m[3]);
    if (end < 0) return null;
    i = end;
  }
  return out.join('\n');
}

/**
 * Split a Bash command line into simple commands at ; && || | and new lines, keeping quoted text whole.
 * Returns null for anything we can't reason about: command substitution, subshells, background jobs,
 * variables, process substitution, or a quote left open.
 */
export function simpleCommands(cmd: string): Simple[] | null {
  const out: Simple[] = [];
  let cur: Simple = { words: [], writes: [], reads: [] };
  let word = '';
  let inWord = false;
  let redirect: 'write' | 'read' | null = null;
  const endWord = () => {
    if (!inWord) return;
    if (redirect === 'write') cur.writes.push(word);
    else if (redirect === 'read') cur.reads.push(word);
    else cur.words.push(word);
    word = '';
    inWord = false;
    redirect = null;
  };
  const endCommand = () => {
    endWord();
    if (redirect) return false; // "ls >" with nothing after it
    if (cur.words.length || cur.writes.length || cur.reads.length) out.push(cur);
    cur = { words: [], writes: [], reads: [] };
    return true;
  };
  for (let i = 0; i < cmd.length; i++) {
    const c = cmd[i];
    const next = cmd[i + 1];
    if (c === "'") {
      const close = cmd.indexOf("'", i + 1);
      if (close < 0) return null;
      word += cmd.slice(i + 1, close);
      inWord = true;
      i = close;
    } else if (c === '"') {
      let j = i + 1;
      for (; j < cmd.length && cmd[j] !== '"'; j++) {
        // In double quotes a backslash only escapes $ ` " \ and a new line; C:\Users stays as written.
        if (cmd[j] === '\\' && '$`"\\\n'.includes(cmd[j + 1] ?? '')) { word += cmd[++j]; continue; }
        if (cmd[j] === '$' || cmd[j] === '`') return null;
        word += cmd[j];
      }
      if (j >= cmd.length) return null;
      inWord = true;
      i = j;
    } else if (c === '\\') {
      if (next === '\n') { i++; continue; }
      word += next ?? '';
      inWord = true;
      i++;
    } else if (c === '$' || c === '`' || c === '(' || c === ')' || c === '{' && !inWord) {
      return null;
    } else if (c === '#' && !inWord) {
      const nl = cmd.indexOf('\n', i);
      i = nl < 0 ? cmd.length : nl - 1;
    } else if (c === ' ' || c === '\t') {
      endWord();
    } else if (c === ';' || c === '\n') {
      if (!endCommand()) return null;
    } else if (c === '&' && next === '&' || c === '|' && next === '|') {
      if (!endCommand()) return null;
      i++;
    } else if (c === '|') {
      if (!endCommand()) return null;
      if (next === '&') i++;
    } else if (c === '>' || c === '<' || (c === '&' && next === '>')) {
      // 2>&1, >&2: one output stream into the other. N> / N< take the number off the word before.
      const fd = /^\d$/.test(word) && inWord ? word : '';
      if (fd) { word = ''; inWord = false; } else endWord();
      if (c === '&') i++;
      const op = cmd[i];
      if (cmd[i + 1] === '>' && op === '>') i++;
      if (cmd[i + 1] === '&') {
        const m = cmd.slice(i + 2).match(/^(\d|-)/);
        if (!m) return null;
        i += 1 + m[0].length;
        continue;
      }
      if (op === '<' && cmd[i + 1] === '(') return null;
      redirect = op === '>' ? 'write' : 'read';
    } else if (c === '&') {
      return null; // a background job
    } else {
      word += c;
      inWord = true;
    }
  }
  if (!endCommand()) return null;
  return out;
}

/** Classify a Bash command line: each simple command on its own, the worst of them counts. */
function classifyBash(cmd: string, ctx: RiskContext): RiskVerdict {
  const body = withoutHeredocs(cmd);
  if (body === null) return { risk: 'serious', reason: R.complexCommand };
  if (DELETE.test(body)) return { risk: 'serious', reason: R.delete };
  if (NETWORK_SEND.test(body)) return { risk: 'serious', reason: R.networkSend };
  const parts = simpleCommands(body);
  if (parts === null || parts.length === 0) return { risk: 'serious', reason: R.complexCommand };
  let cwd = ctx.workDir;
  let verdict: RiskVerdict = { risk: 'safe', reason: R.safeCommand };
  let wrote = false;
  for (const part of parts) {
    const [name, ...args] = part.words;
    if (name !== undefined && /^[A-Za-z_]\w*=/.test(name)) return { risk: 'serious', reason: R.complexCommand };
    for (const target of part.writes) {
      if (DISCARD.has(target)) continue;
      const full = abs(cwd, target);
      verdict = worse(verdict, pathVerdict(ctx, full, true) ?? { risk: 'safe', reason: R.write });
      wrote = true;
    }
    for (const source of part.reads) verdict = worse(verdict, readVerdict(ctx, cwd, source));
    if (name === undefined) continue;
    if (name === 'cd') {
      const to = abs(cwd, expandHome(ctx, args[0] ?? '~'));
      if (args.length > 1 || !isInside(ctx.workDir, to)) return worse(verdict, { risk: 'serious', reason: R.readOutside });
      cwd = to;
      continue;
    }
    if (INSTALL.test(part.words.join(' '))) {
      verdict = worse(verdict, { risk: 'ask', reason: R.install });
      continue;
    }
    if (!SAFE_COMMANDS.has(name)) return worse(verdict, { risk: 'serious', reason: fill(R.unknownCommand, { name }) });
    if (name === 'find' && args.some((a) => FIND_ACTION.test(a))) return worse(verdict, { risk: 'serious', reason: R.complexCommand });
    const run = runVerdict(name, args);
    if (run?.risk === 'serious') return worse(verdict, run);
    if (run) verdict = worse(verdict, run);
    if (name === 'echo') continue; // its words are printed, not opened
    for (const arg of args) {
      if (arg.startsWith('-')) continue;
      verdict = worse(verdict, readVerdict(ctx, cwd, arg));
    }
  }
  return verdict.risk === 'safe' && wrote ? { risk: 'safe', reason: R.write } : verdict;
}

/**
 * node and npx are on the safe list for "node check.js", but each can run anything: node -e / -p / -r / a script
 * from standard input, and npx fetches and runs a package. Returns a verdict for those, or null for a plain
 * script run (whose path is then checked like any other argument).
 */
function runVerdict(name: string, args: string[]): RiskVerdict | null {
  if (name === 'npx') return { risk: 'ask', reason: R.npx };
  if (name !== 'node') return null;
  let version = false;
  for (const a of args) {
    if (!a.startsWith('-')) return null; // the script; what follows is its own arguments
    if (!NODE_PLAIN.has(a)) return { risk: 'serious', reason: R.inlineCode };
    if (a === '-v' || a === '--version') version = true;
  }
  // No script: node reads its program from standard input (node - <<'EOF', or a pipe), unless it only says its version.
  return version ? null : { risk: 'serious', reason: R.inlineCode };
}

/** A path a command reads: blocked or outside the folder as for the Read tool, otherwise nothing to say. */
function readVerdict(ctx: RiskContext, cwd: string, arg: string): RiskVerdict {
  const full = abs(cwd, expandHome(ctx, arg));
  const v = pathVerdict(ctx, full, false);
  if (v) return v;
  if (!isInside(ctx.workDir, full)) return { risk: 'serious', reason: R.readOutside };
  return { risk: 'safe', reason: R.safeCommand };
}

/** ~ and ~/x are the home folder, as the shell reads them. */
function expandHome(ctx: RiskContext, p: string): string {
  if (p !== '~' && !p.startsWith('~/') && !p.startsWith('~\\')) return p;
  return join(ctx.home ?? homedir(), p.slice(2));
}

/** The folder a glob pattern starts from: everything before the first wildcard ("../**" -> "..", "*.md" -> ""). */
function globBase(pattern: string): string {
  const parts = pattern.split(/[\\/]/);
  const fixed: string[] = [];
  for (const part of parts) {
    if (/[*?[{]/.test(part)) break;
    fixed.push(part);
  }
  if (fixed.length === parts.length) fixed.pop(); // a plain path: its folder
  const base = fixed.join('/');
  return base === '' && pattern.startsWith('/') ? '/' : base;
}

/** The same file: Windows does not mind the case of a name. */
const sameFile = (a: string, b: string) => (process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b);

/** Files that run, which a quiet change could turn into something else. */
const RUNS = /\.(ps1|psm1|cmd|bat|exe|com|msi|scr|lnk|vbs|sh)$/i;

/**
 * Whether one of the user's files in a lent folder may be changed without a card: not settings or history in a
 * dot-folder (.git, .github, .vscode...) or a dot-file, not anything that runs, and not package.json, whose scripts run code.
 */
function changesQuietly(workDir: string, full: string): boolean {
  const parts = relative(workDir, full).split(/[\\/]/);
  return !parts.some((part) => part.startsWith('.')) && !RUNS.test(full) && basename(full).toLowerCase() !== 'package.json';
}

function abs(workDir: string, p: string) {
  return isAbsolute(p) ? p : resolve(workDir, p);
}

function pathVerdict(ctx: RiskContext, p: string, writing: boolean): RiskVerdict | null {
  const full = abs(ctx.workDir, p);
  const name = basename(full);
  if (SECRET_NAME.test(name)) return { risk: 'blocked', reason: fill(R.secretFile, { name }) };
  if (SYSTEM_DIRS.some((d) => full.toLowerCase().startsWith(d.toLowerCase() + sep) || full.toLowerCase().startsWith(d.toLowerCase() + '/'))) {
    return { risk: 'blocked', reason: R.systemDir };
  }
  const home = ctx.home ?? homedir();
  const rel = full.startsWith(home) ? full.slice(home.length + 1) : '';
  if (rel && rel.split(/[\\/]/)[0].startsWith('.') && !isInside(ctx.workDir, full)) {
    return { risk: 'blocked', reason: R.hiddenConfig };
  }
  if (!writing) return null;
  if (!isInside(ctx.workDir, full)) return { risk: 'serious', reason: R.outsideFolder };
  // A folder the user lent may hold their own links and junctions, which could lead a write anywhere.
  if (ctx.keepOriginal && !reallyInside(ctx.workDir, full)) return { risk: 'serious', reason: R.outsideFolder };
  if (ctx.preexisting?.has(full)) return { risk: 'serious', reason: fill(R.overwrite, { name }) };
  return null;
}

/**
 * Classify the risk of a single tool call. Once the round has read through a connection (C6), a shell command could
 * carry what it read off as well as a web request could (a script that goes online), so one that would pass asks first.
 */
export function classify(tool: string, input: Record<string, unknown>, ctx: RiskContext): RiskVerdict {
  const verdict = classifyCall(tool, input, ctx);
  const label = ctx.round?.readFrom;
  if (label && verdict.risk === 'safe' && (tool === 'Bash' || tool === 'PowerShell')) return { risk: 'ask', reason: fill(R.shellAfterConnection, { label }) };
  return verdict;
}

function classifyCall(tool: string, input: Record<string, unknown>, ctx: RiskContext): RiskVerdict {
  if (ASK_TOOLS.has(tool)) return { risk: 'ask', reason: R.ask };
  if (DELEGATE_TOOLS.has(tool)) return { risk: 'safe', reason: R.delegate };
  if (WEB_READ_TOOLS.has(tool)) {
    // Once the round has read something private through a connection, a web request could carry it off (C6), as with a
    // file read from outside the folder: the user is asked first.
    const label = ctx.round?.readFrom;
    return label ? { risk: 'ask', reason: fill(R.webAfterConnection, { label }) } : { risk: 'safe', reason: R.webRead };
  }

  if (READ_ONLY_TOOLS.has(tool)) {
    // Claude Code asks only for reads outside its folder. Anything read there could be sent on by a later
    // web request (say, after a page Claude read told it to), so it waits for the user.
    const where = [input.file_path, input.path, tool === 'Glob' ? globBase(String(input.pattern ?? '')) : undefined]
      .filter((v): v is string => typeof v === 'string' && v !== '');
    let verdict: RiskVerdict = { risk: 'safe', reason: R.read };
    for (const w of where) {
      const full = abs(ctx.workDir, expandHome(ctx, w));
      verdict = worse(verdict, pathVerdict(ctx, full, false)
        ?? (isInside(ctx.workDir, full) ? { risk: 'safe', reason: R.read } : { risk: 'serious', reason: R.readOutside }));
    }
    return verdict;
  }

  if (WRITE_TOOLS.has(tool)) {
    const p = String(input.file_path ?? input.notebook_path ?? '');
    if (!p) return { risk: 'serious', reason: R.noTarget };
    if (!ctx.keepOriginal) return pathVerdict(ctx, p, true) || { risk: 'safe', reason: R.write };
    // In a lent folder, one of the user's files written as C:/x/a.html, or in other capitals on Windows, must still be
    // known as theirs, or it would be changed with no original kept.
    const full = resolve(ctx.workDir, p);
    const matches = ctx.preexisting?.has(full) ? [full] : [...(ctx.preexisting ?? [])].filter((f) => sameFile(f, full));
    // Two of theirs that differ only in capitals (a case-sensitive folder): which one this means is not clear, so it asks.
    if (matches.length > 1) return { risk: 'serious', reason: fill(R.overwrite, { name: basename(full) }) };
    const own = matches[0];
    // Only the file tools: a command writing over the same file still asks, as nothing keeps the original for it.
    // And only an ordinary file of theirs, where a new file would need no card either.
    if (own && changesQuietly(ctx.workDir, own) && !pathVerdict({ ...ctx, preexisting: undefined }, own, true)) return { risk: 'safe', reason: R.write, keep: own };
    return pathVerdict(ctx, own ?? full, true) || { risk: 'safe', reason: R.write };
  }

  if (PLAN_TOOLS.has(tool)) return { risk: 'safe', reason: R.plan };

  if (tool === 'Bash' || tool === 'PowerShell') {
    const cmd = String(input.command ?? '').trim();
    if (!cmd) return { risk: 'serious', reason: R.emptyCommand };
    if (tool === 'Bash') return classifyBash(cmd, ctx);
    if (DELETE.test(cmd)) return { risk: 'serious', reason: R.delete };
    if (NETWORK_SEND.test(cmd)) return { risk: 'serious', reason: R.networkSend };
    if (COMPLEX.test(cmd) || /\$/.test(cmd)) return { risk: 'serious', reason: R.complexCommand };
    if (INSTALL.test(cmd)) return { risk: 'ask', reason: R.install };
    const name = cmd.split(/\s+/)[0];
    if (SAFE_COMMANDS.has(name)) {
      const run = runVerdict(name, cmd.split(/\s+/).slice(1));
      if (run) return run;
      for (const arg of cmd.split(/\s+/).slice(1)) {
        if (arg.startsWith('-') || name === 'echo') continue;
        const v = readVerdict(ctx, ctx.workDir, arg.replace(/^(['"])(.*)\1$/, '$2'));
        if (v.risk !== 'safe') return v;
      }
      return { risk: 'safe', reason: R.safeCommand };
    }
    return { risk: 'serious', reason: fill(R.unknownCommand, { name }) };
  }

  const nook = ctx.nook?.get(tool);
  if (nook?.connection && ctx.round?.paused()) return { risk: 'blocked', reason: R.connectionsPaused };
  if (nook) {
    // The shop's own file tools (C1) read and write files as Read and Write do, so a path outside the folder gets what
    // those would get there. A connection's tools never touch the commission folder.
    if (!nook.connection) {
      const file = typeof input.file === 'string' && input.file ? input.file : undefined;
      const page = typeof input.page === 'string' && input.page ? input.page : undefined;
      let verdict: RiskVerdict = { risk: 'safe', reason: R.read };
      if (page) verdict = worse(verdict, classifyCall('Read', { file_path: page }, ctx));
      if (file && nook.kind === 'read') verdict = worse(verdict, classifyCall('Read', { file_path: file }, ctx));
      // Never over a file of the user's, lent folder or not: the tool refuses that, so nothing needs keeping first.
      if (file && nook.kind === 'make') verdict = worse(verdict, classifyCall('Write', { file_path: file }, { ...ctx, keepOriginal: undefined }));
      if (verdict.risk !== 'safe') return verdict;
    }
    return { risk: NOOK_RISK[nook.kind], reason: R.nook[nook.kind] };
  }

  // Any other tool (including MCP tools) is serious by default.
  return { risk: 'serious', reason: fill(R.unknownTool, { tool }) };
}
