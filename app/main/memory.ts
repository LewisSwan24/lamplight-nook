import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { grownBy, workIcon, type GrowthId, madeOf } from '../shared/growth';
import { localDay } from '../shared/localday';
import { forgetAside, putAside } from './aside';
import type { CommissionMemo, DataDamage, GuestId, Memory, Recall, RoundStat, ShopDays, ShopState } from '../shared/types';

/** How many past commissions' choices go into the notes for Claude: every note is paid for on every commission. */
const RECENT_FOR_NOTES = 20;
const MAX_NOTES = 10;
/** Rounds of changes remembered per commission. */
const MAX_ASKS = 10;
/** Rounds kept per work for the ledger page; older ones drop off. */
const MAX_ROUNDS = 50;

const empty = (): Memory => ({ commissions: [], stuckNotes: [] });

/**
 * Adeng's notebook (tech 8): past commissions with the choices the user made, and the places where the
 * work got stuck. Only these summaries are kept, never the conversation. Stored as JSON in the app's
 * data folder. A file that cannot be read is put aside, never written over, and the copy made when the shop last
 * opened takes its place; `damage` says so, for the shop to tell the user.
 */
export class MemoryStore {
  private data: Memory;
  damage: DataDamage['notebook'] = null;

  constructor(private file: string) {
    this.data = this.open();
  }

  private get lastGood() {
    return join(dirname(this.file), 'memory.last-good.json');
  }

  private open(): Memory {
    const there = existsSync(this.file);
    if (!there && !existsSync(this.lastGood)) return empty();
    const good = there ? this.read(this.file) : null;
    if (good) {
      this.copyToLastGood();
      return good;
    }
    if (there) putAside(this.file);
    const copy = existsSync(this.lastGood) ? this.read(this.lastGood) : null;
    this.damage = !copy ? 'lost' : there ? 'restored' : 'missing';
    if (copy) copyFileSync(this.lastGood, this.file);
    return copy ?? empty();
  }

  /** Only a spare: a full disk or a locked file must not stop the shop opening, or spoil the copy already there. */
  private copyToLastGood() {
    const tmp = `${this.lastGood}.tmp`;
    try {
      copyFileSync(this.file, tmp);
      renameSync(tmp, this.lastGood);
    } catch {
      // Left behind if it cannot go either; the next opening writes over it.
      try { rmSync(tmp, { force: true }); } catch { /* held by something else */ }
    }
  }

  get(): Memory {
    return structuredClone(this.data);
  }

  /** Write down a finished (or failed) commission and what got stuck along the way. Returns its entry. */
  remember(memo: Omit<CommissionMemo, 'id' | 'date'>, stuck: string[], now = new Date()): CommissionMemo {
    const date = localDay(now);
    // Ids are c<time>; two entries in the same millisecond still get different ones.
    let t = now.getTime();
    while (this.data.commissions.some((c) => c.id === `c${t}`)) t++;
    // Carrying on after a stop is still the same commission: what stopped is replaced, not listed twice, and what was
    // answered before the stop still counts.
    const stopped = (c: CommissionMemo) => memo.folder && c.folder === memo.folder && c.result === 'failed';
    const before = this.data.commissions.find(stopped);
    const rounds = [...(before?.rounds ?? []), ...(memo.rounds ?? [])].slice(-MAX_ROUNDS);
    const entry: CommissionMemo = { ...memo, choices: { ...before?.choices, ...memo.choices }, id: `c${t}`, date, ...(rounds.length ? { rounds } : {}) };
    this.data.commissions = this.data.commissions.filter((c) => !stopped(c));
    this.data.commissions.push(entry);
    this.note(memo.title, stuck, date);
    this.save();
    return structuredClone(entry);
  }

  /**
   * Another round of changes to a commission already in the notebook: it moves to the top as the latest
   * work, keeps its first choices unless answered again, and remembers what was asked. Null if it is gone.
   */
  revise(id: string, ask: string, update: Pick<CommissionMemo, 'result' | 'choices'> & Partial<Pick<CommissionMemo, 'costUsd' | 'sessionId' | 'summary' | 'main'>> & { round?: RoundStat }, stuck: string[], now = new Date()): CommissionMemo | null {
    const at = this.data.commissions.findIndex((c) => c.id === id);
    if (at < 0) return null;
    const date = localDay(now);
    const [old] = this.data.commissions.splice(at, 1);
    const entry: CommissionMemo = {
      ...old,
      date,
      // A round that did not finish leaves the earlier work in place: it still counts as done.
      result: old.result === 'done' ? 'done' : update.result,
      choices: { ...old.choices, ...update.choices },
      costUsd: update.costUsd ?? old.costUsd,
      sessionId: update.sessionId ?? old.sessionId,
      summary: update.summary ?? old.summary,
      main: update.main ?? old.main,
      // Trying the same round again (after a network failure, say) is still one round.
      asks: (old.asks?.at(-1)?.ask === ask ? old.asks : [...(old.asks ?? []), { ask, date }]).slice(-MAX_ASKS),
    };
    if (update.round) entry.rounds = [...(old.rounds ?? []), update.round].slice(-MAX_ROUNDS);
    this.data.commissions.push(entry);
    this.note(entry.title, stuck, date);
    this.save();
    return structuredClone(entry);
  }

  /**
   * A new commission finished together: the shop counts it, and gathers whatever that count brings
   * (shared/growth.ts). Returns what is new in the shop, usually nothing.
   */
  finished(now = new Date()): GrowthId[] {
    const shop = this.shop();
    shop.done++;
    const date = localDay(now);
    const have = new Set(shop.grown.map((g) => g.id));
    const works = this.data.commissions.filter((c) => c.result === 'done').map((c) => ({ icon: workIcon(c.form) }));
    const fresh = grownBy(shop.done, madeOf(works)).filter((id) => !have.has(id));
    shop.grown.push(...fresh.map((id) => ({ id, date })));
    this.data.shop = shop;
    this.save();
    return fresh;
  }

