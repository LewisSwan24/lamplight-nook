import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { collectOutputs, commissionPrompt } from '../app/main/commission';
import { LOCALES, strings } from '../app/shared/i18n';
import { TEMPLATES, template } from '../app/shared/templates';

// The travel journal (plan-1.8.md H6, Q-H1): not a kind of its own but a layout of the travel guide, picked on the slip
// when the travel guide is. One A4 page to print and take along: the route, a list for each day and a small map of the
// route drawn on the page, saved as a PDF the result card opens.

describe('the travel guide\'s journal layout', () => {
  it('is offered by the travel guide alone, with its words and its files in both languages', () => {
    expect(TEMPLATES.filter((t) => 'layouts' in t).map((t) => [t.id, t.layouts])).toEqual([['travel', ['journal']]]);
    for (const [lang, S] of Object.entries(LOCALES)) {
      const L = S.ui.layout;
      for (const key of ['label', 'plain', 'journal', 'journalHint'] as const) expect(L[key], `${lang} ${key}`).toBeTruthy();
      expect(S.ui.files.journalPage, lang).toMatch(/\.html$/);
      expect(S.ui.files.journalPdf, lang).toMatch(/\.pdf$/);
    }
  });

  it('asks for one A4 page with the route, a list a day and a map drawn on it, saved as a PDF and looked over', () => {
    const F = strings.ui.files;
    const prompt = commissionPrompt({ want: 'Three days in Edinburgh', template: 'travel', layout: 'journal' });
    expect(prompt).toContain('This is a travel journal');
    expect(prompt).not.toContain('This is a travel guide');
    expect(prompt).toContain(`"${F.journalPage}"`);
    expect(prompt).toContain(`Save it as "${F.journalPdf}" with the mcp__nook-office__make_pdf tool`);
    for (const said of [/A4/, /one page/, /inline SVG/, /researcher subagent/, /Read tool/]) expect(prompt).toMatch(said);
    // Nothing from the web on the page: the map is drawn, never a picture of a web map.
    expect(prompt).toMatch(/never a web map/);
  });

  it('leaves the travel guide as it was, and a layout on any other kind changes nothing', () => {
    const guide = commissionPrompt({ want: 'W', template: 'travel' });
    expect(guide).toContain('This is a travel guide');
    expect(guide).not.toContain('travel journal');
    expect(commissionPrompt({ want: 'W', template: 'letter', layout: 'journal' })).toBe(commissionPrompt({ want: 'W', template: 'letter' }));
    expect(template('letter').steps({ language: 'L', files: strings.ui.files, sourceName: '', original: '', revised: '', layout: 'journal' }))
      .toEqual(template('letter').steps({ language: 'L', files: strings.ui.files, sourceName: '', original: '', revised: '' }));
  });

  it('opens the journal\'s PDF on the result card, before the page it was printed from', () => {
    const F = strings.ui.files;
    const dir = mkdtempSync(join(tmpdir(), 'journal-'));
    for (const name of [F.journalPage, F.journalPdf]) writeFileSync(join(dir, name), 'x');
    expect(collectOutputs(dir, new Set(), 'travel').main).toBe(join(dir, F.journalPdf));
  });
});
