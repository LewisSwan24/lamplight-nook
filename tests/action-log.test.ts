import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ACTIONS_MAX, ActionLog, CONNECTIONS_PAUSED, ConnectionReads, RoundActions } from '../app/main/action-log';
import { testKind } from '../app/main/connection-kinds';
import type { NookServer, NookTool, ToolCtx } from '../app/main/nook-tools';
import type { ActionRecord, Connection } from '../app/shared/types';

const folder = () => mkdtempSync(join(tmpdir(), 'actions-'));
const ctx: ToolCtx = { run: 'r1', project: 'p1', workDir: '/w/c1', signal: new AbortController().signal };
const SECRET_TEXT = 'Dinner with Mei at 7, bring the red folder';

const row = (extra: Partial<ActionRecord> = {}): Omit<ActionRecord, 'id' | 't'> => ({
  run: 'r1', connection: 'k1', tool: 'read_note', kind: 'read', said: 'read the note', decision: 'given', ok: true, ...extra,
});

const reader: NookTool = {
  name: 'read_note', kind: 'read', description: 'read', label: () => 'read the note', schema: {},
  run: async () => ({ content: [{ type: 'text', text: SECRET_TEXT }] }),
};
const saver = (dir: string): NookTool => ({
  name: 'save_note', kind: 'outside', description: 'save', label: () => 'save a note in the test folder', undoHow: 'delete the note it saved', schema: {},
  run: async (input) => {
    mkdirSync(dir, { recursive: true });
    const file = join(dir, 'note.txt');
    writeFileSync(file, String((input as { text: string }).text));
    return { content: [{ type: 'text', text: `Saved ${file}` }], made: file };
  },
});
const server = (tools: NookTool[]): NookServer => ({ name: 'k1', connection: { id: 'k1', label: 'My test' }, tools });

