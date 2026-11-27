import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { grownBy, workIcon, type GrowthId, madeOf } from '../shared/growth';
import { localDay } from '../shared/localday';
import { MAIN_FILES, shopOf } from '../shared/templates';
import type { Shop } from '../shared/dispatch';
import { emptyTown, type Gathered, TOWN_MOVE } from '../shared/town';
import { nextChapter, told } from '../shared/stories';
import { bonds, worksBy } from '../shared/crew';
import { RECALL_WORKS, recallOf } from '../shared/memories';
import { nextStaffChapter, toldStaff, type StaffTeller } from '../shared/staffstories';
import { roomGrown, streetGrown } from '../shared/towngrow';
import { forgetAside, putAside } from './aside';
import { addProjects, freeProjectId, projectIdFor, roundAgain, roundInfo } from './projects';
import { afterRound, briefOf, editedBrief } from './project-brief';
import type { CommissionMemo, DataDamage, GuestId, Memory, Project, ProjectBrief, Recall, RoundStat, ShopDays, ShopState } from '../shared/types';
import { PROJECT_CAP_CHOICES } from '../shared/types';

/** How many past commissions' choices go into the notes for Claude: every note is paid for on every commission. */
const RECENT_FOR_NOTES = 20;
const MAX_NOTES = 10;
/** Rounds of changes remembered per commission. */
const MAX_ASKS = 10;
/** Rounds kept per work for the ledger page; older ones drop off. */
const MAX_ROUNDS = 50;

const empty = (): Memory => ({ commissions: [], stuckNotes: [], projects: [] });

