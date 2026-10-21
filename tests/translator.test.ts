import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { normalizeAll } from '../app/main/event-normalizer';
import { Director } from '../app/renderer/translator/director';
import { parseLines, toLineBook } from '../app/renderer/translator/lines';
import { ACTOR_STATES, StateMachine, canMove } from '../app/renderer/translator/state-machine';
import { Translator, parseAnimTable, parseRules, resolveAnim } from '../app/renderer/translator/translator';
import type { AiEvent, RawAgentEvent } from '../app/shared/types';

const root = join(__dirname, '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const rules = parseRules(read('rules/cafe.yaml'));
const anims = parseAnimTable(read('rules/anim-fallback.yaml'));
const lines = parseLines(read('lines/cafe.yaml'));
const recording: RawAgentEvent[] = read('demo/subagents.jsonl').split('\n').filter(Boolean).map((l) => JSON.parse(l));

const ev = (over: Partial<AiEvent>): AiEvent => ({ id: 'x', t: 0, kind: 'tool_start', agent: 'main', plain: '', ...over });

describe('rule files', () => {
  it('every line group used by a rule exists', () => {
    for (const r of rules) for (const s of [r, ...(r.extra ?? [])]) {
      if (s.lines) expect(lines, `${r.on} -> ${s.lines}`).toHaveProperty(s.lines);
    }
  });

  it('every state is known to the state machine and every animation resolves to real art', () => {
    for (const r of rules) for (const s of [r, ...(r.extra ?? [])]) {
      expect(ACTOR_STATES).toContain(s.state);
      if (!s.anim) continue;
      const actor = s.actor === '{agent}' ? 'adeng' : s.actor;
      const table = anims[actor === 'cat' ? 'cat' : 'staff'];
      expect(table.available, `${actor}:${s.anim}`).toContain(resolveAnim(anims, actor, s.anim).anim);
    }
  });
});

describe('state machine', () => {
  it('a subagent who is out cannot be sent to write; after returning she settles to ready', () => {
    const m = new StateMachine();
    expect(m.move('xiaoju', 'ready')).toBe(true);
    expect(m.move('xiaoju', 'out')).toBe(true);
    expect(m.move('xiaoju', 'working')).toBe(false);
    expect(m.move('xiaoju', 'returning')).toBe(true);
    expect(m.settle('xiaoju')).toBe('ready');
  });

  it('serious, wrapping and low are reachable from every state', () => {
    for (const s of ACTOR_STATES) {
      expect(canMove(s, 'serious')).toBe(true);
      expect(canMove(s, 'wrapping')).toBe(true);
      expect(canMove(s, 'low')).toBe(true);
    }
  });

  it('idle cannot jump straight to working', () => {
    expect(canMove('idle', 'working')).toBe(false);
  });
});

describe('translation: real recording', () => {
  const t = new Translator(rules, anims, { brief: 'ledger page' });
  const cmds = normalizeAll(recording).flatMap((e) => t.translate(e).map((c) => ({ kind: e.kind, ...c })));
  const story = cmds.map((c) => `${c.actor}:${c.state}${c.moveTo ? '@' + c.moveTo : ''}`);

  it('plays the storyboard', () => {
    expect(story).toEqual([
      'adeng:ready@counter', 'xiaoju:ready@shelf', 'laoshi:ready@corner',
      'xiaoju:out@door',
      'xiaoju:out', // web search while out: bubble only
      'xiaoju:returning@counter',
      'adeng:working@table',
      'laoshi:checking@table',
      'laoshi:checking', // reads notes.md
      'laoshi:ready@corner',
      'adeng:thinking',
      'adeng:working@table',
      'adeng:thinking',
      'adeng:wrapping@counter', 'xiaoju:idle@shelf', 'laoshi:idle@corner', 'cat:idle@window',
    ]);
  });

  it('uses fallback animations: coat -> walk, hammer -> lift with dots', () => {
    const go = cmds.find((c) => c.actor === 'xiaoju' && c.state === 'out' && c.moveTo)!;
    expect(go.anim).toBe('walk');
    const check = cmds.find((c) => c.actor === 'laoshi' && c.state === 'checking')!;
    expect(check).toMatchObject({ anim: 'lift', bubble: 'dots' });
  });

  it('a passing review picks the "looks fine" line', () => {
    const d = new Director(toLineBook(lines));
    const back = cmds.find((c) => c.actor === 'laoshi' && c.line?.group === 'sub_back_laoshi')!;
    expect(d.submit(back)?.line?.vars._id).toBe('back_ls_ok');
  });
});

describe('translation: cases not in the recording', () => {
  it('from the third failure the cat comes over', () => {
    const t = new Translator(rules, anims);
    t.translate(ev({ kind: 'session_start' }));
    t.translate(ev({ kind: 'tool_start', tool: 'Bash' }));
    expect(t.translate(ev({ kind: 'tool_fail', failStreak: 1 })).map((c) => c.actor)).toEqual(['adeng']);
    const third = t.translate(ev({ kind: 'tool_fail', failStreak: 3 }));
    expect(third.map((c) => `${c.actor}:${c.line?.group ?? ''}`)).toEqual(['adeng:stuck_long', 'cat:']);
  });

  it('a stuck reviewer only speaks his own lines', () => {
    const t = new Translator(rules, anims);
    t.translate(ev({ kind: 'session_start' }));
    t.translate(ev({ kind: 'subagent_start', agent: 'reviewer' }));
    const stuck = t.translate(ev({ kind: 'tool_fail', agent: 'reviewer', failStreak: 1 }))[0];
    expect(new Director(toLineBook(lines)).submit(stuck)?.line?.vars._id).toBe('stuck_04');
  });

  it('deleting a file triggers serious mode; a question triggers asking', () => {
    const t = new Translator(rules, anims);
    t.translate(ev({ kind: 'session_start' }));
    expect(t.translate(ev({ kind: 'permission', risk: 'serious', tool: 'Bash' }))[0]).toMatchObject({ state: 'serious', bubble: 'alert' });
    const t2 = new Translator(rules, anims);
    t2.translate(ev({ kind: 'session_start' }));
    expect(t2.translate(ev({ kind: 'ask_user' }))[0]).toMatchObject({ state: 'asking', line: { group: 'ask' } });
  });

  it('unrecognized subagents are played by Xiaoju', () => {
    const t = new Translator(rules, anims);
    t.translate(ev({ kind: 'session_start' }));
    expect(t.translate(ev({ kind: 'subagent_start', agent: 'unknown' }))[0].actor).toBe('xiaoju');
  });
});
