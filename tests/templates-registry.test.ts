import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LOCALES } from '../app/shared/i18n';
import { WORK_ICONS } from '../app/shared/growth';
import { EDITABLE, MAX_EDIT_BYTES, TEMPLATES, template } from '../app/shared/templates';

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
    expect(WORK_ICONS).toEqual(['page', 'research', 'edit', 'tidy', 'demo', 'letter', 'sheet', 'plan', 'album', 'resume', 'notes', 'travel', 'tool']);
  });

  it('has a picture and words for every piece a kind of work brings', () => {
    for (const t of TEMPLATES) {
      if (!('growth' in t)) continue;
      expect(existsSync(join('assets', 'sprites', `grow-${t.growth.id}.png`)), t.growth.id).toBe(true);
      for (const S of Object.values(LOCALES)) expect((S.ui.objects.grownMade as Record<string, string>)[t.growth.id]).toBeTruthy();
    }
  });

  it('asks for a text file of up to a megabyte to edit, and a folder to tidy', () => {
    expect(template('edit').source).toEqual({ kind: 'file', extensions: ['txt', 'md', 'html', 'htm', 'csv', 'json'], maxBytes: 1024 * 1024 });
    expect(EDITABLE).toEqual(['txt', 'md', 'html', 'htm', 'csv', 'json']);
    expect(MAX_EDIT_BYTES).toBe(1024 * 1024);
    expect(template('tidy').source).toEqual({ kind: 'folder' });
    expect(TEMPLATES.filter((t) => 'source' in t).map((t) => t.id)).toEqual(['edit', 'tidy']);
    expect(TEMPLATES.filter((t) => 'photos' in t).map((t) => t.id)).toEqual(['album']);
  });

  it('adds a résumé, reading notes, a travel guide and a small tool after the album, each with its own piece', () => {
    expect(TEMPLATES.map((t) => t.id).slice(-5)).toEqual(['album', 'resume', 'notes', 'travel', 'tool']);
    expect(TEMPLATES.slice(-4).map((t) => [t.icon, t.main, 'growth' in t ? t.growth : null])).toEqual([
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