/** A commission entry the notebook can use; anything else in the file is left out when it is read. */
export const readable = (c: CommissionMemo | null | undefined): c is CommissionMemo => Boolean(c && typeof c.title === 'string' && c.choices && typeof c.choices === 'object');

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
    // An older version that saved the notebook since the data step lost its projects (road-to-1.2.md B1).
    if (addProjects(this.data).length) this.save();
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

  /**
   * Write down a finished (or failed) commission and what got stuck along the way. Returns its entry. It starts a project
   * of its own, or joins `memo.project`; `usd` is what this round cost.
   */
  remember({ usd, ...memo }: Omit<CommissionMemo, 'id' | 'date'> & { usd?: number }, stuck: string[], now = new Date()): CommissionMemo {
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
    const round = { commission: entry.id, date, ...roundInfo(memo.rounds?.at(-1), usd, memo.summary) };
    if (before) {
      // Still the round it stopped in, of the same project.
      const p = this.project(before.project!);
      p.commissions = p.commissions.map((id) => (id === before.id ? entry.id : id));
      for (const r of p.rounds) if (r.commission === before.id) r.commission = entry.id;
      const at = p.rounds.map((r) => r.commission).lastIndexOf(entry.id);
      p.rounds[at] = roundAgain(p.rounds[at], round);
      entry.project = p.id;
      this.rounded(p, memo.choices, memo.summary);
    } else if (memo.project) {
      const p = this.project(memo.project);
      p.commissions.push(entry.id);
      p.rounds.push({ n: p.rounds.length + 1, ...round });
      this.rounded(p, memo.choices, memo.summary);
    } else {
      const taken = new Set([...this.data.projects.map((p) => p.id), ...this.data.commissions.flatMap((c) => (c.project ? [c.project] : []))]);
      entry.project = freeProjectId(projectIdFor(entry.id), taken);
      this.data.projects.push({
        id: entry.project, title: entry.title, folder: entry.folder, ...(entry.form?.inPlace ? { lent: true } : {}), created: date,
        commissions: [entry.id], rounds: [{ n: 1, ...round }],
      });
    }
    // The talk with Adeng the slip came out of goes on the project, once.
    const talk = memo.form?.consult;
    const joined = this.project(entry.project!);
    if (talk && !joined.consults?.includes(talk)) joined.consults = [...(joined.consults ?? []), talk];
    this.note(memo.title, stuck, date);
    this.save();
    return structuredClone(entry);
  }

  private project(id: string): Project {
    return this.data.projects.find((p) => p.id === id)!;
  }

  /**
   * A round of a project ended. A brief the user changed or forgot is the notebook's to keep up from now on: what was
   * answered joins it and the summary says where the round left off. Until then the brief is read from the notebook.
   */
  private rounded(p: Project, choices: Record<string, string>, summary: string | undefined) {
    if (p.brief) p.brief = afterRound(p.brief, choices, summary);
  }

  /** What the staff remember about a project (B3); undefined for a project there isn't. */
  projectBrief(id: string): ProjectBrief | undefined {
    const p = this.data.projects.find((x) => x.id === id);
    return p && structuredClone(briefOf(p, this.data.commissions));
  }

  /** The user changed what the staff remember: kept as they wrote it, made to fit. False for a project there isn't, or not a brief. */
  editBrief(id: string, edit: unknown, now = new Date()): boolean {
    const p = this.data.projects.find((x) => x.id === id);
    const brief = p && editedBrief(edit, localDay(now));
    if (!p || !brief) return false;
    p.brief = { ...brief, ...(p.brief?.forgotAt ? { forgotAt: p.brief.forgotAt } : {}) };
    this.save();
    return true;
  }

  /**
   * "Forget this project": an empty brief, the changes asked for so far left out of the next prompts, and no session of
   * its commissions picked up again, since the staff's session remembers all of it too.
   */
  forgetProject(id: string, now = new Date()): boolean {
    const p = this.data.projects.find((x) => x.id === id);
    if (!p) return false;
    p.brief = { purpose: '', prefs: [], edited: localDay(now), forgotAt: p.rounds.length };
    for (const c of this.data.commissions) if (p.commissions.includes(c.id)) delete c.sessionId;
    this.save();
    return true;
  }

  /**
   * Another round of changes to a commission already in the notebook: it moves to the top as the latest
   * work, keeps its first choices unless answered again, and remembers what was asked. Its project gets one more round on
   * the timeline; `usd` is what the round cost. Null if it is gone.
   */
  revise(id: string, ask: string, update: Pick<CommissionMemo, 'result' | 'choices'> & Partial<Pick<CommissionMemo, 'costUsd' | 'sessionId' | 'summary' | 'main' | 'touched'>> & { round?: RoundStat; usd?: number }, stuck: string[], now = new Date(), fresh = false): CommissionMemo | null {
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
      // Trying the same round again (after a network failure, say) is still one round; a scheduled one (`fresh`) never is.
      asks: (!fresh && old.asks?.at(-1)?.ask === ask ? old.asks : [...(old.asks ?? []), { ask, date }]).slice(-MAX_ASKS),
    };
    if (update.round) entry.rounds = [...(old.rounds ?? []), update.round].slice(-MAX_ROUNDS);
    // Every round's files belong to the work, whatever the folder still says about the earlier ones.
    if (update.touched) entry.touched = [...new Set([...(old.touched ?? []), ...update.touched])].sort();
    this.data.commissions.push(entry);
    const p = this.project(entry.project!);
    const round = { commission: id, date, ask, ...roundInfo(update.round, update.usd, update.summary) };
    const last = p.rounds.at(-1);
    // Trying the same round again, as with the asks above.
    if (!fresh && last?.commission === id && last.ask === ask) p.rounds[p.rounds.length - 1] = roundAgain(last, round);
    else p.rounds.push({ n: p.rounds.length + 1, ...round });
    this.rounded(p, update.choices, update.summary);
    this.note(entry.title, stuck, date);
    this.save();
    return structuredClone(entry);
  }

  /**
   * A new commission finished together: the shop counts it, and gathers whatever that count brings
   * (shared/growth.ts). Returns what is new in the home shop, usually nothing.
   * Since 1.4 the town grows too (road-to-1.4.md D5): a shop along the street counts its own work as well, and the day
   * each street piece and each piece in that shop came is written down. Pieces already due before this one, as in a
   * shop from before 1.4, are written down on this day too. A shop whose upgrade has not gone through has no town yet.
   */
  finished(now = new Date(), at: Shop = 'home'): GrowthId[] {
    const shop = this.shop();
    shop.done++;
    const date = localDay(now);
    const have = new Set(shop.grown.map((g) => g.id));
    const works = this.data.commissions.filter((c) => c.result === 'done').map((c) => ({ icon: workIcon(c.form) }));
    const fresh = grownBy(shop.done, madeOf(works)).filter((id) => !have.has(id));
    shop.grown.push(...fresh.map((id) => ({ id, date })));
    const town = shop.town;
    if (town) {
      const gather = (list: Gathered[], ids: string[]) => list.push(...ids.filter((id) => !list.some((g) => g.id === id)).map((id) => ({ id, date })));
      gather(town.street, streetGrown(shop.done));
      if (at !== 'home') {
        const own = (town.shops[at] ??= { done: 0, grown: [] });
        own.done++;
        gather(own.grown, roomGrown(at, own.done, madeOf(works)));
      }
    }
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

  /**
   * A neighbour has told the chapter they had waiting (road-to-1.4.md D4): the day is written down. Returns the chapter,
   * or null when they had none today, so a chapter is never told twice and none is skipped.
   */
  tellStory(who: GuestId, now = new Date()): number | null {
    const shop = this.shop();
    if (!shop.town) return null;
    const today = localDay(now);
    const chapter = nextChapter(who, shop.town.stories, shop.done, today);
    if (chapter === null) return null;
    shop.town.stories = told(shop.town.stories, who, shop.done, today);
    this.data.shop = shop;
    this.save();
    return chapter;
  }

  /**
   * A member of staff has told the chapter of their own story they had waiting (plan-1.9.md I1): the day is written
   * down. Returns the chapter, or null when they had none today.
   */
  tellStaffStory(who: StaffTeller, now = new Date()): number | null {
    const shop = this.shop();
    if (!shop.town) return null;
    const today = localDay(now);
    const by = worksBy(this.data.commissions);
    const chapter = nextStaffChapter(who, shop.town.staff ?? {}, by, today);
    if (chapter === null) return null;
    shop.town.staff = toldStaff(shop.town.staff ?? {}, who, by, today);
    this.data.shop = shop;
    this.save();
    return chapter;
  }

  /** The latest finished works, by title and day only, for Adeng to know when talking an order over (plan-1.9.md I5). */
  recentWorks(n = RECALL_WORKS): { title: string; date: string }[] {
    return this.data.commissions.filter((c) => c.result === 'done').slice(-n).reverse().map((c) => ({ title: c.title, date: c.date }));
  }

  /** The shop's days and the works shelf: finished commissions, latest first. `today` by the shop's clock, for the stories. */
  shopState(now = new Date()): ShopState {
    const works = [...this.data.commissions].reverse().filter((c) => c.result === 'done').map((c) => ({
      id: c.id, title: c.title, date: c.date, icon: workIcon(c.form), rounds: c.asks?.length ?? 0, hasMain: Boolean(c.main),
      page: Boolean(c.main && MAIN_FILES.page(c.main)), want: c.form?.want, project: c.project!,
      shop: shopOf(c.form?.demo ? undefined : c.form?.template),
    }));
    return { ...structuredClone(this.shop()), works, today: localDay(now), crew: worksBy(this.data.commissions), bonds: bonds(this.data.commissions), recall: recallOf(this.data.commissions) };
  }

  /** A shop opened since 1.4 starts in the town, with no move to show (road-to-1.4.md D7). */
  private shop(): ShopDays {
    return this.data.shop ?? { done: 0, grown: [], told: [TOWN_MOVE], town: emptyTown() };
  }

  /**
   * A work's folder was moved, and the user pointed to where it is now. It may have landed among other things, and only
   * its main file was checked, so all that is there now counts as the user's: nothing later clears it away. The staff's
   * session stays behind, because it belongs to the old folder; they pick up from the summary instead.
   */
  relink(id: string, folder: string) {
    const memo = this.data.commissions.find((c) => c.id === id)!;
    memo.folder = folder;
    this.project(memo.project!).folder = folder;
    // The work itself is the shop's to change; the rest of what is there may be the user's.
    memo.preexisting = readdirSync(folder).filter((name) => name !== memo.main).map((name) => join(folder, name));
    delete memo.sessionId;
    this.save();
  }

  /**
   * A work in a lent folder was undone: the user's files are theirs again and what it made is gone. Only what could not
   * be put back (`left`) is still the work's, to take away.
   */
  undone(id: string, left: string[]) {
    this.data.commissions.find((c) => c.id === id)!.touched = left;
    this.save();
  }

  /** The user kept or dropped a repair's branch (plan-1.8.md H9). */
  repairDecided(id: string, state: 'kept' | 'dropped') {
    this.data.commissions.find((c) => c.id === id)!.repair!.state = state;
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
  /** Months and projects whose cap Adeng has now said is nearly reached (B8). */
  budgetSaid(keys: string[]) {
    const said = this.data.budgetSaid ?? [];
    this.data.budgetSaid = [...said, ...keys.filter((k) => !said.includes(k))];
    this.save();
  }

  /** The most a project may cost in all: one of the choices, 0 for no cap. False for a project or amount there isn't. */
  setProjectCap(id: string, usd: number): boolean {
    const p = this.data.projects.find((x) => x.id === id);
    if (!p || !(PROJECT_CAP_CHOICES as readonly number[]).includes(usd)) return false;
    if (usd) p.capUsd = usd;
    else delete p.capUsd;
    this.save();
    return true;
  }

  /** These rounds of a project have a version kept now (B2). */
  versionKept(id: string, rounds: number[]) {
    for (const r of this.project(id).rounds) if (rounds.includes(r.n)) r.version = String(r.n);
    this.save();
  }

  /**
   * The project went back to the version of round `from`: one more round on its timeline, under its latest commission.
   * Returns the new round's number.
   */
  reverted(id: string, from: number, now = new Date()): number {
    const p = this.project(id);
    const n = p.rounds.length + 1;
    p.rounds.push({ n, commission: p.commissions.at(-1)!, date: localDay(now), restoredFrom: from });
    this.save();
    return n;
  }

  /**
   * A new project branched off round `round` of another (B2), in its own folder: one commission, done, as the round left
   * the work, which goes on from there with nothing of the old one's session, rounds or spending. Returns the commission.
   */
  forked(source: CommissionMemo, from: { project: string; round: number }, title: string, folder: string, preexisting: string[], summary: string | undefined, now = new Date()): CommissionMemo {
    const date = localDay(now);
    let t = now.getTime();
    while (this.data.commissions.some((c) => c.id === `c${t}`)) t++;
    const taken = new Set([...this.data.projects.map((p) => p.id), ...this.data.commissions.flatMap((c) => (c.project ? [c.project] : []))]);
    const project = freeProjectId(projectIdFor(`c${t}`), taken);
    const { consult: _, ...form } = source.form ?? { want: source.title };
    const entry: CommissionMemo = {
      id: `c${t}`, title, date, result: 'done', choices: { ...source.choices }, folder, form, preexisting, project,
      ...(summary ? { summary } : {}), ...(source.main ? { main: source.main } : {}),
    };
    this.data.commissions.push(entry);
    this.data.projects.push({ id: project, title, folder, created: date, commissions: [entry.id], rounds: [{ n: 1, commission: entry.id, date, ...(summary ? { summary } : {}) }], from });
    this.save();
    return structuredClone(entry);
  }

  /** Put a project away on the board, or take it out again. */
  archive(id: string, on: boolean): boolean {
    const p = this.data.projects.find((x) => x.id === id);
    if (!p) return false;
    if (on) p.archived = true;
    else delete p.archived;
    this.save();
    return true;
  }

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
    for (const dir of readdirSync(backups)) for (const name of [basename(this.file), 'pending.json', 'pending']) rmSync(join(backups, dir, name), { recursive: true, force: true });
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

  /**
   * Notes for the agent's prompt (English, like the rest of the prompt; user text quoted as is). A round inside a project
   * has the project's own preferences in its background (B3), so the questions answered on other work stay out.
   */
  promptNotes(title: string, inProject = false): string {
    const lines: string[] = [];
    const choices = new Map<string, string>();
    for (const c of inProject ? [] : this.data.commissions.slice(-RECENT_FOR_NOTES)) for (const [q, a] of Object.entries(c.choices)) choices.set(q, a);
    for (const [q, a] of choices) lines.push(`- Asked "${q}" before, the user chose "${a}".`);
    for (const n of this.data.stuckNotes.filter((s) => s.commission === title)) lines.push(`- On this commission before, "${n.note}" failed at first.`);
    return lines.length ? `Notes from earlier commissions with this user (summaries only):\n${lines.join('\n')}` : '';
  }

  private read(file: string): Memory | null {
    try {
      const m = JSON.parse(readFileSync(file, 'utf8')) as Partial<Memory>;
      if (!Array.isArray(m.commissions)) return null;
      return {
        commissions: m.commissions.filter(readable),
        // Kept whole, so what a later version wrote in them survives this one saving the notebook.
        projects: Array.isArray(m.projects) ? m.projects.filter((p) => p && typeof p.id === 'string' && Array.isArray(p.commissions) && Array.isArray(p.rounds)) : [],
        stuckNotes: Array.isArray(m.stuckNotes) ? m.stuckNotes.filter((n) => n && typeof n.note === 'string' && typeof n.commission === 'string') : [],
        greeted: typeof m.greeted === 'string' ? m.greeted : undefined,
        budgetSaid: Array.isArray(m.budgetSaid) ? m.budgetSaid.filter((k) => typeof k === 'string') : undefined,
        shop: m.shop && typeof m.shop.done === 'number'
          ? { done: m.shop.done, grown: Array.isArray(m.shop.grown) ? m.shop.grown : [], told: Array.isArray(m.shop.told) ? m.shop.told : [], met: Array.isArray(m.shop.met) ? m.shop.met : undefined, town: m.shop.town }
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
