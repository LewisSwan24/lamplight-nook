import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LOCALES } from '../app/shared/i18n';
import { WORK_ICONS } from '../app/shared/growth';
import { EDITABLE, MAIN_FILES, MAX_EDIT_BYTES, TEMPLATES, template } from '../app/shared/templates';

/** The one table of templates (road-to-1.1.md A7): every record has what the rest of the app looks up by its id. */
describe('the template table', () => {
  it('has each id once', () => {
    const ids = TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(template(id).id).toBe(id);
  });

  it('names, fills in and explains every template in both languages', () => {
    for (const [lang, S] of Object.entries(LOCALES)) {
      const T = S.ui.templates as Record<string, string>;
      for (const t of TEMPLATES) {
        expect(T[t.id], `${lang} ${t.id}`).toBeTruthy();
        expect(T[`${t.id}Fill`], `${lang} ${t.id}Fill`).toBeTruthy();
        if ('source' in t || 'photos' in t) expect(T[`${t.id}Hint`], `${lang} ${t.id}Hint`).toBeTruthy();
      }
      // What can be handed over for a résumé or reading notes, and how a small tool stays safe.
      for (const id of ['resume', 'notes', 'tool']) expect(T[`${id}Hint`], `${lang} ${id}Hint`).toBeTruthy();
    }
  });

  it('gives every template its own shelf icon, with the demo fifth', () => {
    expect(WORK_ICONS).toEqual(['page', 'research', 'edit', 'tidy', 'demo', 'letter', 'sheet', 'plan', 'album', 'resume', 'notes', 'travel', 'tool', 'document', 'slides', 'chart', 'poster']);
  });

  it('adds a chart and a poster last, whose result is the picture they draw (road-to-1.3.md C2)', () => {
    expect(TEMPLATES.map((t) => t.id).slice(-2)).toEqual(['chart', 'poster']);
    expect(TEMPLATES.slice(-2).map((t) => [t.icon, t.main, 'growth' in t])).toEqual([[15, 'picture', false], [16, 'picture', false]]);
    expect(Object.keys(MAIN_FILES)).toEqual(['index', 'revised', 'picture', 'page', 'office', 'writeup', 'draft', 'table']);
    for (const [lang, S] of Object.entries(LOCALES)) {
      const F = S.ui.files;
      expect([F.chartPage, F.chartPng, F.posterPage, F.posterPng, F.posterPdf].map((n) => n.slice(n.lastIndexOf('.'))), lang).toEqual(['.html', '.png', '.html', '.png', '.pdf']);
      expect(MAIN_FILES.picture(F.chartPng, F) && MAIN_FILES.picture(F.posterPng, F), lang).toBe(true);
      for (const other of ['photo.png', F.chartPage, F.posterPdf]) expect(MAIN_FILES.picture(other, F), `${lang} ${other}`).toBe(false);
      for (const id of ['chart', 'poster']) {
        expect((S.ui.templates as Record<string, string>)[`${id}Hint`], `${lang} ${id}Hint`).toBeTruthy();
        expect((S.ui.shelf.kinds as Record<string, string>)[id], `${lang} kinds.${id}`).toBeTruthy();
      }
    }
  });

  it('adds a Word document and slides after the small tool, made with the shop\'s office tools (road-to-1.3.md C1)', () => {
    expect(TEMPLATES.map((t) => t.id).slice(12, 14)).toEqual(['document', 'slides']);
    expect(TEMPLATES.slice(12, 14).map((t) => [t.icon, t.main, 'growth' in t])).toEqual([[13, 'office', false], [14, 'office', false]]);
    expect(template('sheet').main).toBe('office');
    for (const S of Object.values(LOCALES)) {
      expect(S.ui.files.document).toMatch(/\.docx$/);
      expect(S.ui.files.slides).toMatch(/\.pptx$/);
      expect(S.ui.files.sheet).toMatch(/\.xlsx$/);
      expect(S.ui.files.resumePdf).toMatch(/\.pdf$/);
    }
  });

  it('tells Office files and PDFs apart as main files, after pages and before write-ups', () => {
    expect(Object.keys(MAIN_FILES)).toEqual(['index', 'revised', 'picture', 'page', 'office', 'writeup', 'draft', 'table']);
    for (const f of ['a.docx', 'b.XLSX', 'c.pptx', 'd.pdf']) expect(MAIN_FILES.office(f), f).toBe(true);
    for (const f of ['a.docm', 'b.xlsm', 'c.pptm', 'd.csv', 'e.html']) expect(MAIN_FILES.office(f), f).toBe(false);
  });

  it('has a picture and words for every piece a kind of work brings', () => {
    for (const t of TEMPLATES) {
      if (!('growth' in t)) continue;
      expect(existsSync(join('assets', 'sprites', `grow-${t.growth.id}.png`)), t.growth.id).toBe(true);
      for (const S of Object.values(LOCALES)) expect((S.ui.objects.grownMade as Record<string, string>)[t.growth.id]).toBeTruthy();
    }
  });

  it('asks for a file of up to 20 MB to edit (text, Office or PDF), and a folder to tidy', () => {
    // C3: Word, Excel, PowerPoint and PDF too, never their kinds with macros, up to the 20 MB one handed-over file may be.
    expect(template('edit').source).toEqual({ kind: 'file', extensions: ['txt', 'md', 'html', 'htm', 'csv', 'json', 'docx', 'xlsx', 'pptx', 'pdf'], maxBytes: 20 * 1024 * 1024 });
    expect(EDITABLE).toEqual(['txt', 'md', 'html', 'htm', 'csv', 'json', 'docx', 'xlsx', 'pptx', 'pdf']);
    expect(EDITABLE.some((e) => /m$/.test(e) && e !== 'htm')).toBe(false);
    expect(MAX_EDIT_BYTES).toBe(20 * 1024 * 1024);
    expect(template('tidy').source).toEqual({ kind: 'folder' });
    expect(TEMPLATES.filter((t) => 'source' in t).map((t) => t.id)).toEqual(['edit', 'tidy']);
    expect(TEMPLATES.filter((t) => 'photos' in t).map((t) => t.id)).toEqual(['album']);
  });

  it('adds a résumé, reading notes, a travel guide and a small tool after the album, each with its own piece', () => {
    expect(TEMPLATES.map((t) => t.id).slice(7, 12)).toEqual(['album', 'resume', 'notes', 'travel', 'tool']);
    expect(TEMPLATES.slice(8, 12).map((t) => [t.icon, t.main, 'growth' in t ? t.growth : null])).toEqual([
      [9, 'page', { id: 'briefcase', at: 1 }],
      [10, 'writeup', { id: 'readinglamp', at: 1 }],
      [11, 'index', { id: 'postcards', at: 1 }],
      [12, 'page', { id: 'toolbox', at: 1 }],
    ]);
  });

  it('repeats its steps in a round of changes, except research', () => {
    expect(TEMPLATES.filter((t) => !t.revise).map((t) => t.id)).toEqual(['research']);
  });
});
