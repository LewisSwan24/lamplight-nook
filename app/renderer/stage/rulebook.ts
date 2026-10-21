// Rules, animation fallbacks and dialogue are bundled as text.
// In dev mode (npm run dev), saving any of these YAML files hot-swaps them without a restart.
import rulesText from '../../../rules/cafe.yaml?raw';
import animText from '../../../rules/anim-fallback.yaml?raw';
import linesText from '../../../lines/cafe.yaml?raw';
import { lintLines, parseLines, type LineLibrary } from '../translator/lines';
import { parseAnimTable, parseRules, type AnimTable, type Rule } from '../translator/translator';

export type RuleBook = { rules: Rule[]; anims: AnimTable; lines: LineLibrary };

function build(r: string, a: string, l: string): RuleBook {
  const lines = parseLines(l);
  const problems = lintLines(lines);
  if (problems.length) console.warn(`Dialogue lint:\n${problems.join('\n')}`);
  return { rules: parseRules(r), anims: parseAnimTable(a), lines };
}

let current = build(rulesText, animText, linesText);
const listeners = new Set<(b: RuleBook) => void>();

export const ruleBook = () => current;

/** Called whenever the rule files change (dev mode only). */
export function onRuleBookChange(cb: (b: RuleBook) => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

if (import.meta.hot) {
  const texts = { r: rulesText, a: animText, l: linesText };
  const update = () => {
    try {
      current = build(texts.r, texts.a, texts.l);
      for (const cb of listeners) cb(current);
      console.info('Rules and dialogue reloaded');
    } catch (err) {
      // A YAML typo shouldn't take the scene down; keep the previous version.
      console.error('Failed to parse rule files; keeping the previous version:', err);
    }
  };
  import.meta.hot.accept('../../../rules/cafe.yaml?raw', (m) => { if (m) { texts.r = m.default; update(); } });
  import.meta.hot.accept('../../../rules/anim-fallback.yaml?raw', (m) => { if (m) { texts.a = m.default; update(); } });
  import.meta.hot.accept('../../../lines/cafe.yaml?raw', (m) => { if (m) { texts.l = m.default; update(); } });
}
