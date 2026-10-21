import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { classify } from '../app/main/risk-classifier';
import { strings } from '../app/shared/i18n';

const home = '/home/u';
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

  it('blocked: secret files, system folders, hidden config', () => {
    expect(r('Read', { file_path: join(workDir, '.env') })).toBe('blocked');
    expect(r('Read', { file_path: join(home, '.ssh', 'config') })).toBe('blocked');
    expect(r('Write', { file_path: '/etc/hosts' })).toBe('blocked');
    expect(r('Bash', { command: 'cat api_key.txt' })).toBe('blocked');
  });

  it('every verdict carries a plain-language reason', () => {
    expect(classify('Bash', { command: 'rm a' }, ctx).reason).toBe(strings.risk.delete);
  });
});
