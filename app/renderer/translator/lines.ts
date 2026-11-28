import { TOWER_STAGES, type TowerStage } from '../../shared/tower';
import { pairOf, type Bond, type Staffer } from '../../shared/crew';
import { ALL_STAFF, STAFF, type ApprenticeStage } from '../../shared/staff';
import { shortTitle } from '../../shared/memories';
import { GUEST_IDS } from '../game/guests';
import type { WorkIcon } from '../../shared/growth';
import { parse } from 'yaml';
import { fill, pattern, strings, type Strings } from '../../shared/i18n';
import type { ActorId, GuestId, Speaker } from '../../shared/types';
import { HOLIDAYS, SEASONS, type Holiday, type Season, type Sky } from '../game/weather';
import { ROOMS, forScene, type RoomId } from '../../shared/scenes';
import { CHAPTERS, TELLERS, type Teller } from '../../shared/stories';
import { STAFF_CHAPTERS, STAFF_TELLERS, type StaffTeller } from '../../shared/staffstories';
import type { LineBook } from './director';

export type Line = {
  id: string;
  speaker: ActorId;
  bubbles: string[];
  when?: string;
  reply?: { speaker: ActorId; bubbles: string[] };
  /** Said only in this scene; replaces the line with the same id there (shared/scenes.ts). */
  scene?: RoomId;
  /** A line of Bean's said only at this stage of the apprenticeship (plan-1.9.md I2). */
  stage?: ApprenticeStage;
};
export type LineLibrary = Record<string, Line[]>;

/** Small talk (lines/chats.yaml): a few turns, one bubble each. */
export type Chat = {
  id: string;
  when: 'idle' | 'waiting';
  period?: 'dawn' | 'day' | 'dusk' | 'night';
  /** Only on a day with this weather, or while this holiday's decorations are up (game/weather.ts). */
  sky?: Sky;
  holiday?: Holiday;
  /** A neighbour's topic for this season only (with `after`, what they bring up once the shop is a regular stop). */
  season?: Season;
  /** A neighbour's visit (game/guests.ts): played when they drop in, never as everyday small talk. */
  guest?: GuestId;
  /** Only once the shop has finished this many commissions with the user (plan.md R2.3). */
  after?: number;
  /** Only once the shop has finished this kind of work. */
  made?: WorkIcon;
  /** A neighbour asks after the latest work, by name ({lastWork}). */
  mentions?: boolean;
  /** A little story told only once, ever (remembered in Adeng's notebook). */
  once?: boolean;
  /** Only in this scene (shared/scenes.ts); replaces the chat with the same id there. */
  scene?: RoomId;
  /** Only once the two who speak in it are this close (plan-1.9.md I4): 2 close, 3 friends. */
  bond?: Bond;
  /** Only at this stage of Bean's apprenticeship (plan-1.9.md I2); Bean speaks in it. */
  stage?: ApprenticeStage;
  /** Only while the clock tower is mended this far (shared/tower.ts, plan-2.0.md J7). */
  tower?: TowerStage;
  turns: { speaker: Speaker; text: string }[];
};

/** YAML turns are one-key maps (`- xiaoju: text`); flatten them to speaker and text. */
export function parseChats(text: string): Chat[] {
  const raw = (parse(text) ?? []) as (Omit<Chat, 'turns'> & { turns: Record<string, string>[] })[];
  return raw.map((c) => ({
    id: c.id,
    when: c.when,
    period: c.period,
    ...(c.sky ? { sky: c.sky } : {}),
    ...(c.holiday ? { holiday: c.holiday } : {}),
    ...(c.season ? { season: c.season } : {}),
    ...(c.guest ? { guest: c.guest } : {}),
    ...(typeof c.after === 'number' ? { after: c.after } : {}),
    ...(c.once ? { once: true } : {}),
    ...(c.made ? { made: c.made } : {}),
    ...(c.mentions ? { mentions: true } : {}),
    ...(c.scene ? { scene: c.scene } : {}),
    ...(c.bond ? { bond: c.bond } : {}),
    ...(c.stage ? { stage: c.stage } : {}),
    ...(c.tower ? { tower: c.tower } : {}),
    turns: c.turns.map((t) => {
      const [speaker, said] = Object.entries(t)[0];
      return { speaker: speaker as Speaker, text: String(said) };
    }),
  }));
}

export function parseLines(text: string): LineLibrary {
  return parse(text) as LineLibrary;
}

