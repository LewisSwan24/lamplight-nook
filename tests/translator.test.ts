import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { normalizeAll } from '../app/main/event-normalizer';
import { Director } from '../app/renderer/translator/director';
import { parseLines, toLineBook } from '../app/renderer/translator/lines';
import { ACTOR_STATES, StateMachine, canMove } from '../app/renderer/translator/state-machine';
import { Translator, parseAnimTable, parseRules, resolveAnim } from '../app/renderer/translator/translator';
import { STAFF_ANIMS } from '../app/renderer/game/sprites';
import type { ActorId, AiEvent, RawAgentEvent } from '../app/shared/types';

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

describe('what the staff really do', () => {
  const open = () => {
    const t = new Translator(rules, anims, { brief: 'x' });
    t.translate(ev({ kind: 'session_start' }));
    return t;
  };
  const on = (kind: AiEvent['kind'], extra: Partial<AiEvent> = {}) => open().translate(ev({ kind, ...extra }));

  it('gives a character something to hold instead of a stand-in pose', () => {
    expect(resolveAnim(anims, 'adeng', 'write')).toMatchObject({ prop: 'pencil' });
    expect(resolveAnim(anims, 'adeng', 'drink')).toMatchObject({ anim: 'idle', prop: 'cup' });
    expect(resolveAnim(anims, 'adeng', 'spin_cup')).toMatchObject({ anim: 'idle', prop: 'cup' });
    expect(resolveAnim(anims, 'laoshi', 'hammer')).toMatchObject({ anim: 'lift', prop: 'hammer' });
  });

  it('passes the thing held on to the command', () => {
    const [cmd] = on('tool_start', { tool: 'Write' });
    expect(cmd).toMatchObject({ actor: 'adeng', anim: 'sit', prop: 'pencil' });
  });

  it('has Adeng on the phone for the web and for commands', () => {
    for (const tool of ['Bash', 'PowerShell', 'WebSearch', 'WebFetch']) {
      expect(on('tool_start', { tool })[0], tool).toMatchObject({ anim: 'phone', moveTo: 'counter' });
    }
  });

  it('still sends Adeng to the shelf to read', () => {
    expect(on('tool_start', { tool: 'Read' })[0]).toMatchObject({ anim: 'read', moveTo: 'shelf' });
  });

  it('has Adeng hand the work over when someone is sent off', () => {
    for (const agent of ['designer', 'reviewer', 'researcher'] as const) {
      const cmds = on('subagent_start', { agent });
      expect(cmds.find((c) => c.actor === 'adeng'), agent).toMatchObject({ anim: 'gift' });
    }
  });

  it('hands the work over even when Adeng is already at work', () => {
    const t = open();
    t.translate(ev({ kind: 'tool_start', tool: 'Write' }));
    expect(t.translate(ev({ kind: 'subagent_start', agent: 'reviewer' })).find((c) => c.actor === 'adeng')).toMatchObject({ anim: 'gift' });
  });

  it('has Laoshi lift the work back when the check is done', () => {
    expect(on('subagent_stop', { agent: 'reviewer' })[0]).toMatchObject({ actor: 'laoshi', anim: 'lift' });
  });

  it('only ever asks a sprite sheet for an animation it really has', () => {
    expect(anims.staff.available.filter((a) => !STAFF_ANIMS[a])).toEqual([]);
    for (const r of rules) for (const s of [r, ...(r.extra ?? [])]) {
      if (!s.anim || s.actor === 'cat' || s.anim === 'walk') continue;
      const { anim } = resolveAnim(anims, s.actor === '{agent}' ? 'adeng' : (s.actor as ActorId), s.anim);
      expect(STAFF_ANIMS[anim], `${s.anim} -> ${anim}`).toBeDefined();
    }
  });

  it('sends Adeng to the board when the list on it changes', () => {
    expect(on('progress')[0]).toMatchObject({ actor: 'adeng', moveTo: 'board', anim: 'read' });
  });

  it('has an unnamed helper at work with a note, out where the errand is', () => {
    const t = open();
    t.translate(ev({ kind: 'subagent_start', agent: 'unknown' }));
    expect(t.translate(ev({ kind: 'tool_start', agent: 'unknown', tool: 'Read' }))[0]).toMatchObject({ actor: 'xiaoju', state: 'out', bubble: 'note' });
  });

  it('lets the cat walk for real', () => {
    expect(resolveAnim(anims, 'cat', 'walk')).toEqual({ anim: 'walk' });
  });

  it('keeps only stand-ins that have a reason, each with something to show for it', () => {
    const left = Object.values(anims.staff.fallback);
    for (const f of left) expect((f as { prop?: string; bubble?: string }).prop ?? (f as { bubble?: string }).bubble ?? 'walk').toBeTruthy();
    expect(Object.keys(anims.staff.fallback).sort()).toEqual(['drink', 'hammer', 'put_on_coat', 'scratch_head', 'spin_cup', 'write']);
  });
});

