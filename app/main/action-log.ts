import { randomUUID } from 'node:crypto';
import { appendFileSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { ActionRecord } from '../shared/types';
import type { NookServer, NookTool, ToolCtx } from './nook-tools';
import type { NookEntry, RoundWatch } from './risk-classifier';

/** The record keeps at most this many lines, and nothing older than a year (road-to-1.3.md C6). */
export const ACTIONS_MAX = 5000;
const YEAR_MS = 365 * 24 * 3600 * 1000;

/** What Claude is told when a connection is called while the user has paused them all. */
export const CONNECTIONS_PAUSED = 'The user has paused all connections in settings. Do not try them again in this commission; continue without them.';

type NewRecord = Omit<ActionRecord, 'id' | 't'>;

const isRecord = (r: Partial<ActionRecord> | null): r is ActionRecord => Boolean(r && typeof r.id === 'string' && typeof r.t === 'string'
  && typeof r.connection === 'string' && typeof r.tool === 'string' && typeof r.said === 'string');

/**
 * The record of outside actions (road-to-1.3.md C6), actions.jsonl in the data folder: one line for each call of a
 * connection's tool, saying what was done (the tool's own sentence), whether the user agreed and whether it worked; never
 * what was read or written. Oldest lines go first, past a year or 5,000 lines.
 */
export class ActionLog {
  private items: ActionRecord[];

  constructor(private file: string, private now: () => Date = () => new Date()) {
    this.items = this.read();
    if (this.prune()) this.rewrite();
  }

  /** A line that cannot be read is skipped; the rest stand. */
  private read(): ActionRecord[] {
    let text: string;
    try {
      text = readFileSync(this.file, 'utf8');
    } catch {
      return [];
    }
    return text.split('\n').flatMap((line) => {
      try {
        const r = JSON.parse(line) as Partial<ActionRecord>;
        return isRecord(r) ? [r] : [];
      } catch {
        return [];
      }
    });
  }

  /** Drops what is past a year or past the most kept; true when anything went. */
  private prune(): boolean {
    const since = this.now().getTime() - YEAR_MS;
    const kept = this.items.filter((r) => Date.parse(r.t) >= since).slice(-ACTIONS_MAX);
    const dropped = kept.length !== this.items.length;
    this.items = kept;
    return dropped;
  }

  /** Written whole through a temporary file, so a crash halfway leaves the old record. */
  private rewrite() {
    if (!this.items.length) {
      rmSync(this.file, { force: true });
      return;
    }
    mkdirSync(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, this.items.map((r) => `${JSON.stringify(r)}\n`).join(''));
    renameSync(tmp, this.file);
  }

  list(): ActionRecord[] {
    return this.items.map((r) => ({ ...r, ...(r.undo ? { undo: { ...r.undo } } : {}) }));
  }

  get(id: string): ActionRecord | undefined {
    return this.items.find((r) => r.id === id);
  }

  add(e: NewRecord): ActionRecord {
    const r: ActionRecord = { id: `a${randomUUID()}`, t: this.now().toISOString(), ...e };
    this.items.push(r);
    if (this.prune()) this.rewrite();
    else {
      mkdirSync(dirname(this.file), { recursive: true });
      appendFileSync(this.file, `${JSON.stringify(r)}\n`);
    }
    return { ...r };
  }

  /**
   * An outside action was undone: its line says when, and the undo is a line of its own, `said` being its sentence. Null
   * for an action that has no undo, failed, or was undone already.
   */
  undone(id: string, said: string): ActionRecord | null {
    const r = this.get(id);
    if (!r?.undo || r.undo.done || !r.ok || r.kind !== 'outside') return null;
    r.undo.done = this.now().toISOString();
    this.rewrite();
    return this.add({ run: r.run, ...(r.project ? { project: r.project } : {}), connection: r.connection, tool: r.tool, kind: r.kind, said, decision: 'allowed', ok: true, undid: r.id });
  }

  /** "Forget everything" forgets this too. */
  clear() {
    this.items = [];
    this.rewrite();
  }
}

/**
 * One round's calls of its connections (C6): each written down, refused while the user has paused all connections, and
 * the first connection read from remembered, after which the web tools ask first (risk-classifier.ts). The shop's own
 * tools are not connections, and go through untouched.
 */
export class RoundActions implements RoundWatch {
  /** The connection this round first read from, by its name. */
  readFrom?: string;

  constructor(private o: { run: string; project?: string; log: Pick<ActionLog, 'add'>; paused: () => boolean }) {}

  paused(): boolean {
    return this.o.paused();
  }

  private record(c: { id: string }, t: { name?: string; kind: NookTool['kind']; label: (input: unknown) => string }, input: unknown, rest: Pick<ActionRecord, 'decision' | 'ok' | 'error' | 'undo'>) {
    this.o.log.add({
      run: this.o.run, ...(this.o.project ? { project: this.o.project } : {}),
      connection: c.id, tool: t.name ?? '', kind: t.kind, said: t.label(input),
      decision: rest.decision, ok: rest.ok, ...(rest.error ? { error: rest.error } : {}), ...(rest.undo ? { undo: rest.undo } : {}),
    });
  }

  async call(s: NookServer, t: NookTool, input: unknown, ctx: ToolCtx): Promise<CallToolResult> {
    const c = s.connection;
    if (!c) {
      const { made: _made, ...result } = await t.run(input, ctx);
      return result;
    }
    if (this.paused()) {
      this.record(c, t, input, { decision: 'denied', ok: false, error: 'paused' });
      return { content: [{ type: 'text', text: CONNECTIONS_PAUSED }], isError: true };
    }
    // A read was agreed to by the tick on the slip; anything else ran only after the user allowed it on the card.
    const decision = t.kind === 'read' || t.kind === 'make' ? 'given' : 'allowed';
    let out;
    try {
      out = await t.run(input, ctx);
    } catch (err) {
      this.record(c, t, input, { decision, ok: false, error: 'failed' });
      throw err;
    }
    const { made, ...result } = out;
    const ok = !result.isError;
    this.record(c, t, input, {
      decision, ok, ...(ok ? {} : { error: 'failed' }),
      ...(ok && t.kind === 'outside' && made && t.undoHow ? { undo: { how: t.undoHow, path: made } } : {}),
    });
    if (ok && t.kind === 'read') this.readFrom ??= c.label;
    return result;
  }

  /** The user declined the step on its card, or it was refused while paused. */
  refused(t: NookEntry, input: unknown) {
    if (t.connection) this.record(t.connection, t, input, { decision: 'denied', ok: false, ...(this.paused() ? { error: 'paused' } : {}) });
  }
}
