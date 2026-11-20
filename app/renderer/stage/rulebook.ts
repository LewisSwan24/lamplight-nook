// Rules, animation fallbacks and dialogue are bundled as text; the dialogue comes in each language.
// In dev mode (npm run dev), saving any of these YAML files hot-swaps them without a restart.
import rulesText from '../../../rules/cafe.yaml?raw';
import animText from '../../../rules/anim-fallback.yaml?raw';
import zhLines from '../../../lines/cafe.yaml?raw';
import zhChats from '../../../lines/chats.yaml?raw';
import enLines from '../../../lines/en/cafe.yaml?raw';
import enChats from '../../../lines/en/chats.yaml?raw';
// The three shops along the street (road-to-1.4.md D2): rules of their own, and lines laid over the cafe's.
import printRules from '../../../rules/print.yaml?raw';
import studioRules from '../../../rules/studio.yaml?raw';
import workshopRules from '../../../rules/workshop.yaml?raw';
import zhPrint from '../../../lines/print.yaml?raw';
import zhStudio from '../../../lines/studio.yaml?raw';
import zhWorkshop from '../../../lines/workshop.yaml?raw';
import enPrint from '../../../lines/en/print.yaml?raw';
import enStudio from '../../../lines/en/studio.yaml?raw';
import enWorkshop from '../../../lines/en/workshop.yaml?raw';
import { locale } from '../../shared/i18n';
import type { RoomId } from '../../shared/scenes';
import { type Chat, type LineLibrary, chatsForScene, linesForScene, lintChats, lintLines, parseChats, parseLines } from '../translator/lines';
import { parseAnimTable, parseRules, type AnimTable, type Rule } from '../translator/translator';

export type RuleBook = { rules: Rule[]; anims: AnimTable; lines: LineLibrary; chats: Chat[] };

/** A shop's own rule file and lines; the cafe and the study share the cafe's. Only the cafe's reload in dev mode. */
const OWN: Partial<Record<RoomId, { rules: string; zh: string; en: string }>> = {
  print: { rules: printRules, zh: zhPrint, en: enPrint },
  studio: { rules: studioRules, zh: zhStudio, en: enStudio },
  workshop: { rules: workshopRules, zh: zhWorkshop, en: enWorkshop },
};

function build(scene: RoomId, r: string, a: string, l: string, c: string): RuleBook {
  const own = OWN[scene];
  const allLines = { ...parseLines(l), ...(own ? parseLines(english ? own.en : own.zh) : {}) };
  const allChats = parseChats(c);
  const problems = [...lintLines(allLines), ...lintChats(allChats)];
  if (problems.length) console.warn(`Dialogue lint:\n${problems.join('\n')}`);
  // Only what fits the room (shared/scenes.ts).
  return { rules: parseRules(own ? own.rules : r), anims: parseAnimTable(a), lines: linesForScene(allLines, scene), chats: chatsForScene(allChats, scene) };
}

const english = locale() === 'en';
const linesText = english ? enLines : zhLines;
const chatsText = english ? enChats : zhChats;

const texts = { r: rulesText, a: animText, l: linesText, c: chatsText };
const books = new Map<RoomId, RuleBook>();
const listeners = new Set<() => void>();

/** A room's rules and lines, built the first time the room is shown (D2). */
export function ruleBook(room: RoomId): RuleBook {
  const book = books.get(room) ?? build(room, texts.r, texts.a, texts.l, texts.c);
  books.set(room, book);
  return book;
}

/** Called whenever the rule files change (dev mode only); ask `ruleBook` again for the new version. */
export function onRuleBookChange(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

if (import.meta.hot) {
  const update = () => {
    try {
      build('cafe', texts.r, texts.a, texts.l, texts.c);
      books.clear();
      for (const cb of listeners) cb();
      console.info('Rules and dialogue reloaded');
    } catch (err) {
      // A YAML typo shouldn't take the scene down; keep the previous version.
      console.error('Failed to parse rule files; keeping the previous version:', err);
    }
  };
  import.meta.hot.accept('../../../rules/cafe.yaml?raw', (m) => { if (m) { texts.r = m.default; update(); } });
  import.meta.hot.accept('../../../rules/anim-fallback.yaml?raw', (m) => { if (m) { texts.a = m.default; update(); } });
  import.meta.hot.accept('../../../lines/cafe.yaml?raw', (m) => { if (m && !english) { texts.l = m.default; update(); } });
  import.meta.hot.accept('../../../lines/chats.yaml?raw', (m) => { if (m && !english) { texts.c = m.default; update(); } });
  import.meta.hot.accept('../../../lines/en/cafe.yaml?raw', (m) => { if (m && english) { texts.l = m.default; update(); } });
  import.meta.hot.accept('../../../lines/en/chats.yaml?raw', (m) => { if (m && english) { texts.c = m.default; update(); } });
}
