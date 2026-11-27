import { describe, expect, it } from 'vitest';
import { LOCALES } from '../app/shared/i18n';
import { TEMPLATES } from '../app/shared/templates';
import { ASKS, AUDIENCES, HANDIN_KINDS, handInForm, slipForm } from '../app/shared/handin';

// Handing in without typing (plan-1.8.md H8): materials dragged onto the card, a kind picked from the sample shelf,
// Adeng's questions answered by clicking, and the slip he writes up signed. What comes out is the same commission the
// slip would have made from the same things typed in.
describe('handing in without typing (plan-1.8.md H8)', () => {
  it('puts every kind on the sample shelf but those that start from a file or folder picked on this computer', () => {
    expect(HANDIN_KINDS).toEqual(TEMPLATES.filter((t) => !('source' in t)).map((t) => t.id));
    expect(HANDIN_KINDS).not.toContain('edit');
    expect(HANDIN_KINDS).not.toContain('tidy');
    expect(HANDIN_KINDS).toContain('picturebook');
  });

  it('has two answers ready for each kind, and words for every audience and every ask, in both languages', () => {
    for (const [lang, S] of Object.entries(LOCALES)) {
      const H = S.ui.handin;
      for (const kind of HANDIN_KINDS) {
        const ready = (H.examples as Record<string, string[]>)[kind];
        expect(ready, `${lang} ${kind}`).toHaveLength(2);
        for (const want of ready) expect(want.trim(), `${lang} ${kind}`).toBeTruthy();
      }
      for (const a of AUDIENCES) expect((H.audience as Record<string, string>)[a], `${lang} ${a}`).toBeTruthy();
      for (const a of ASKS) expect((H.asks as Record<string, string>)[a], `${lang} ${a}`).toBeTruthy();
      for (const key of ['open', 'title', 'bagSay', 'bagPick', 'bagNone', 'bagNext', 'shelfSay', 'topicSay', 'own', 'ownDone', 'layoutSay', 'audienceSay', 'askSay', 'slipSay', 'again', 'sign', 'needPhotos', 'firstLabel', 'firstToggle', 'firstHint']) {
        expect((H as Record<string, unknown>)[key], `${lang} ${key}`).toBeTruthy();
      }
    }
  });

  it('makes the same commission as the slip filled in with the same things', () => {
    for (const [lang, S] of Object.entries(LOCALES)) {
      const H = S.ui.handin;
      const want = H.examples.picturebook[0];
      expect(handInForm({ template: 'picturebook', want, audience: 'kids', ask: 'print', materials: ['/m/moon.jpg'] }, H), lang).toEqual(
        slipForm({ want, template: 'picturebook', audience: H.audience.kids, details: H.asks.print, materials: ['/m/moon.jpg'], demoFill: S.ui.demoFill }));
      // A layout of its own, picked by clicking; nothing handed over.
      expect(handInForm({ template: 'travel', layout: 'journal', want: H.examples.travel[1], audience: 'family', ask: 'phone', materials: [] }, H), lang).toEqual(
        slipForm({ want: H.examples.travel[1], template: 'travel', layout: 'journal', audience: H.audience.family, details: H.asks.phone, materials: [], demoFill: S.ui.demoFill }));
    }
  });

  it('leaves out what was not asked for, and takes what was typed when no ready answer fit', () => {
    const H = LOCALES['zh-CN'].ui.handin;
    const form = handInForm({ template: 'letter', want: '  帮我写封信，谢谢王阿姨帮我浇花。 ', ask: 'none', materials: [] }, H);
    expect(form).toEqual({ want: '帮我写封信，谢谢王阿姨帮我浇花。', template: 'letter', demo: false, materials: [] });
    expect(form.details).toBeUndefined();
    expect(form.audience).toBeUndefined();
  });

  it('builds the slip\'s own commission as it always did', () => {
    const demoFill = LOCALES.en.ui.demoFill;
    expect(slipForm({ want: demoFill, template: 'demo', materials: ['/a'], demoFill })).toEqual({ want: demoFill, demo: true, template: undefined, materials: undefined });
    expect(slipForm({ want: ' x ', details: ' ', audience: ' me ', template: 'letter', layout: 'journal', materials: ['/a'], inPlace: '/lent', connections: [], model: 'best', demoFill }))
      .toEqual({ want: 'x', audience: 'me', demo: false, template: 'letter', layout: 'journal', inPlace: '/lent', model: 'best' });
  });
});
