import { parse } from 'yaml';
import { fill, pattern, strings } from '../../shared/i18n';
import type { ActorId } from '../../shared/types';
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
  turns: { speaker: ActorId; text: string }[];
};

/** YAML turns are one-key maps (`- xiaoju: text`); flatten them to speaker and text. */
export function parseChats(text: string): Chat[] {
  const raw = (parse(text) ?? []) as { id: string; when: Chat['when']; period?: Chat['period']; turns: Record<string, string>[] }[];
  return raw.map((c) => ({
    id: c.id,
    when: c.when,
    period: c.period,
    turns: c.turns.map((t) => {
      const [speaker, said] = Object.entries(t)[0];
      return { speaker: speaker as ActorId, text: String(said) };
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

const PARTICLES = pattern('particles', 'g');
const EMOTION_WORDS = pattern('emotionWords');
const MAX_BUBBLE = 20;
const L = strings.lineLint;

/** Character count excluding {variables}. */
const visibleLength = (s: string) => [...s.replace(/\{[^}]*\}/g, '')].length;

/**
 * Writing rules for dialogue, checked automatically:
 * at least 3 lines per group, unique ids, <= 20 characters per bubble, at most one particle per bubble,
 * Laoshi never uses particles, and no line names an emotion directly.
 */
export function lintLines(lib: LineLibrary): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  for (const [group, lines] of Object.entries(lib)) {
    if (lines.length < 3) problems.push(fill(L.tooFew, { group }));
    for (const line of lines) {
      const id = line.id;
      if (ids.has(id)) problems.push(fill(L.duplicateId, { id }));
      ids.add(id);
      const all = [{ speaker: line.speaker, bubbles: line.bubbles }, ...(line.reply ? [line.reply] : [])];
      for (const { speaker, bubbles } of all) for (const text of bubbles) checkBubble(id, speaker, text, problems);
    }
  }
  return problems;
}

/** The same rules for small talk, plus: at least two turns, unique ids, and a known `when`. */
export function lintChats(chats: Chat[]): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  for (const chat of chats) {
    if (ids.has(chat.id)) problems.push(fill(L.duplicateId, { id: chat.id }));
    ids.add(chat.id);
    if (chat.turns.length < 2 || !['idle', 'waiting'].includes(chat.when)) problems.push(fill(L.badChat, { id: chat.id }));
    for (const turn of chat.turns) checkBubble(chat.id, turn.speaker, turn.text, problems);
  }
  return problems;
}

function checkBubble(id: string, speaker: ActorId, text: string, problems: string[]) {
  if (visibleLength(text) > MAX_BUBBLE) problems.push(fill(L.tooLong, { id, text, max: MAX_BUBBLE }));
  const particles = text.match(PARTICLES)?.length ?? 0;
  if (speaker === 'laoshi' && particles > 0) problems.push(fill(L.laoshiParticle, { id, text }));
  if (particles > 1) problems.push(fill(L.tooManyParticles, { id, text }));
  if (EMOTION_WORDS.test(text)) problems.push(fill(L.emotionWord, { id, text }));
}