/** The lines and chats for one scene: entries marked for another scene drop out, its own replace their twins. */
export function linesForScene(lib: LineLibrary, scene: RoomId): LineLibrary {
  return Object.fromEntries(Object.entries(lib).map(([group, lines]) => [group, forScene(lines, scene)]));
}
export const chatsForScene = (chats: Chat[], scene: RoomId) => forScene(chats, scene);

/** What fits Bean's stage (plan-1.9.md I2): lines marked for another stage drop out; the rest are said at every stage. */
const atStage = <T extends { stage?: ApprenticeStage }>(entries: T[], stage: ApprenticeStage) => entries.filter((e) => !e.stage || e.stage === stage);
export function linesForStage(lib: LineLibrary, stage: ApprenticeStage): LineLibrary {
  return Object.fromEntries(Object.entries(lib).map(([group, lines]) => [group, atStage(lines, stage)]));
}
export const chatsForStage = (chats: Chat[], stage: ApprenticeStage) => atStage(chats, stage);
const badStage = (stage: unknown, speakers: Speaker[]) => stage !== undefined && (![1, 2, 3].includes(stage as number) || !speakers.includes('xiaodou'));
export const knownScene = (scene: unknown) => scene === undefined || ROOMS.includes(scene as RoomId);

/** Line library -> the Director's line book (bubbles joined by newlines; a reply keeps its own speaker). */
export function toLineBook(lib: LineLibrary): LineBook {
  return Object.fromEntries(
    Object.entries(lib).map(([group, lines]) => [group, lines.map((l) => ({
      id: l.id,
      text: l.bubbles.join('\n'),
      when: l.when,
      speaker: l.speaker,
      reply: l.reply ? { speaker: l.reply.speaker, text: l.reply.bubbles.join('\n') } : undefined,
    }))]),
  );
}

/** The writing rules of a language: bubble length, particles (an exclamation mark in English), emotion words. */
type LintRules = { particles: RegExp; emotions: RegExp; max: number };
const rulesFor = (S: Strings): LintRules => ({ particles: pattern('particles', 'g', S), emotions: pattern('emotionWords', 'i', S), max: S.lineLint.maxBubble });
const L = strings.lineLint;

/**
 * Pick a line from a group for a one-off moment (the greeting): lines whose `when` holds come first,
 * lines with a `when` that doesn't hold are skipped, and every placeholder must have a value.
 * When several lines share the condition that comes first (a festival has three greetings since 1.7), one of them is
 * picked at random. Returns the turns to say, or null if nothing fits.
 */
export function pickLine(
  lines: Line[],
  flags: string[],
  vars: Record<string, string>,
  rand: () => number = Math.random,
): { speaker: ActorId; text: string }[] | null {
  const fits = (l: Line) => [...l.bubbles, ...(l.reply?.bubbles ?? [])].every((b) => [...b.matchAll(/\{(\w+)\}/g)].every((m) => vars[m[1]]));
  // A festival's line before the weather's: Christmas is nearly always snowy, and its greeting was seldom heard.
  const holds = lines.filter((l) => l.when && flags.includes(l.when));
  const festival = holds.filter((l) => l.when!.startsWith('holiday_'));
  const first = [...festival, ...holds.filter((l) => !festival.includes(l)), ...lines.filter((l) => !l.when)].find(fits);
  if (!first) return null;
  const same = first.when ? lines.filter((l) => l.when === first.when && fits(l)) : [first];
  const pick = same[Math.floor(rand() * same.length)];
  const say = (speaker: ActorId, bubbles: string[]) => bubbles.map((b) => ({ speaker, text: b.replace(/\{(\w+)\}/g, (_m, k: string) => vars[k]) }));
  return [...say(pick.speaker, pick.bubbles), ...(pick.reply ? say(pick.reply.speaker, pick.reply.bubbles) : [])];
}

/**
 * The greeting as the shop opens: the weather or holiday line, then (once) the question about the last
 * commission, without saying hello twice. The memory question is asked only once, so it is never dropped.
 */
export function openingTurns(
  lines: Line[],
  memoryFlags: string[],
  outside: string[],
  vars: Record<string, string>,
  rand: () => number = Math.random,
) {
  const hello = pickLine(lines, outside, vars, rand);
  const memory = memoryFlags.length ? pickLine(lines, memoryFlags, vars) : null;
  if (!memory) return hello;
  return hello ? [...hello, ...memory.slice(1)] : memory;
}

/** Character count excluding {variables}. */
const visibleLength = (s: string) => [...s.replace(/\{[^}]*\}/g, '')].length;

