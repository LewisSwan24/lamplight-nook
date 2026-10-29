// Rules, animation fallbacks and dialogue are bundled as text; the dialogue comes in each language.
// In dev mode (npm run dev), saving any of these YAML files hot-swaps them without a restart.
import rulesText from '../../../rules/cafe.yaml?raw';
import animText from '../../../rules/anim-fallback.yaml?raw';
import zhLines from '../../../lines/cafe.yaml?raw';
import zhChats from '../../../lines/chats.yaml?raw';
import enLines from '../../../lines/en/cafe.yaml?raw';
import enChats from '../../../lines/en/chats.yaml?raw';
import { locale } from '../../shared/i18n';
import { type Chat, type LineLibrary, lintChats, lintLines, parseChats, parseLines } from '../translator/lines';
import { parseAnimTable, parseRules, type AnimTable, type Rule } from '../translator/translator';

export type RuleBook = { rules: Rule[]; anims: AnimTable; lines: LineLibrary; chats: Chat[] };

function build(r: string, a: string, l: string, c: string): RuleBook {
  const lines = parseLines(l);
  const chats = parseChats(c);
  const problems = [...lintLines(lines), ...lintChats(chats)];
  if (problems.length) console.warn(`Dialogue lint:\n${problems.join('\n')}`);
  return { rules: parseRules(r), anims: parseAnimTable(a), lines, chats };
}

const english = locale() === 'en';
const linesText = english ? enLines : zhLines;
const chatsText = english ? enChats : zhChats;

let current = build(rulesText, animText, linesText, chatsText);
const listeners = new Set<(b: RuleBook) => void>();

export const ruleBook = () => current;

/** Called whenever the rule files change (dev mode only). */
export function onRuleBookChange(cb: (b: RuleBook) => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

if (import.meta.hot) {
  const texts = { r: rulesText, a: animText, l: linesText, c: chatsText };
  const update = () => {
    try {
      current = build(texts.r, texts.a, texts.l, texts.c);
      for (const cb of listeners) cb(current);
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
