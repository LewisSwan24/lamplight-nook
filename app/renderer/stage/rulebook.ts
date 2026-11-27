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
import bakeryRules from '../../../rules/bakery.yaml?raw';
import postRules from '../../../rules/post.yaml?raw';
import zhPrint from '../../../lines/print.yaml?raw';
import zhStudio from '../../../lines/studio.yaml?raw';
import zhWorkshop from '../../../lines/workshop.yaml?raw';
import zhBakery from '../../../lines/bakery.yaml?raw';
import zhPost from '../../../lines/post.yaml?raw';
import enPrint from '../../../lines/en/print.yaml?raw';
import enStudio from '../../../lines/en/studio.yaml?raw';
import enWorkshop from '../../../lines/en/workshop.yaml?raw';
import enBakery from '../../../lines/en/bakery.yaml?raw';
import enPost from '../../../lines/en/post.yaml?raw';
import { locale } from '../../shared/i18n';
import type { RoomId } from '../../shared/scenes';
import type { ApprenticeStage } from '../../shared/staff';
import { type Chat, type LineLibrary, chatsForScene, chatsForStage, linesForScene, linesForStage, lintChats, lintLines, parseChats, parseLines } from '../translator/lines';
import { parseAnimTable, parseRules, type AnimTable, type Rule } from '../translator/translator';

export type RuleBook = { rules: Rule[]; anims: AnimTable; lines: LineLibrary; chats: Chat[] };

/** A shop's own rule file and lines; the cafe and the study share the cafe's. Only the cafe's reload in dev mode. */
const OWN: Partial<Record<RoomId, { rules: string; zh: string; en: string }>> = {
  print: { rules: printRules, zh: zhPrint, en: enPrint },
  studio: { rules: studioRules, zh: zhStudio, en: enStudio },
  workshop: { rules: workshopRules, zh: zhWorkshop, en: enWorkshop },
  bakery: { rules: bakeryRules, zh: zhBakery, en: enBakery },
  post: { rules: postRules, zh: zhPost, en: enPost },
};

function build(scene: RoomId, r: string, a: string, l: string, c: string): RuleBook {
  const own = OWN[scene];
  const allLines = { ...parseLines(l), ...(own ? parseLines(english ? own.en : own.zh) : {}) };
  const allChats = parseChats(c);
  const problems = [...lintLines(allLines), ...lintChats(allChats)];
  if (problems.length) console.warn(`Dialogue lint:\n${problems.join('\n')}`);
  // Only what fits the room (shared/scenes.ts), and Bean's stage (plan-1.9.md I2).
  return {
    rules: parseRules(own ? own.rules : r), anims: parseAnimTable(a),
    lines: linesForStage(linesForScene(allLines, scene), stage), chats: chatsForStage(chatsForScene(allChats, scene), stage),
  };
}

const english = locale() === 'en';
const linesText = english ? enLines : zhLines;
const chatsText = english ? enChats : zhChats;

const texts = { r: rulesText, a: animText, l: linesText, c: chatsText };
const books = new Map<RoomId, RuleBook>();
const listeners = new Set<() => void>();
/** How far Bean's apprenticeship has come (plan-1.9.md I2): only the lines of this stage are said. */
let stage: ApprenticeStage = 1;

/** A room's rules and lines, built the first time the room is shown (D2). */
export function ruleBook(room: RoomId): RuleBook {
  const book = books.get(room) ?? build(room, texts.r, texts.a, texts.l, texts.c);
  books.set(room, book);
  return book;
}

/** Bean has reached another stage: every room's lines are built again, and everyone listening hears of it. */
export function setApprenticeStage(next: ApprenticeStage) {
  if (next === stage) return;
  stage = next;
  books.clear();
  for (const cb of listeners) cb();
}

/** Called whenever the rule files change (in dev mode), or Bean's stage does; ask `ruleBook` again for the new version. */
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
