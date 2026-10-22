import { homedir } from 'node:os';
import { basename, isAbsolute, resolve, sep } from 'node:path';
import { fill, strings } from '../shared/i18n';
import type { Risk } from '../shared/types';
import { isInside } from './paths';

/** Risk level plus a plain-language reason shown on the confirmation card. */
export type RiskVerdict = { risk: Risk; reason: string };

export type RiskContext = {
  workDir: string;
  /** Files (absolute paths) that existed before the commission started. Overwriting or deleting them is serious. */
  preexisting?: Set<string>;
  home?: string;
};

const R = strings.risk;

const READ_ONLY_TOOLS = new Set(['Read', 'Glob', 'Grep']);
const WEB_READ_TOOLS = new Set(['WebSearch', 'WebFetch']);
const WRITE_TOOLS = new Set(['Write', 'Edit', 'NotebookEdit']);
const ASK_TOOLS = new Set(['AskUserQuestion']);
const DELEGATE_TOOLS = new Set(['Agent', 'Task']);

const SECRET_NAME = /(key|token|secret|credential|password|\.env$|\.pem$|id_rsa)/i;
const SYSTEM_DIRS = ['C:\\Windows', 'C:\\Program Files', 'C:\\Program Files (x86)', '/etc', '/usr', '/bin', '/sbin', '/System', '/Library'];

// Read-only commands with no side effects (by command name).
const SAFE_COMMANDS = new Set(['ls', 'dir', 'cat', 'type', 'head', 'tail', 'pwd', 'echo', 'wc', 'find', 'grep', 'node', 'npx', 'tree']);
const INSTALL = /\b(npm|pnpm|yarn)\s+(i|install|add)\b|\bpip3?\s+install\b/;
const DELETE = /(^|[\s;&|])(rm|rmdir|del|erase|rd|Remove-Item|mv|move|shred|truncate)(\s|$)/i;
const NETWORK_SEND = /\bgit\s+push\b|\b(curl|wget|Invoke-WebRequest|iwr)\b.*(-X\s*(POST|PUT|PATCH|DELETE)|--data|-d\s|--upload|-T\s|-Method\s+(Post|Put))|\bscp\b|\brsync\b|\bftp\b/i;
// Pipes, redirects, subshells, chained commands: if we can't reason about it, it's serious.
const COMPLEX = /[|><`]|\$\(|&&|\|\||;/;

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
  if (ctx.preexisting?.has(full)) return { risk: 'serious', reason: fill(R.overwrite, { name }) };
  return null;
}

/** Classify the risk of a single tool call. */
export function classify(tool: string, input: Record<string, unknown>, ctx: RiskContext): RiskVerdict {
  if (ASK_TOOLS.has(tool)) return { risk: 'ask', reason: R.ask };
  if (DELEGATE_TOOLS.has(tool)) return { risk: 'safe', reason: R.delegate };
  if (WEB_READ_TOOLS.has(tool)) return { risk: 'safe', reason: R.webRead };

  if (READ_ONLY_TOOLS.has(tool)) {
    const p = String(input.file_path ?? input.path ?? '');
    return (p && pathVerdict(ctx, p, false)) || { risk: 'safe', reason: R.read };
  }

  if (WRITE_TOOLS.has(tool)) {
    const p = String(input.file_path ?? input.notebook_path ?? '');
    if (!p) return { risk: 'serious', reason: R.noTarget };
    return pathVerdict(ctx, p, true) || { risk: 'safe', reason: R.write };
  }

  if (tool === 'Bash' || tool === 'PowerShell') {
    const cmd = String(input.command ?? '').trim();
    if (!cmd) return { risk: 'serious', reason: R.emptyCommand };
    if (DELETE.test(cmd)) return { risk: 'serious', reason: R.delete };
    if (NETWORK_SEND.test(cmd)) return { risk: 'serious', reason: R.networkSend };
    if (COMPLEX.test(cmd)) return { risk: 'serious', reason: R.complexCommand };
    if (INSTALL.test(cmd)) return { risk: 'ask', reason: R.install };
    const name = cmd.split(/\s+/)[0];
    if (SAFE_COMMANDS.has(name)) {
      for (const arg of cmd.split(/\s+/).slice(1)) {
        if (arg.startsWith('-')) continue;
        const v = pathVerdict(ctx, arg, false);
        if (v) return v;
        if (!isInside(ctx.workDir, abs(ctx.workDir, arg)) && /[\\/]/.test(arg)) {
          return { risk: 'serious', reason: R.readOutside };
        }
      }
      return { risk: 'safe', reason: R.safeCommand };
    }
    return { risk: 'serious', reason: fill(R.unknownCommand, { name }) };
  }

  // Any other tool (including MCP tools) is serious by default.
  return { risk: 'serious', reason: fill(R.unknownTool, { tool }) };
}