/**
 * Writing rules for dialogue, checked automatically:
 * at least 3 lines per group, unique ids, a length limit per bubble (20 characters in Chinese), at most one particle per bubble,
 * Laoshi never uses particles, and no line names an emotion directly.
 */
export function lintLines(lib: LineLibrary, S: Strings = strings): string[] {
  const rules = rulesFor(S);
  const problems: string[] = [];
  const ids = new Set<string>();
  for (const [group, lines] of Object.entries(lib)) {
    if (lines.length < 3) problems.push(fill(L.tooFew, { group }));
    for (const line of lines) {
      const id = line.id;
      // A scene's own version of a line shares its id on purpose.
      const key = `${line.scene ?? ''}:${id}`;
      if (ids.has(key) || !knownScene(line.scene)) problems.push(fill(L.duplicateId, { id }));
      ids.add(key);
      const all = [{ speaker: line.speaker, bubbles: line.bubbles }, ...(line.reply ? [line.reply] : [])];
      if (badStage(line.stage, all.map((a) => a.speaker))) problems.push(fill(L.badStage, { id }));
      for (const { speaker, bubbles } of all) for (const text of bubbles) checkBubble(id, speaker, text, problems, rules);
    }
  }
  return problems;
}

/** The same rules for small talk, plus: at least two turns, unique ids, a known `when`, and a season only for a neighbour. */
/** What each member of staff remembers (lines/memories.yaml, plan-1.9.md I5): two bubbles each, the first naming the work. */
export type MemoryBook = Record<string, string[][]>;
export const parseMemories = (text: string): MemoryBook =>
  Object.fromEntries(Object.entries((parse(text) ?? {}) as Record<string, unknown[][]>).map(([who, list]) => [who, list.map((m) => m.map(String))]));

/** The bubble rules once filled with the longest title and day there can be; the first bubble must name the work and its day. */
export function lintMemories(book: MemoryBook, lang: string, S: Strings = strings): string[] {
  const rules = rulesFor(S);
  const problems: string[] = [];
  const title = shortTitle('一'.repeat(40), lang);
  const date = lang === 'en' ? '30 September' : '12月31号';
  for (const [who, memories] of Object.entries(book)) {
    memories.forEach((m, i) => {
      const id = `memory_${who}_${i + 1}`;
      if (!ALL_STAFF.includes(who as ActorId) || m.length !== 2 || !m[0].includes('{title}') || !m[0].includes('{date}')) problems.push(fill(L.badChat, { id }));
      else for (const b of m) checkBubble(id, who as Speaker, b.replaceAll('{title}', title).replaceAll('{date}', date), problems, rules);
    });
  }
  return problems;
}

/** The pair at home a chat between friends belongs to: its two speakers, or undefined if it is not two of the five. */
export function bondPair(chat: Chat): string | undefined {
  const who = [...new Set(chat.turns.map((t) => t.speaker))];
  return who.length === 2 && who.every((s) => STAFF.includes(s as ActorId)) ? pairOf(who[0] as Staffer, who[1] as Staffer) : undefined;
}

export function lintChats(chats: Chat[], S: Strings = strings): string[] {
  const rules = rulesFor(S);
  const problems: string[] = [];
  const ids = new Set<string>();
  for (const chat of chats) {
    const key = `${chat.scene ?? ''}:${chat.id}`;
    if (ids.has(key)) problems.push(fill(L.duplicateId, { id: chat.id }));
    ids.add(key);
    const badSky = chat.sky && !['rain', 'snow', 'petals', 'leaves', 'fog', 'wind', 'storm'].includes(chat.sky);
    const badHoliday = chat.holiday && !HOLIDAYS.includes(chat.holiday);
    // Only neighbours bring up the season; the staff talk about the weather instead.
    const badSeason = chat.season && (!SEASONS.includes(chat.season) || !chat.guest);
    // A visit opens with the guest, and only that guest comes along.
    const guests = chat.turns.map((t) => t.speaker).filter((s) => GUEST_IDS.includes(s as GuestId));
    const badGuest = chat.guest ? !GUEST_IDS.includes(chat.guest) || chat.turns[0].speaker !== chat.guest || guests.some((g) => g !== chat.guest) : guests.length > 0;
    // A chat between friends is between exactly two of the five at home, close or friends.
    const badBond = chat.bond !== undefined && (![2, 3].includes(chat.bond) || !bondPair(chat));
    const badTower = chat.tower !== undefined && !TOWER_STAGES.includes(chat.tower);
    if (chat.turns.length < 2 || !['idle', 'waiting'].includes(chat.when) || badBond || badTower || badStage(chat.stage, chat.turns.map((t) => t.speaker)) || badSky || badHoliday || badSeason || badGuest || !knownScene(chat.scene)) problems.push(fill(L.badChat, { id: chat.id }));
    for (const turn of chat.turns) checkBubble(chat.id, turn.speaker, turn.text, problems, rules);
  }
  return problems;
}