describe('translation: real recording', () => {
  const t = new Translator(rules, anims, { brief: 'ledger page' });
  const cmds = normalizeAll(recording).flatMap((e) => t.translate(e).map((c) => ({ kind: e.kind, ...c })));
  const story = cmds.map((c) => `${c.actor}:${c.state}${c.moveTo ? '@' + c.moveTo : ''}`);

  it('plays the storyboard', () => {
    expect(story).toEqual([
      'adeng:ready@counter', 'xiaoju:ready@shelf', 'laoshi:ready@corner', 'qingdai:ready@board',
      'xiaoju:out@door', 'adeng:working', // handed over
      'xiaoju:out', // web search while out: bubble only
      'xiaoju:returning@counter',
      'adeng:working@table',
      'laoshi:checking@table', 'adeng:working', // handed over
      'laoshi:checking', // reads notes.md
      'laoshi:ready@corner',
      'adeng:thinking',
      'adeng:working@table',
      'adeng:thinking',
      'adeng:wrapping@counter', 'xiaoju:idle@shelf', 'laoshi:idle@corner', 'qingdai:idle@board', 'cat:idle@window',
    ]);
  });

  it('uses fallback animations: coat -> walk, hammer -> lift with dots', () => {
    const go = cmds.find((c) => c.actor === 'xiaoju' && c.state === 'out' && c.moveTo)!;
    expect(go.anim).toBe('walk');
    const check = cmds.find((c) => c.actor === 'laoshi' && c.state === 'checking')!;
    expect(check).toMatchObject({ anim: 'lift', prop: 'hammer', bubble: 'dots' });
  });

  it('a passing review picks the "looks fine" line', () => {
    const d = new Director(toLineBook(lines));
    const back = cmds.find((c) => c.actor === 'laoshi' && c.line?.group === 'sub_back_laoshi')!;
    expect(d.submit(back)?.line?.vars._id).toBe('back_ls_ok');
  });
});

