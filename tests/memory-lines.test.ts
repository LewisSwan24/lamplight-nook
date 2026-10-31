import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MemoryStore, StuckTracker } from '../app/main/memory';
import { Director } from '../app/renderer/translator/director';
import { parseLines, toLineBook } from '../app/renderer/translator/lines';
import { parseAnimTable, parseRules, Translator } from '../app/renderer/translator/translator';
import type { AiEvent, Recall } from '../app/shared/types';

const root = join(__dirname, '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const rules = parseRules(read('rules/cafe.yaml'));
const anims = parseAnimTable(read('rules/anim-fallback.yaml'));
const lines = toLineBook(parseLines(read('lines/cafe.yaml')));
const ev = (kind: AiEvent['kind'], over: Partial<AiEvent> = {}): AiEvent => ({ id: kind, t: 0, kind, agent: 'main', plain: '', ...over });

/** The opening line Adeng says when a commission starts with this recall. */
function opening(recall: Recall) {
  const t = new Translator(rules, anims, { brief: 'ledger', ...recall });
  const cmd = t.translate(ev('session_start')).find((c) => c.line)!;
  return new Director(lines).submit(cmd)!.line!.vars;
}

describe('memory in the opening line', () => {
  const store = () => new MemoryStore(join(mkdtempSync(join(tmpdir(), 'lamplight-mem-')), 'memory.json'));

  it('says the usual opening with nothing remembered', () => {
    expect(opening(store().recallForCommission('ledger'))._id).toBe('opening_01');
  });

  it('brings up the last choice', () => {
    const s = store();
    s.remember({ title: 'poster', result: 'done', choices: { 'Main color?': 'mint' }, folder: '/w' }, []);
    const vars = opening(s.recallForCommission('ledger'));
    expect(vars._id).toBe('opening_mem_01');
    expect(vars.lastChoice).toBe('mint');
  });

  it('brings up where the same commission got stuck before', () => {
    // A real demo run: the check fails once, then passes.
    const tracker = new StuckTracker();
    for (const e of [ev('tool_fail', { tool: 'PowerShell', target: 'node check.js' }), ev('tool_ok', { tool: 'PowerShell', target: 'node check.js' })]) tracker.see(e);
    const s = store();
    s.remember({ title: 'ledger', result: 'done', choices: { 'Main color?': 'mint' }, folder: '/w' }, tracker.stuck);
    const vars = opening(s.recallForCommission('ledger'));
    expect(vars._id).toBe('opening_mem_02');
    expect(vars.stuckNote).toBe('node check.js');
  });

  it('opens a round of changes with its own line, and brings up the last round', () => {
    const s = store();
    const first = s.remember({ title: 'sign-in', result: 'done', choices: { 'Main color?': 'mint' }, folder: '/w' }, []);
    expect(opening(s.recallForRevision(first.id))._id).toBe('revise_01');
    s.revise(first.id, 'lighter', { result: 'done', choices: {} }, []);
    const vars = opening(s.recallForRevision(first.id));
    expect(vars._id).toBe('revise_again_01');
    expect(vars.lastAsk).toBe('lighter');
  });
});
