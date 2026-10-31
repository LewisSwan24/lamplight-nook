import { parse } from 'yaml';
import { fill, pattern, strings, type Strings } from '../../shared/i18n';
import type { ActorId, GuestId, Speaker } from '../../shared/types';
import type { Holiday, Sky } from '../game/weather';
import type { LineBook } from './director';

export type Line = {
  id: string;
  speaker: ActorId;
  bubbles: string[];
  when?: string;
  reply?: { speaker: ActorId; bubbles: string[] };
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
  /** A neighbour's visit (game/guests.ts): played when they drop in, never as everyday small talk. */
  guest?: GuestId;
  /** Only once the shop has finished this many commissions with the user (plan.md R2.3). */
  after?: number;
  /** A little story told only once, ever (remembered in Adeng's notebook). */
  once?: boolean;
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
    ...(c.guest ? { guest: c.guest } : {}),
    ...(typeof c.after === 'number' ? { after: c.after } : {}),
    ...(c.once ? { once: true } : {}),
    turns: c.turns.map((t) => {
      const [speaker, said] = Object.entries(t)[0];
      return { speaker: speaker as Speaker, text: String(said) };
    }),
  }));
}

export function parseLines(text: string): LineLibrary {
  return parse(text) as LineLibrary;
}

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
 * Returns the turns to say, or null if nothing fits.
 */
export function pickLine(lines: Line[], flags: string[], vars: Record<string, string>): { speaker: ActorId; text: string }[] | null {
  const fits = (l: Line) => [...l.bubbles, ...(l.reply?.bubbles ?? [])].every((b) => [...b.matchAll(/\{(\w+)\}/g)].every((m) => vars[m[1]]));
  const pick = [...lines.filter((l) => l.when && flags.includes(l.when)), ...lines.filter((l) => !l.when)].find(fits);
  if (!pick) return null;
  const say = (speaker: ActorId, bubbles: string[]) => bubbles.map((b) => ({ speaker, text: b.replace(/\{(\w+)\}/g, (_m, k: string) => vars[k]) }));
  return [...say(pick.speaker, pick.bubbles), ...(pick.reply ? say(pick.reply.speaker, pick.reply.bubbles) : [])];
}

/**
 * The greeting as the shop opens: the weather or holiday line, then (once) the question about the last
 * commission, without saying hello twice. The memory question is asked only once, so it is never dropped.
 */
export function openingTurns(lines: Line[], memoryFlags: string[], outside: string[], vars: Record<string, string>) {
  const hello = pickLine(lines, outside, vars);
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
      if (ids.has(id)) problems.push(fill(L.duplicateId, { id }));
      ids.add(id);
      const all = [{ speaker: line.speaker, bubbles: line.bubbles }, ...(line.reply ? [line.reply] : [])];
      for (const { speaker, bubbles } of all) for (const text of bubbles) checkBubble(id, speaker, text, problems, rules);
    }
  }
  return problems;
}

/** The same rules for small talk, plus: at least two turns, unique ids, and a known `when`. */
export function lintChats(chats: Chat[], S: Strings = strings): string[] {
  const rules = rulesFor(S);
  const problems: string[] = [];
  const ids = new Set<string>();
  for (const chat of chats) {
    if (ids.has(chat.id)) problems.push(fill(L.duplicateId, { id: chat.id }));
    ids.add(chat.id);
    const badSky = chat.sky && !['rain', 'snow', 'petals', 'leaves'].includes(chat.sky);
    const badHoliday = chat.holiday && !['halloween', 'christmas', 'new_year'].includes(chat.holiday);
    // A visit opens with the guest, and only that guest comes along.
    const guests = chat.turns.map((t) => t.speaker).filter((s) => s === 'baker' || s === 'postman');
    const badGuest = chat.guest ? !['baker', 'postman'].includes(chat.guest) || chat.turns[0].speaker !== chat.guest || guests.some((g) => g !== chat.guest) : guests.length > 0;
    if (chat.turns.length < 2 || !['idle', 'waiting'].includes(chat.when) || badSky || badHoliday || badGuest) problems.push(fill(L.badChat, { id: chat.id }));
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