describe('translation: cases not in the recording', () => {
  it('a second errand for Xiaoju waits its turn, then she sets off again when the first one is back', () => {
    const t = new Translator(rules, anims);
    t.translate(ev({ kind: 'session_start' }));
    const show = (e: Partial<AiEvent>) => t.translate(ev(e)).map((c) => `${c.actor}:${c.state}${c.moveTo ? '@' + c.moveTo : ''}${c.line ? '/' + c.line.group : ''}`);
    expect(show({ kind: 'subagent_start', agent: 'researcher' })).toEqual(['xiaoju:out@door/sub_go_xiaoju', 'adeng:working']);
    const queued = t.translate(ev({ kind: 'subagent_start', agent: 'unknown' }));
    expect(queued).toMatchObject([{ actor: 'adeng', line: { group: 'sub_queue', flags: ['who_xiaoju'] } }]);
    expect(new Director(toLineBook(lines)).submit(queued[0])?.line?.vars._id).toBe('sub_queue_01');
    expect(show({ kind: 'subagent_stop', agent: 'researcher', target: 'notes' })).toEqual([
      'xiaoju:returning@counter/sub_back_xiaoju', 'xiaoju:out@door/sub_go_xiaoju', 'adeng:working',
    ]);
    expect(show({ kind: 'subagent_stop', agent: 'unknown' })).toEqual(['xiaoju:returning@counter/sub_back_xiaoju']);
  });

  it('once the apprentice has come, Xiaoju\'s second errand goes to Xiaodou; a third still waits its turn', () => {
    const t = new Translator(rules, anims);
    t.apprentice = true;
    t.translate(ev({ kind: 'session_start' }));
    const show = (e: Partial<AiEvent>) => t.translate(ev(e)).map((c) => `${c.actor}:${c.state}${c.moveTo ? '@' + c.moveTo : ''}${c.line ? '/' + c.line.group : ''}`);
    expect(show({ kind: 'subagent_start', agent: 'researcher' })).toEqual(['xiaoju:out@door/sub_go_xiaoju', 'adeng:working']);
    expect(show({ kind: 'subagent_start', agent: 'researcher' })).toEqual(['xiaodou:out@door/sub_go_xiaodou', 'adeng:working']);
    const queued = t.translate(ev({ kind: 'subagent_start', agent: 'unknown' }));
    expect(queued).toMatchObject([{ actor: 'adeng', line: { group: 'sub_queue', flags: ['who_xiaoju'] } }]);
    // Whoever set off first is back first, and takes the errand that waited.
    expect(show({ kind: 'subagent_stop', agent: 'researcher' })).toEqual([
      'xiaoju:returning@counter/sub_back_xiaoju', 'xiaoju:out@door/sub_go_xiaoju', 'adeng:working',
    ]);
    expect(t.helpersOf('researcher')).toEqual(['xiaodou', 'xiaoju']);
    expect(show({ kind: 'subagent_stop', agent: 'researcher' })).toEqual(['xiaodou:returning@counter/sub_back_xiaodou']);
    // The parcel on the counter is from whoever brought it.
    expect(t.returned).toBe('xiaodou');
    expect(show({ kind: 'subagent_stop', agent: 'unknown' })).toEqual(['xiaoju:returning@counter/sub_back_xiaoju']);
    expect(t.returned).toBe('xiaoju');
    expect(t.helpersOf('researcher')).toEqual(['xiaoju']);
    // Back at the counter, the apprentice is free for the next one again.
    show({ kind: 'subagent_start', agent: 'researcher' });
    expect(show({ kind: 'subagent_start', agent: 'researcher' })).toEqual(['xiaodou:out@door/sub_go_xiaodou', 'adeng:working']);
  });

  it('two rounds at once (B5): the second one starting does not wipe out the first, and each errand comes back to its own round', () => {
    const t = new Translator(rules, anims);
    t.apprentice = true;
    const show = (e: Partial<AiEvent>) => t.translate(ev(e)).map((c) => `${c.actor}:${c.state}${c.moveTo ? '@' + c.moveTo : ''}${c.line ? '/' + c.line.group : ''}`);
    t.translate(ev({ kind: 'session_start', run: 'r1' }));
    expect(show({ kind: 'subagent_start', agent: 'researcher', run: 'r1' })).toEqual(['xiaoju:out@door/sub_go_xiaoju', 'adeng:working']);
    // The second round starts while Xiaoju is out for the first: she is still out.
    t.translate(ev({ kind: 'session_start', run: 'r2' }));
    expect(t.helpersOf('researcher')).toEqual(['xiaoju']);
    // The second round is Qingdai's to lead (B9): she hands it over, and gets it back at her seat by the blackboard.
    expect(show({ kind: 'subagent_start', agent: 'researcher', run: 'r2' })).toEqual(['xiaodou:out@door/sub_go_xiaodou', 'qingdai:working']);
    // A third errand, for the first round, waits for a free pair of hands.
    expect(t.translate(ev({ kind: 'subagent_start', agent: 'researcher', run: 'r1' }))).toMatchObject([{ actor: 'adeng', line: { group: 'sub_queue' } }]);
    // The second round's errand comes back first: it was Xiaodou's, not Xiaoju's, and she takes the one waiting.
    expect(show({ kind: 'subagent_stop', agent: 'researcher', run: 'r2' })).toEqual([
      'xiaodou:returning@board/sub_back_xiaodou', 'xiaodou:out@door/sub_go_xiaodou', 'adeng:working',
    ]);
    expect(t.returned).toBe('xiaodou');
    expect(show({ kind: 'subagent_stop', agent: 'researcher', run: 'r1' })).toEqual(['xiaoju:returning@counter/sub_back_xiaoju']);
    expect(show({ kind: 'subagent_stop', agent: 'researcher', run: 'r1' })).toEqual(['xiaodou:returning@counter/sub_back_xiaodou']);
  });

  it('two rounds at once (B5): each round\'s lines speak of its own commission', () => {
    const t = new Translator(rules, anims);
    t.setContext({ brief: 'reunion page' }, 'r1');
    t.translate(ev({ kind: 'session_start', run: 'r1' }));
    t.setContext({ brief: 'walden notes' }, 'r2');
    t.translate(ev({ kind: 'session_start', run: 'r2' }));
    const briefOf = (run: string) => t.translate(ev({ kind: 'session_start', run })).find((c) => c.line)?.line?.vars.brief;
    expect(briefOf('r1')).toBe('reunion page');
    expect(briefOf('r2')).toBe('walden notes');
    // Once a round has ended, the shop is free for a fresh start again.
    t.translate(ev({ kind: 'done', run: 'r1' }));
    t.translate(ev({ kind: 'done', run: 'r2' }));
    expect(t.running).toEqual([]);
  });

  it('two rounds at once (B5): a round that stopped without a last event of its own is let go when the main process says so', () => {
    const t = new Translator(rules, anims);
    t.translate(ev({ kind: 'session_start', run: 'r1' }));
    t.translate(ev({ kind: 'subagent_start', agent: 'researcher', run: 'r1' }));
    t.translate(ev({ kind: 'net_error', run: 'r1' }));
    expect(t.running).toEqual(['r1']);
    t.keepRuns([]);
    expect(t.running).toEqual([]);
    // The next round alone starts the shop afresh: Xiaoju is no longer out for the one that stopped.
    t.translate(ev({ kind: 'session_start', run: 'r2' }));
    expect(t.helpersOf('researcher')).toEqual(['xiaoju']);
    expect(t.translate(ev({ kind: 'subagent_start', agent: 'researcher', run: 'r2' }))[0]).toMatchObject({ actor: 'xiaoju', moveTo: 'door' });
  });

  it('the apprentice only runs errands: a second check still waits for Laoshi', () => {
    const t = new Translator(rules, anims);
    t.apprentice = true;
    t.translate(ev({ kind: 'session_start' }));
    expect(t.translate(ev({ kind: 'subagent_start', agent: 'reviewer' }))[0]).toMatchObject({ actor: 'laoshi', moveTo: 'table' });
    expect(t.translate(ev({ kind: 'subagent_start', agent: 'reviewer' }))).toMatchObject([{ actor: 'adeng', line: { group: 'sub_queue', flags: ['who_laoshi'] } }]);
  });

  it('the apprentice\'s lines are spoken by the apprentice', () => {
    const t = new Translator(rules, anims);
    t.apprentice = true;
    t.translate(ev({ kind: 'session_start' }));
    t.translate(ev({ kind: 'subagent_start', agent: 'researcher' }));
    const d = new Director(toLineBook(lines));
    const go = d.submit(t.translate(ev({ kind: 'subagent_start', agent: 'researcher', target: 'opening hours' }))[0]);
    expect(go?.line?.vars._id).toMatch(/^go_xd_/);
  });

  it('the demo colour question gets its own line; other questions get the general one', () => {
    const ask = (flags: string[]) => {
      const t = new Translator(rules, anims, { flags });
      t.translate(ev({ kind: 'session_start' }));
      t.translate(ev({ kind: 'tool_start', tool: 'Write' }));
      const cmd = t.translate(ev({ kind: 'ask_user', tool: 'AskUserQuestion', target: 'Main color?' })).find((c) => c.line?.group === 'ask')!;
      return new Director(toLineBook(lines)).submit(cmd)?.line?.vars._id;
    };
    expect(ask(['demo_color'])).toBe('ask_color');
    expect(ask([])).toBe('ask_01');
  });

  it('a refused call (a secret or a system folder) gets its own line, not the serious-card one', () => {
    const t = new Translator(rules, anims);
    t.translate(ev({ kind: 'session_start' }));
    t.translate(ev({ kind: 'tool_start', tool: 'Read' }));
    const [cmd] = t.translate(ev({ kind: 'decision', choice: 'denied', risk: 'blocked' }));
    expect(cmd.line?.group).toBe('refused');
    t.states.move('adeng', 'serious'); // a serious card was shown
    expect(t.translate(ev({ kind: 'decision', choice: 'denied', risk: 'serious' }))[0].line?.group).toBe('serious_no');
  });

  it('from the third failure the cat comes over', () => {
    const t = new Translator(rules, anims);
    t.translate(ev({ kind: 'session_start' }));
    t.translate(ev({ kind: 'tool_start', tool: 'Bash' }));
    expect(t.translate(ev({ kind: 'tool_fail', failStreak: 1 })).map((c) => c.actor)).toEqual(['adeng']);
    const third = t.translate(ev({ kind: 'tool_fail', failStreak: 3 }));
    expect(third.map((c) => `${c.actor}:${c.line?.group ?? ''}`)).toEqual(['adeng:stuck_long', 'cat:']);
  });

  it('a stuck reviewer only speaks his own lines, skipping ones with unfilled placeholders', () => {
    const t = new Translator(rules, anims);
    t.translate(ev({ kind: 'session_start' }));
    t.translate(ev({ kind: 'subagent_start', agent: 'reviewer' }));
    const stuck = t.translate(ev({ kind: 'tool_fail', agent: 'reviewer', failStreak: 1 }))[0];
    expect(new Director(toLineBook(lines)).submit(stuck)?.line?.vars._id).toBe('stuck_05');
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

  it('the designer is Qingdai: she sketches at the blackboard, then brings the proposal to the counter', () => {
    const t = new Translator(rules, anims);
    t.translate(ev({ kind: 'session_start' }));
    expect(t.translate(ev({ kind: 'subagent_start', agent: 'designer' }))[0])
      .toMatchObject({ actor: 'qingdai', state: 'working', moveTo: 'board', bubble: 'idea', line: { group: 'sub_go_qingdai' } });
    expect(t.translate(ev({ kind: 'tool_start', agent: 'designer', tool: 'Read' }))[0]).toMatchObject({ actor: 'qingdai', state: 'working' });
    expect(t.translate(ev({ kind: 'subagent_stop', agent: 'designer' }))[0])
      .toMatchObject({ actor: 'qingdai', state: 'ready', moveTo: 'counter', line: { group: 'sub_back_qingdai' } });
  });
});

describe('two crews at once (road-to-1.2.md B9)', () => {
  const twoRounds = (apprentice = false) => {
    const t = new Translator(rules, anims);
    t.apprentice = apprentice;
    const show = (e: Partial<AiEvent>) => t.translate(ev(e)).map((c) => `${c.actor}:${c.state}${c.moveTo ? '@' + c.moveTo : ''}${c.line ? '/' + c.line.group : ''}`);
    return { t, show };
  };

  it('Adeng leads the first round; the second is led by Qingdai from her seat by the blackboard', () => {
    const { t, show } = twoRounds();
    expect(show({ kind: 'session_start', run: 'r1' })[0]).toBe('adeng:ready@counter/opening');
    expect(show({ kind: 'session_start', run: 'r2' })[0]).toBe('qingdai:ready@board/opening');
    expect(t.leadOf('r1')).toBe('adeng');
    expect(t.leadOf('r2')).toBe('qingdai');
    // What Adeng does for his round, Qingdai does for hers: writing at the table, asking from her own seat.
    expect(show({ kind: 'tool_start', agent: 'main', tool: 'Write', target: 'a.md', run: 'r2' })).toEqual(['qingdai:working@table/writing']);
    expect(show({ kind: 'tool_start', agent: 'main', tool: 'Write', target: 'b.md', run: 'r1' })).toEqual(['adeng:working@table/writing']);
    expect(show({ kind: 'ask_user', run: 'r2' })).toEqual(['qingdai:asking@board/ask']);
    // Each command says which round it is for.
    expect(t.translate(ev({ kind: 'thinking', run: 'r1' }))[0]).toMatchObject({ actor: 'adeng', run: 'r1' });
  });

  it('the second round\'s design is Qingdai\'s own: nobody is sent, and nothing is carried to the counter', () => {
    const { show } = twoRounds();
    show({ kind: 'session_start', run: 'r1' });
    show({ kind: 'session_start', run: 'r2' });
    expect(show({ kind: 'subagent_start', agent: 'designer', run: 'r2' })).toEqual(['qingdai:working@board/sub_go_qingdai']);
    expect(show({ kind: 'subagent_stop', agent: 'designer', run: 'r2' })).toEqual(['qingdai:ready@board/sub_back_qingdai']);
  });

  it('both crews share the errand runners: one waits for Xiaoju, and its lead says so', () => {
    const { t, show } = twoRounds();
    show({ kind: 'session_start', run: 'r1' });
    show({ kind: 'session_start', run: 'r2' });
    expect(show({ kind: 'subagent_start', agent: 'researcher', run: 'r1' })).toEqual(['xiaoju:out@door/sub_go_xiaoju', 'adeng:working']);
    expect(t.translate(ev({ kind: 'subagent_start', agent: 'researcher', run: 'r2' }))).toMatchObject([{ actor: 'qingdai', line: { group: 'sub_queue', flags: ['who_xiaoju'] } }]);
    // Back with the first round's errand at the counter, she sets off for the second, which Qingdai hands her.
    expect(show({ kind: 'subagent_stop', agent: 'researcher', run: 'r1' })).toEqual([
      'xiaoju:returning@counter/sub_back_xiaoju', 'xiaoju:out@door/sub_go_xiaoju', 'qingdai:working',
    ]);
    expect(t.crews().get('xiaoju')).toBe('r2');
    // And what she brings back for the second round goes to Qingdai, by the blackboard.
    expect(show({ kind: 'subagent_stop', agent: 'researcher', run: 'r2' })).toEqual(['xiaoju:returning@board/sub_back_xiaoju']);
  });

  it('with the apprentice, each crew gets a runner of its own, and a check still waits for Laoshi', () => {
    const { t, show } = twoRounds(true);
    show({ kind: 'session_start', run: 'r1' });
    show({ kind: 'session_start', run: 'r2' });
    show({ kind: 'subagent_start', agent: 'researcher', run: 'r1' });
    expect(show({ kind: 'subagent_start', agent: 'researcher', run: 'r2' })).toEqual(['xiaodou:out@door/sub_go_xiaodou', 'qingdai:working']);
    expect(show({ kind: 'subagent_start', agent: 'reviewer', run: 'r2' })).toEqual(['laoshi:checking@table/sub_go_laoshi', 'qingdai:working']);
    expect(t.translate(ev({ kind: 'subagent_start', agent: 'reviewer', run: 'r1' }))).toMatchObject([{ actor: 'adeng', line: { group: 'sub_queue', flags: ['who_laoshi'] } }]);
    expect(Object.fromEntries(t.crews())).toEqual({ adeng: 'r1', qingdai: 'r2', xiaoju: 'r1', xiaodou: 'r2', laoshi: 'r2' });
  });

  it('a round that ends sends home only its own crew; the other keeps working', () => {
    const { t, show } = twoRounds(true);
    show({ kind: 'session_start', run: 'r1' });
    show({ kind: 'session_start', run: 'r2' });
    show({ kind: 'subagent_start', agent: 'reviewer', run: 'r2' });
    const home = show({ kind: 'done', run: 'r1' });
    expect(home[0]).toBe('adeng:wrapping@counter/done');
    expect(home.filter((c) => c.startsWith('laoshi') || c.startsWith('qingdai'))).toEqual([]);
    expect(home).toContain('xiaoju:idle@shelf');
    expect(Object.fromEntries(t.crews())).toEqual({ qingdai: 'r2', laoshi: 'r2' });
    // A round starting beside one at work leaves that crew where it is, too.
    expect(show({ kind: 'session_start', run: 'r3' }).filter((c) => c.startsWith('laoshi') || c.startsWith('qingdai'))).toEqual([]);
    // Adeng is free again, so he leads the new round.
    expect(t.leadOf('r3')).toBe('adeng');
  });

  it('whoever Qingdai\'s round sends home goes to their own place, not to her seat', () => {
    const { show } = twoRounds(true);
    show({ kind: 'session_start', run: 'r1' });
    expect(show({ kind: 'session_start', run: 'r2' })).toContain('xiaodou:ready@counter');
    expect(show({ kind: 'cancelled', run: 'r2' })).toEqual(expect.arrayContaining(['qingdai:idle@board/cancelled', 'xiaodou:idle@counter']));
  });
});
