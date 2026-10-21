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

export function parseLines(text: string): LineLibrary {
  return parse(text) as LineLibrary;
}

/** Line library -> the Director's line book (bubbles joined by newlines). */
export function toLineBook(lib: LineLibrary): LineBook {
  return Object.fromEntries(
    Object.entries(lib).map(([group, lines]) => [group, lines.map((l) => ({ id: l.id, text: l.bubbles.join('\n'), when: l.when, speaker: l.speaker }))]),
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
      for (const { speaker, bubbles } of all) {
        for (const text of bubbles) {
          if (visibleLength(text) > MAX_BUBBLE) problems.push(fill(L.tooLong, { id, text, max: MAX_BUBBLE }));
          const particles = text.match(PARTICLES)?.length ?? 0;
          if (speaker === 'laoshi' && particles > 0) problems.push(fill(L.laoshiParticle, { id, text }));
          if (particles > 1) problems.push(fill(L.tooManyParticles, { id, text }));
          if (EMOTION_WORDS.test(text)) problems.push(fill(L.emotionWord, { id, text }));
        }
      }
    }
  }
  return problems;
}