  /** A neighbour has come to the shop: only the first time is written down. */
  markMet(id: GuestId, now = new Date()) {
    const shop = this.shop();
    if (shop.met?.some((m) => m.id === id)) return;
    shop.met = [...(shop.met ?? []), { id, date: localDay(now) }];
    this.data.shop = shop;
    this.save();
  }

  /** A one-off story has been told. */
  markTold(id: string) {
    const shop = this.shop();
    if (shop.told.includes(id)) return;
    shop.told.push(id);
    this.data.shop = shop;
    this.save();
  }

  /** The shop's days and the works shelf: finished commissions, latest first. */
  shopState(): ShopState {
    const works = [...this.data.commissions].reverse().filter((c) => c.result === 'done').map((c) => ({
      id: c.id, title: c.title, date: c.date, icon: workIcon(c.form), rounds: c.asks?.length ?? 0, hasMain: Boolean(c.main), want: c.form?.want,
    }));
    return { ...structuredClone(this.shop()), works };
  }

  private shop(): ShopDays {
    return this.data.shop ?? { done: 0, grown: [], told: [] };
  }

  /**
   * A work's folder was moved, and the user pointed to where it is now. It may have landed among other things, and only
   * its main file was checked, so all that is there now counts as the user's: nothing later clears it away. The staff's
   * session stays behind, because it belongs to the old folder; they pick up from the summary instead.
   */
  relink(id: string, folder: string) {
    const memo = this.data.commissions.find((c) => c.id === id)!;
    memo.folder = folder;
    // The work itself is the shop's to change; the rest of what is there may be the user's.
    memo.preexisting = readdirSync(folder).filter((name) => name !== memo.main).map((name) => join(folder, name));
    delete memo.sessionId;
    this.save();
  }

  find(id: string): CommissionMemo | undefined {
    const c = this.data.commissions.find((m) => m.id === id);
    return c && structuredClone(c);
  }

  /** The most recent commission, for "change it a bit" on the card that just came back. */
  latest(): CommissionMemo | undefined {
    const c = this.data.commissions.at(-1);
    return c && structuredClone(c);
  }

  private note(title: string, stuck: string[], date: string) {
    for (const note of new Set(stuck)) {
      // The same pit again on the same commission: keep one note, dated the latest time.
      this.data.stuckNotes = this.data.stuckNotes.filter((n) => !(n.commission === title && n.note === note));
      this.data.stuckNotes.push({ commission: title, note, date });
    }
    this.data.stuckNotes = this.data.stuckNotes.slice(-MAX_NOTES);
  }

  /**
   * Forget everything (the notebook's "clear" button), including the copies kept aside when the data
   * folder was upgraded (backup/<date>-v<n>/memory.json, see migrate.ts).
   */
  /** Forget how the rounds went (the ledger page), keeping every work. */
  clearStats() {
    for (const c of this.data.commissions) delete c.rounds;
    this.save();
  }

  clear() {
    this.data = empty();
    rmSync(this.file, { force: true });
    rmSync(`${this.file}.tmp`, { force: true });
    rmSync(this.lastGood, { force: true });
    forgetAside(this.file);
    const backups = join(dirname(this.file), 'backup');
    if (!existsSync(backups)) return;
    // A copy of an unfinished commission says what it was about as well.
    for (const dir of readdirSync(backups)) for (const name of [basename(this.file), 'pending.json']) rmSync(join(backups, dir, name), { force: true });
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
   * What Adeng may say as a round of changes starts: which work it is, and what was asked last time
   * (shortened to fit a bubble).
   */
  recallForRevision(id: string, shorten: (s: string) => string = (x) => x): Recall {
    const c = this.data.commissions.find((m) => m.id === id);
    if (!c) return { flags: [], vars: {} };
    const last = c.asks?.at(-1)?.ask;
    return last ? { flags: ['revise', 'revise_again'], vars: { lastAsk: shorten(last) } } : { flags: ['revise'], vars: {} };
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
    for (const c of this.data.commissions.slice(-RECENT_FOR_NOTES)) for (const [q, a] of Object.entries(c.choices)) choices.set(q, a);
    for (const [q, a] of choices) lines.push(`- Asked "${q}" before, the user chose "${a}".`);
    for (const n of this.data.stuckNotes.filter((s) => s.commission === title)) lines.push(`- On this commission before, "${n.note}" failed at first.`);
    return lines.length ? `Notes from earlier commissions with this user (summaries only):\n${lines.join('\n')}` : '';
  }

  private read(file: string): Memory | null {
    try {
      const m = JSON.parse(readFileSync(file, 'utf8')) as Partial<Memory>;
      if (!Array.isArray(m.commissions)) return null;
      return {
        commissions: m.commissions.filter((c) => c && typeof c.title === 'string' && c.choices && typeof c.choices === 'object'),
        stuckNotes: Array.isArray(m.stuckNotes) ? m.stuckNotes.filter((n) => n && typeof n.note === 'string' && typeof n.commission === 'string') : [],
        greeted: typeof m.greeted === 'string' ? m.greeted : undefined,
        shop: m.shop && typeof m.shop.done === 'number'
          ? { done: m.shop.done, grown: Array.isArray(m.shop.grown) ? m.shop.grown : [], told: Array.isArray(m.shop.told) ? m.shop.told : [], met: Array.isArray(m.shop.met) ? m.shop.met : undefined }
          : undefined,
      };
    } catch {
      return null;
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
