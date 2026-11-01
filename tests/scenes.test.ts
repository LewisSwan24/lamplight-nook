import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { LOCALES, withScene } from '../app/shared/i18n';
import { SCENES, cleanScene, forScene } from '../app/shared/scenes';
import { chatsForScene, linesForScene, lintChats, lintLines, parseChats, parseLines } from '../app/renderer/translator/lines';

const files = [['zh-CN', 'lines/cafe.yaml', 'lines/chats.yaml'], ['en', 'lines/en/cafe.yaml', 'lines/en/chats.yaml']] as const;

describe('scenes', () => {
  it('knows the cafe and the study, and nothing else', () => {
    expect(SCENES).toEqual(['cafe', 'study']);
    expect(cleanScene('study')).toBe('study');
    expect(cleanScene('moon')).toBeUndefined();
  });

  it("puts a scene's own entry in place of its twin, and leaves other scenes' entries out", () => {
    const items = [{ id: 'a' }, { id: 'b' }, { id: 'b', scene: 'study' }, { id: 'c', scene: 'study' }, { id: 'd', scene: 'cafe' }];
    expect(forScene(items, 'cafe').map((i) => `${i.id}${i.scene ? '@' + i.scene : ''}`)).toEqual(['d@cafe', 'a', 'b']);
    expect(forScene(items, 'study').map((i) => `${i.id}${i.scene ? '@' + i.scene : ''}`)).toEqual(['c@study', 'a', 'b@study']);
  });

  it('renames the spots in the study and keeps the rest of the wording', () => {
    for (const S of Object.values(LOCALES)) {
      const study = withScene(S, 'study');
      expect(study.zones.counter).not.toBe(S.zones.counter);
      expect(study.zones.bell).toBe(S.zones.bell);
      expect(study.ui.setup.welcomeTitle).toBe(S.ui.setup.welcomeTitle);
      expect(withScene(S, 'cafe')).toBe(S);
    }
  });

  for (const [lang, linesFile, chatsFile] of files) {
    it(`gives the study its own lines and chats, all within the writing rules (${lang})`, () => {
      const S = LOCALES[lang];
      const lines = parseLines(readFileSync(linesFile, 'utf8'));
      const chats = parseChats(readFileSync(chatsFile, 'utf8'));
      expect(lintLines(lines, S)).toEqual([]);
      expect(lintChats(chats, S)).toEqual([]);
      const cafe = linesForScene(lines, 'cafe');
      const study = linesForScene(lines, 'study');
      // Nothing in the cafe talks about the desk, and the study's plant sits on the desk.
      expect(cafe.grow.find((l) => l.id === 'grow_plant')!.scene).toBeUndefined();
      expect(study.grow.find((l) => l.id === 'grow_plant')!.scene).toBe('study');
      expect(study.grow.filter((l) => l.id === 'grow_plant')).toHaveLength(1);
      expect(chatsForScene(chats, 'cafe').some((c) => c.id === 'move_in')).toBe(false);
      expect(chatsForScene(chats, 'study').find((c) => c.id === 'move_in')?.once).toBe(true);
    });
  }
});