function checkBubble(id: string, speaker: Speaker, text: string, problems: string[], rules: LintRules) {
  if (visibleLength(text) > rules.max) problems.push(fill(L.tooLong, { id, text, max: rules.max }));
  const particles = text.match(rules.particles)?.length ?? 0;
  if (speaker === 'laoshi' && particles > 0) problems.push(fill(L.laoshiParticle, { id, text }));
  if (particles > 1) problems.push(fill(L.tooManyParticles, { id, text }));
  if (rules.emotions.test(text)) problems.push(fill(L.emotionWord, { id, text }));
}

/** A chapter of a neighbour's story (lines/stories.yaml, road-to-1.4.md D4): told on the street, one bubble a line. */
export type StoryChapter = { title: string; left: string; note: string; lines: string[] };
export type StoryBook = Record<string, StoryChapter[]>;

export function parseStories(text: string): StoryBook {
  const raw = (parse(text) ?? {}) as Record<string, Partial<StoryChapter>[]>;
  return Object.fromEntries(Object.entries(raw).map(([who, chapters]) => [who, chapters.map((c) => ({
    title: String(c.title ?? ''), left: String(c.left ?? ''), note: String(c.note ?? ''), lines: (c.lines ?? []).map(String),
  }))]));
}

/**
 * The bubble rules for the stories too, plus: the three neighbours with five chapters each, every chapter with a title,
 * a note of what it leaves (two bubbles long at most), two to five bubbles, and the thing shared/stories.ts says it leaves.
 */
export function lintStories(book: StoryBook, S: Strings = strings): string[] {
  return lintBook(book, TELLERS, (who) => CHAPTERS[who as Teller], 2, 5, S);
}

/** The staff's own stories (lines/staff-stories.yaml, plan-1.9.md I1): the same, with three chapters each of four to six bubbles. */
/** A chapter of the year's story (lines/year.yaml, plan-2.0.md J7): a title, a note of what changed, and who says what. */
export type YearChapter = { title: string; note: string; lines: { who: Speaker; text: string }[] };

export function parseYear(text: string): YearChapter[] {
  const raw = (parse(text) ?? []) as { title?: unknown; note?: unknown; lines?: Record<string, unknown>[] }[];
  return raw.map((c) => ({
    title: String(c.title ?? ''), note: String(c.note ?? ''),
    lines: (c.lines ?? []).map((l) => { const [who, said] = Object.entries(l)[0]; return { who: who as Speaker, text: String(said) }; }),
  }));
}

/** The bubble rules for every line of the year, and a note no longer than two bubbles. */
export function lintYear(year: YearChapter[], S: Strings = strings): string[] {
  const rules = rulesFor(S);
  const problems: string[] = [];
  year.forEach((c, i) => {
    const id = `year_${i + 1}`;
    if (!c.title || !c.note || visibleLength(c.note) > rules.max * 2) problems.push(fill(L.badStory, { id }));
    for (const l of c.lines) checkBubble(id, l.who, l.text, problems, rules);
  });
  return problems;
}

export function lintStaffStories(book: StoryBook, S: Strings = strings): string[] {
  return lintBook(book, STAFF_TELLERS, (who) => STAFF_CHAPTERS[who as StaffTeller], 4, 6, S);
}

function lintBook(book: StoryBook, tellers: readonly string[], chaptersOf: (who: string) => { left: string }[], fewest: number, most: number, S: Strings): string[] {
  const rules = rulesFor(S);
  const problems: string[] = [];
  for (const who of Object.keys(book)) if (!tellers.includes(who)) problems.push(fill(L.badStory, { id: who }));
  for (const who of tellers) {
    const chapters = book[who] ?? [];
    const table = chaptersOf(who);
    if (chapters.length !== table.length) problems.push(fill(L.badStory, { id: who }));
    chapters.forEach((c, i) => {
      const id = `${who}_${i + 1}`;
      const bad = !c.title || !c.note || visibleLength(c.note) > rules.max * 2 || c.lines.length < fewest || c.lines.length > most || c.left !== table[i]?.left;
      if (bad) problems.push(fill(L.badStory, { id }));
      for (const text of c.lines) checkBubble(id, who as Speaker, text, problems, rules);
    });
  }
  return problems;
}