describe('the record of outside actions (road-to-1.3.md C6)', () => {
  it('writes one line per action to actions.jsonl and reads it back, newest last', () => {
    const dir = folder();
    const log = new ActionLog(join(dir, 'actions.jsonl'), () => new Date('2026-11-15T10:00:00Z'));
    const a = log.add(row());
    const b = log.add(row({ tool: 'save_note', kind: 'outside', decision: 'allowed' }));
    expect(a.t).toBe('2026-11-15T10:00:00.000Z');
    expect(a.id).not.toBe(b.id);
    const lines = readFileSync(join(dir, 'actions.jsonl'), 'utf8').trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(new ActionLog(join(dir, 'actions.jsonl')).list().map((r) => r.tool)).toEqual(['read_note', 'save_note']);
  });

  it('a call through a connection is recorded with what was done, never what was read or written', async () => {
    const dir = folder();
    const log = new ActionLog(join(dir, 'actions.jsonl'));
    const round = new RoundActions({ run: 'r1', project: 'p1', log, paused: () => false });
    const out = await round.call(server([reader]), reader, {}, ctx);
    expect(out.content).toEqual([{ type: 'text', text: SECRET_TEXT }]);
    const saved = await round.call(server([saver(join(dir, 'out'))]), saver(join(dir, 'out')), { text: SECRET_TEXT }, ctx);
    // What the tool made is the shop's business, not Claude's.
    expect('made' in saved).toBe(false);
    const file = readFileSync(join(dir, 'actions.jsonl'), 'utf8');
    expect(file).not.toContain(SECRET_TEXT);
    expect(log.list().map((r) => [r.connection, r.tool, r.kind, r.said, r.decision, r.ok, r.run, r.project])).toEqual([
      ['k1', 'read_note', 'read', 'read the note', 'given', true, 'r1', 'p1'],
      ['k1', 'save_note', 'outside', 'save a note in the test folder', 'allowed', true, 'r1', 'p1'],
    ]);
    expect(log.list()[1].undo).toEqual({ how: 'delete the note it saved', path: join(dir, 'out', 'note.txt') });
    expect(log.list()[0].undo).toBeUndefined();
  });

  it('remembers that the round read from a connection, so the web tools ask afterwards', async () => {
    const round = new RoundActions({ run: 'r1', log: new ActionLog(join(folder(), 'a.jsonl')), paused: () => false });
    expect(round.readFrom).toBeUndefined();
    await round.call(server([saver(join(folder(), 'x'))]), saver(join(folder(), 'x')), { text: 'x' }, ctx);
    expect(round.readFrom).toBeUndefined();
    await round.call(server([reader]), reader, {}, ctx);
    expect(round.readFrom).toBe('My test');
  });

  it('a round that carries on a session which read before starts out marked, and the first read of a round is passed on once', async () => {
    const carried = new RoundActions({ run: 'r2', log: new ActionLog(join(folder(), 'a.jsonl')), paused: () => false, readFrom: 'My calendar' });
    expect(carried.readFrom).toBe('My calendar');
    const told: string[] = [];
    const round = new RoundActions({ run: 'r1', log: new ActionLog(join(folder(), 'a.jsonl')), paused: () => false, onRead: (l) => told.push(l) });
    await round.call(server([reader]), reader, {}, ctx);
    await round.call(server([reader]), reader, {}, ctx);
    expect(told).toEqual(['My test']);
  });

  it('which sessions read through a connection is kept on disk, the first connection named, across a restart', () => {
    const file = join(folder(), 'connection-reads.json');
    const reads = new ConnectionReads(file);
    expect(reads.get('s1')).toBeUndefined();
    expect(reads.get(undefined)).toBeUndefined();
    reads.set('s1', 'My calendar');
    reads.set('s1', 'My drive');
    reads.set('s2', 'My drive');
    const again = new ConnectionReads(file);
    expect(again.get('s1')).toBe('My calendar');
    expect(again.get('s2')).toBe('My drive');
    expect(readFileSync(file, 'utf8')).not.toContain(SECRET_TEXT);
    writeFileSync(file, '{ broken');
    expect(new ConnectionReads(file).get('s1')).toBeUndefined();
  });

  it('the shop\'s own tools are not connections: not recorded, not paused', async () => {
    const log = new ActionLog(join(folder(), 'a.jsonl'));
    const round = new RoundActions({ run: 'r1', log, paused: () => true });
    const out = await round.call({ name: 'office', tools: [reader] }, reader, {}, ctx);
    expect(out.isError).toBeFalsy();
    expect(log.list()).toEqual([]);
  });

  it('with all connections paused, the next call is refused and Claude is told why', async () => {
    const log = new ActionLog(join(folder(), 'a.jsonl'));
    let paused = false;
    const round = new RoundActions({ run: 'r1', log, paused: () => paused });
    await round.call(server([reader]), reader, {}, ctx);
    paused = true;
    const out = await round.call(server([reader]), reader, {}, ctx);
    expect(out).toEqual({ content: [{ type: 'text', text: CONNECTIONS_PAUSED }], isError: true });
    expect(log.list().map((r) => [r.decision, r.ok, r.error])).toEqual([['given', true, undefined], ['denied', false, 'paused']]);
  });

  it('a step the user declined is recorded as declined', () => {
    const log = new ActionLog(join(folder(), 'a.jsonl'));
    const round = new RoundActions({ run: 'r1', log, paused: () => false });
    round.refused({ ...saver('/x'), connection: { id: 'k1', label: 'My test' } }, { text: SECRET_TEXT });
    expect(log.list().map((r) => [r.tool, r.kind, r.decision, r.ok])).toEqual([['save_note', 'outside', 'denied', false]]);
    expect(JSON.stringify(log.list())).not.toContain(SECRET_TEXT);
  });

  it('keeps at most 5,000 lines and one year, dropping the oldest first', () => {
    const dir = folder();
    const file = join(dir, 'actions.jsonl');
    let now = new Date('2025-11-01T00:00:00Z');
    const log = new ActionLog(file, () => now);
    log.add(row({ said: 'old' }));
    now = new Date('2026-11-15T00:00:00Z');
    log.add(row({ said: 'new' }));
    expect(log.list().map((r) => r.said)).toEqual(['new']);
    expect(readFileSync(file, 'utf8')).not.toContain('"old"');
    const many = new ActionLog(file, () => now);
    for (let i = 0; i < ACTIONS_MAX + 3; i++) many.add(row({ said: `n${i}` }));
    expect(many.list()).toHaveLength(ACTIONS_MAX);
    expect(many.list()[0].said).toBe('n3');
    expect(new ActionLog(file, () => now).list()).toHaveLength(ACTIONS_MAX);
    // 5,003 lines appended one by one take a few seconds on Windows.
  }, 30_000);

  it('an undo marks the action undone and is recorded on a line of its own', () => {
    const dir = folder();
    const log = new ActionLog(join(dir, 'actions.jsonl'), () => new Date('2026-11-15T10:00:00Z'));
    const done = log.add(row({ tool: 'save_note', kind: 'outside', decision: 'allowed', said: 'save a note', undo: { how: 'delete it', path: '/x/note.txt' } }));
    const undid = log.undone(done.id, 'undo: save a note');
    expect(undid).toMatchObject({ connection: 'k1', tool: 'save_note', kind: 'outside', said: 'undo: save a note', decision: 'allowed', ok: true, undid: done.id });
    const again = new ActionLog(join(dir, 'actions.jsonl')).list();
    expect(again).toHaveLength(2);
    expect(again[0].undo?.done).toBe('2026-11-15T10:00:00.000Z');
    // Once only: an action undone, or one that cannot be, is not undone again.
    expect(log.undone(done.id, 'again')).toBeNull();
    expect(log.undone(log.add(row()).id, 'a read')).toBeNull();
  });

  it('a broken line is skipped, and forgetting everything clears the record', () => {
    const dir = folder();
    const file = join(dir, 'actions.jsonl');
    writeFileSync(file, `not json\n${JSON.stringify({ id: 'a1', t: '2026-11-15T00:00:00.000Z', ...row() })}\n`);
    const log = new ActionLog(file, () => new Date('2026-11-15T10:00:00Z'));
    expect(log.list().map((r) => r.id)).toEqual(['a1']);
    log.clear();
    expect(log.list()).toEqual([]);
    expect(existsSync(file)).toBe(false);
  });
});

describe('the test connection\'s outside tool (C6)', () => {
  const c: Connection = { id: 'k1', kind: 'test', label: 'Test', added: '2026-11-15', config: {} };
  it('saves a note into the test folder, and its undo removes only what it made', async () => {
    const dir = folder();
    const kind = testKind(() => 's', join(dir, 'test-outside'));
    const save = kind.tools(c, () => 's').find((t) => t.kind === 'outside')!;
    expect(save.undoHow).toBeTruthy();
    const out = await save.run({ name: 'hello', text: 'a line' }, ctx);
    expect(out.made && existsSync(out.made)).toBe(true);
    expect(kind.undo!(save.name, out.made!)).toBe(true);
    expect(existsSync(out.made!)).toBe(false);
    // Anything outside its folder is never touched.
    const elsewhere = join(dir, 'mine.txt');
    writeFileSync(elsewhere, 'mine');
    expect(kind.undo!(save.name, elsewhere)).toBe(false);
    expect(kind.undo!(save.name, join(dir, 'test-outside', '..', 'mine.txt'))).toBe(false);
    expect(existsSync(elsewhere)).toBe(true);
    expect(kind.undo!('read_note', join(dir, 'test-outside', 'x.txt'))).toBe(false);
  });
});
