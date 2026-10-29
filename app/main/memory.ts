import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { CommissionMemo, Memory, Recall } from '../shared/types';

/** How much is kept: the shop remembers recent work, not everything. */
const MAX_COMMISSIONS = 20;
const MAX_NOTES = 10;

const empty = (): Memory => ({ commissions: [], stuckNotes: [] });

/**
 * Adeng's notebook (tech 8): past commissions with the choices the user made, and the places where the
 * work got stuck. Only these summaries are kept, never the conversation. Stored as JSON in the app's
 * data folder; a missing or broken file means an empty notebook.
 */
export class MemoryStore {
  private data: Memory;

  constructor(private file: string) {
    this.data = this.read();
  }

  get(): Memory {
    return structuredClone(this.data);
  }

  /** Write down a finished (or failed) commission and what got stuck along the way. */
  remember(memo: Omit<CommissionMemo, 'id' | 'date'>, stuck: string[], now = new Date()) {
    const date = now.toISOString().slice(0, 10);
    this.data.commissions.push({ ...memo, id: `c${now.getTime()}`, date });
    this.data.commissions = this.data.commissions.slice(-MAX_COMMISSIONS);
    for (const note of new Set(stuck)) {
      // The same pit again on the same commission: keep one note, dated the latest time.
      this.data.stuckNotes = this.data.stuckNotes.filter((n) => !(n.commission === memo.title && n.note === note));
      this.data.stuckNotes.push({ commission: memo.title, note, date });
    }
    this.data.stuckNotes = this.data.stuckNotes.slice(-MAX_NOTES);
    this.save();
  }

  /** Forget everything (the notebook's "clear" button). */
  clear() {
    this.data = empty();
    rmSync(this.file, { force: true });
  }

  /**
   * What Adeng may bring up when a commission starts: the last choice the user made, and a place
   * that got stuck before on a commission with the same title.
   */
  recallForCommission(title: string): Recall {
    const flags: string[] = [];
    const vars: Record<string, string> = {};
    const lastChoice = [...this.data.commissions].reverse().map((c) => Object.values(c.choices).at(-1)).find(Boolean);
    if (lastChoice) {
      flags.push('has_memory');
      vars.lastChoice = lastChoice;
    }
    const note = [...this.data.stuckNotes].reverse().find((n) => n.commission === title);
    if (note) {
      flags.push('has_stuck_note');
      vars.stuckNote = note.note;
    }
    return { flags, vars };
  }

  /**
   * What Adeng may bring up when the app opens: the last commission, once. Asking marks it as
   * mentioned, so reopening the app doesn't bring the same one up again.
   */
  recallOnOpen(): Recall {
    const last = this.data.commissions.at(-1);
    if (!last || last.result !== 'done' || this.data.greeted === last.id) return { flags: [], vars: {} };
    this.data.greeted = last.id;
    this.save();
    return { flags: ['has_memory'], vars: { lastCommission: last.title } };
  }

  /** Notes for the agent's prompt (English, like the rest of the prompt; user text quoted as is). */
  promptNotes(title: string): string {
    const lines: string[] = [];
    const choices = new Map<string, string>();
    for (const c of this.data.commissions) for (const [q, a] of Object.entries(c.choices)) choices.set(q, a);
    for (const [q, a] of choices) lines.push(`- Asked "${q}" before, the user chose "${a}".`);
    for (const n of this.data.stuckNotes.filter((s) => s.commission === title)) lines.push(`- On this commission before, "${n.note}" failed at first.`);
    return lines.length ? `Notes from earlier commissions with this user (summaries only):\n${lines.join('\n')}` : '';
  }

  private read(): Memory {
    try {
      const m = JSON.parse(readFileSync(this.file, 'utf8')) as Partial<Memory>;
      return {
        commissions: Array.isArray(m.commissions) ? m.commissions.filter((c) => c && typeof c.title === 'string' && c.choices && typeof c.choices === 'object') : [],
        stuckNotes: Array.isArray(m.stuckNotes) ? m.stuckNotes.filter((n) => n && typeof n.note === 'string' && typeof n.commission === 'string') : [],
        greeted: typeof m.greeted === 'string' ? m.greeted : undefined,
      };
    } catch {
      return empty();
    }
  }

  private save() {
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(`${this.file}.tmp`, JSON.stringify(this.data, null, 2));
    renameSync(`${this.file}.tmp`, this.file);
  }
}

/**
 * Collects what to remember while a commission runs: a step that failed and then went through later
 * is a place where the work got stuck. Fed the normalized events of one run.
 */
export class StuckTracker {
  private failed = new Set<string>();
  private notes: string[] = [];

  see(e: { kind: string; tool?: string; target?: string }) {
    if (!e.tool || !e.target) return;
    const key = `${e.tool}|${e.target}`;
    if (e.kind === 'tool_fail') this.failed.add(key);
    else if (e.kind === 'tool_ok' && this.failed.delete(key)) this.notes.push(e.target);
  }

  /** Steps that failed and then worked. */
  get stuck(): string[] {
    return [...this.notes];
  }

  /** Steps that failed and never worked (where a failed commission got stuck). */
  get unresolved(): string[] {
    return [...this.failed].map((k) => k.slice(k.indexOf('|') + 1));
  }
}
