import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { LOCALES, pickLocale, shorten } from '../app/shared/i18n';
import { lintChats, lintLines, parseChats, parseLines } from '../app/renderer/translator/lines';

const zh = LOCALES['zh-CN'];
const en = LOCALES.en;

/** Every leaf of a locale as path -> value. */
function leaves(node: unknown, path = ''): Map<string, unknown> {
  const out = new Map<string, unknown>();
  if (node && typeof node === 'object' && !Array.isArray(node)) {
    for (const [k, v] of Object.entries(node)) for (const [p, x] of leaves(v, path ? `${path}.${k}` : k)) out.set(p, x);
  } else out.set(path, node);
  return out;
}
const placeholders = (v: unknown) => [...JSON.stringify(v).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('the English locale', () => {
  const a = leaves(zh);
  const b = leaves(en);

  it('has exactly the keys the Chinese one has', () => {
    expect([...b.keys()].sort()).toEqual([...a.keys()].sort());
  });

  it('keeps every placeholder', () => {
    const off = [...a].filter(([k, v]) => placeholders(v).join() !== placeholders(b.get(k)).join()).map(([k]) => k);
    expect(off).toEqual([]);
  });

  it('has no Chinese left, except the name of the Chinese option and words the parsers also accept', () => {
    const allowed = new Set(['ui.setup.languageZh', 'ui.setup.languageLabel', 'patterns.planWords', 'patterns.reviewPassed', 'patterns.reviewFailed']);
    const left = [...b].filter(([k, v]) => !allowed.has(k) && /[\u4e00-\u9fff]/.test(JSON.stringify(v))).map(([k]) => k);
    expect(left).toEqual([]);
  });

  it('calls the staff by their English names, in the app and in what they say', () => {
    const inside = /\b(Adeng|Xiaoju|Laoshi|Qingdai)\b/;
    const shown = [...b].filter(([k, v]) => k !== 'lineLint.laoshiParticle' && inside.test(JSON.stringify(v))).map(([k]) => k);
    expect(shown).toEqual([]);
    for (const file of ['lines/en/cafe.yaml', 'lines/en/chats.yaml']) expect(readFileSync(file, 'utf8')).not.toMatch(inside);
  });

  it('keeps file names safe on Windows', () => {
    for (const name of Object.values(en.ui.files)) expect(name).not.toMatch(/[\\/:*?"<>|]/);
  });
});

describe('the English dialogue', () => {
  const lines = parseLines(readFileSync('lines/en/cafe.yaml', 'utf8'));
  const zhLines = parseLines(readFileSync('lines/cafe.yaml', 'utf8'));

  it('follows the English writing rules', () => {
    expect(lintLines(lines, en)).toEqual([]);
    expect(lintChats(parseChats(readFileSync('lines/en/chats.yaml', 'utf8')), en)).toEqual([]);
  });

  it('has the same groups, ids and conditions as the Chinese lines', () => {
    const shape = (lib: typeof lines) => Object.entries(lib).map(([g, ls]) => `${g}:${ls.map((l) => `${l.id}/${l.speaker}/${l.when ?? ''}/${l.reply?.speaker ?? ''}`).join(',')}`);
    expect(shape(lines)).toEqual(shape(zhLines));
  });

  it('uses the same placeholders line by line', () => {
    const vars = (lib: typeof lines) => Object.values(lib).flat().map((l) => `${l.id}:${placeholders([...l.bubbles, ...(l.reply?.bubbles ?? [])]).join()}`);
    expect(vars(lines)).toEqual(vars(zhLines));
  });

  it('a long English bubble fails the English rules', () => {
    const long = { g: [1, 2, 3].map((i) => ({ id: `x${i}`, speaker: 'adeng' as const, bubbles: ['This bubble is far too long to fit in the speech bubble.'] })) };
    expect(lintLines(long, en)).toHaveLength(3);
  });

  it('Flint never exclaims', () => {
    const loud = { g: [1, 2, 3].map((i) => ({ id: `y${i}`, speaker: 'laoshi' as const, bubbles: ['Mm!'] })) };
    expect(lintLines(loud, en).every((p) => p.includes('Laoshi'))).toBe(true);
  });
});

describe('choosing the language', () => {
  it('a choice in settings wins', () => {
    expect(pickLocale('en', ['zh-CN'])).toBe('en');
    expect(pickLocale('zh-CN', ['en-US'])).toBe('zh-CN');
  });

  it('otherwise the first system language we have', () => {
    expect(pickLocale('system', ['zh-TW', 'en-US'])).toBe('zh-CN');
    expect(pickLocale(undefined, ['fr-FR', 'en-GB', 'zh-CN'])).toBe('en');
    expect(pickLocale(undefined, ['zh-Hans-CN'])).toBe('zh-CN');
  });

  it('anything else gets English', () => {
    expect(pickLocale(undefined, ['de-DE'])).toBe('en');
    expect(pickLocale('fr', [])).toBe('en');
  });
});

describe('shortening what the user wrote', () => {
  it('Chinese: the first ten characters', () => {
    expect(shorten(zh.ui.demoFill, zh)).toBe([...zh.ui.demoFill].slice(0, 10).join(''));
    expect([...shorten(zh.ui.demoFill, zh)]).toHaveLength(10);
  });

  it('English: whole words, a few of them', () => {
    expect(shorten('Make me a small web page that shows the weather in my town', en)).toBe('Make me a small web page');
    expect(shorten('Short one', en)).toBe('Short one');
  });
});

describe('the wording of the locales', () => {
  it('calls changing finished work the same thing everywhere', () => {
    for (const locale of [zh, en]) {
      const names = [...leaves(locale)].filter(([k]) => /\.(revise|resultRevise)$|\.revise\.title$/.test(k)).map(([, v]) => v);
      expect(names.length).toBeGreaterThanOrEqual(4);
      expect(new Set(names).size).toBe(1);
    }
  });

  it('uses Chinese quotation marks in Chinese text', () => {
    const straight = [...leaves(zh)].filter(([, v]) => typeof v === 'string' && /[一-鿿]/.test(v) && v.includes('"')).map(([k]) => k);
    expect(straight).toEqual([]);
  });

  it('does not name the rooms differently from the room picker in the furnishing hint', () => {
    expect(zh.ui.furnish.hint).not.toContain('咖啡厅');
    expect(en.ui.furnish.hint).not.toContain('café');
  });
});

describe('how the budget is described', () => {
  it('says the limit is per round everywhere, as the app applies it', () => {
    const budget = (locale: typeof zh) => [...leaves(locale)].filter(([k]) => /budget(Cap|NoCap|Label|Title|Text)$/.test(k)).map(([, v]) => String(v)).join('\n');
    expect(budget(zh)).not.toMatch(/这张单|这单|每次开工|这次开工/);
    expect(budget(en)).not.toMatch(/This commission|per run|per-run|This run/);
  });
});

describe('the privacy note (road-to-1.3.md C9)', () => {
  const note = (locale: typeof zh) => (locale.legal.privacy as string[]).join('\n');

  it('says what a connection sends to Anthropic and that the calendar is fetched from this computer', () => {
    expect(note(zh)).toMatch(/网盘文件夹[^\n]*日历[^\n]*发给 Anthropic/);
    expect(note(zh)).toMatch(/日历的订阅地址[^\n]*这台电脑/);
    expect(note(en)).toMatch(/synced folder[^\n]*calendar[^\n]*sent to Anthropic/i);
    expect(note(en)).toMatch(/calendar's address[^\n]*this computer/i);
  });

  it('lists the connections and the record of outside actions among what stays on the computer', () => {
    expect(note(zh)).toMatch(/连接[^\n]*外部动作的记录/);
    expect(note(en)).toMatch(/connections[^\n]*record of outside actions/i);
  });
});
