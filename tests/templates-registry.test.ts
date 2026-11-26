import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LOCALES } from '../app/shared/i18n';
import { WORK_ICONS } from '../app/shared/growth';
import { EDITABLE, MAIN_FILES, MAX_EDIT_BYTES, TEMPLATES, shopOf, template } from '../app/shared/templates';
import { SHOPS } from '../app/shared/dispatch';
import { LIST_ROWS } from '../app/main/office/xlsx';
import { readPng } from './png';

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
    expect(WORK_ICONS).toEqual(['page', 'research', 'edit', 'tidy', 'demo', 'letter', 'sheet', 'plan', 'album', 'resume', 'notes', 'travel', 'tool', 'document', 'slides', 'chart', 'poster', 'menu', 'recipe', 'card', 'newsletter', 'flashcards', 'ledgerbook', 'minigame']);
  });

  it('adds a chart and a poster last, whose result is the picture they draw (road-to-1.3.md C2)', () => {
    expect(TEMPLATES.map((t) => t.id).slice(14, 16)).toEqual(['chart', 'poster']);
    expect(TEMPLATES.slice(14, 16).map((t) => [t.icon, t.main, 'growth' in t])).toEqual([[15, 'picture', false], [16, 'picture', false]]);
    expect(Object.keys(MAIN_FILES)).toEqual(['index', 'revised', 'picture', 'cards', 'journal', 'page', 'office', 'writeup', 'draft', 'table']);
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

  it('adds a menu and a recipe last, both made in the bakery, each with its piece and its neighbour (plan-1.6.md F1)', () => {
    expect(TEMPLATES.map((t) => t.id).slice(16, 18)).toEqual(['menu', 'recipe']);
    expect(TEMPLATES.slice(16, 18).map((t) => [t.shop, t.icon, t.main, 'growth' in t ? t.growth : null, 'guest' in t ? t.guest : null])).toEqual([
      ['bakery', 17, 'picture', { id: 'chalkboard', at: 1 }, 'cook'],
      ['bakery', 18, 'office', { id: 'cookbook', at: 2 }, 'lodger'],
    ]);
    for (const [lang, S] of Object.entries(LOCALES)) {
      const F = S.ui.files;
      expect([F.menuPage, F.menuPng, F.menuPdf, F.recipe].map((n) => n.slice(n.lastIndexOf('.'))), lang).toEqual(['.html', '.png', '.pdf', '.docx']);
      // The menu's picture opens first, before the page it was drawn from or its PDF.
      expect(MAIN_FILES.picture(F.menuPng, F), lang).toBe(true);
      for (const other of [F.menuPage, F.menuPdf]) expect(MAIN_FILES.picture(other, F), `${lang} ${other}`).toBe(false);
      for (const id of ['menu', 'recipe']) {
        expect((S.ui.templates as Record<string, string>)[`${id}Hint`], `${lang} ${id}Hint`).toBeTruthy();
        expect((S.ui.shelf.kinds as Record<string, string>)[id], `${lang} kinds.${id}`).toBeTruthy();
      }
    }
  });

  it('adds a greeting card and a newsletter after the bakery\'s, both made in the post office, each with its piece and its neighbour (plan-1.6.md F2)', () => {
    expect(TEMPLATES.map((t) => t.id).slice(18, 20)).toEqual(['card', 'newsletter']);
    expect(TEMPLATES.slice(18, 20).map((t) => [t.shop, t.icon, t.main, 'growth' in t ? t.growth : null, 'guest' in t ? t.guest : null])).toEqual([
      ['post', 19, 'picture', { id: 'cardline', at: 1 }, 'florist'],
      ['post', 20, 'office', { id: 'newsletters', at: 2 }, 'organizer'],
    ]);
    for (const [lang, S] of Object.entries(LOCALES)) {
      const F = S.ui.files;
      expect([F.cardPage, F.cardPng, F.cardPdf, F.newsletter, F.newsletterPdf].map((n) => n.slice(n.lastIndexOf('.'))), lang).toEqual(['.html', '.png', '.pdf', '.docx', '.pdf']);
      expect(MAIN_FILES.picture(F.cardPng, F), lang).toBe(true);
      for (const other of [F.cardPage, F.cardPdf]) expect(MAIN_FILES.picture(other, F), `${lang} ${other}`).toBe(false);
      for (const id of ['card', 'newsletter']) {
        expect((S.ui.templates as Record<string, string>)[`${id}Hint`], `${lang} ${id}Hint`).toBeTruthy();
        expect((S.ui.shelf.kinds as Record<string, string>)[id], `${lang} kinds.${id}`).toBeTruthy();
      }
    }
  });

  it('adds revision cards after the post office\'s, made at home from what the user is studying, with their piece and their neighbour (plan-1.8.md H1)', () => {
    expect(TEMPLATES.map((t) => t.id).slice(20, 21)).toEqual(['flashcards']);
    const t = template('flashcards');
    expect([t.shop, t.icon, t.main, t.growth, t.guest, t.revise, 'source' in t, 'photos' in t]).toEqual(['home', 21, 'cards', { id: 'cardstack', at: 1 }, 'pupil', true, false, false]);
    for (const [lang, S] of Object.entries(LOCALES)) {
      const F = S.ui.files;
      expect([F.flashcardsPage, F.flashcardsPdf, F.quizPage, F.quizPdf].map((n) => n.slice(n.lastIndexOf('.'))), lang).toEqual(['.html', '.pdf', '.html', '.pdf']);
      expect(new Set([F.flashcardsPage, F.flashcardsPdf, F.quizPage, F.quizPdf]).size, lang).toBe(4);
      // The cards open first: before the pages they were printed from, and before the quiz.
      expect(MAIN_FILES.cards(F.flashcardsPdf, F), lang).toBe(true);
      for (const other of [F.flashcardsPage, F.quizPage, F.quizPdf, 'notes.pdf']) expect(MAIN_FILES.cards(other, F), `${lang} ${other}`).toBe(false);
      expect((S.ui.templates as Record<string, string>).flashcardsHint, `${lang} flashcardsHint`).toBeTruthy();
      expect((S.ui.shelf.kinds as Record<string, string>).flashcards, `${lang} kinds.flashcards`).toBeTruthy();
      // Both are printed from a page with the office tools, and every question comes from the material handed over.
      const steps = t.steps({ language: 'L', files: F, sourceName: '', original: '', revised: '' }).join(' ');
      for (const name of [F.flashcardsPage, F.flashcardsPdf, F.quizPage, F.quizPdf, F.materials]) expect(steps, `${lang} ${name}`).toContain(`"${name}"`);
      expect(steps.match(/mcp__nook-office__make_pdf/g)?.length, lang).toBe(2);
      expect(steps).toMatch(/Every question and every answer must come from that material/);
    }
  });

  it('adds a family ledger last, made in the print shop, whose piece stands in that shop and not at home (plan-1.8.md H5)', () => {
    expect(TEMPLATES.map((t) => t.id).slice(21, 22)).toEqual(['ledgerbook']);
    const t = template('ledgerbook');
    expect([t.shop, t.icon, t.main, t.roomGrowth, t.guest, t.revise, 'growth' in t, 'source' in t, 'photos' in t]).toEqual(['print', 22, 'office', { id: 'ledgerbook', at: 1 }, 'bookkeeper', true, false, false, false]);
    for (const [lang, S] of Object.entries(LOCALES)) {
      const F = S.ui.files;
      expect(F.ledgerbook, lang).toMatch(/\.xlsx$/);
      expect(MAIN_FILES.office(F.ledgerbook), lang).toBe(true);
      expect((S.ui.templates as Record<string, string>).ledgerbookHint, `${lang} ledgerbookHint`).toBeTruthy();
      expect((S.ui.shelf.kinds as Record<string, string>).ledgerbook, `${lang} kinds.ledgerbook`).toBeTruthy();
      // One workbook from the office tools, with a sheet a month, categories to change, a summary and a pie chart.
      const steps = t.steps({ language: 'L', files: F, sourceName: '', original: '', revised: '' }).join(' ');
      expect(steps, lang).toContain(`"${F.ledgerbook}"`);
      expect(steps.match(/mcp__nook-office__make_xlsx/g)?.length, lang).toBe(1);
      for (const said of [/one sheet for each month/, /categories sheet/, /pie chart/, /drop-down list/, /works itself out/, /empty/i]) expect(steps, `${lang} ${said}`).toMatch(said);
      // The sums reach the rows the list does (the real-key run summed 30 rows of a 500-row list), and the check after
      // saving looks at the charts and lists too, now that read_document shows them.
      expect(steps, lang).toContain(`to row ${LIST_ROWS}`);
      expect(steps, lang).toMatch(/each chart and drop-down list/);
      // Both real-key runs wrote January alone again and again before the twelve months came out in one call: the
      // later months are written like the first.
      expect(steps, lang).toMatch(/like: the first month's name/);
    }
  });

  it('adds a small game last, made in the workshop, whose piece stands in the workshop (plan-1.8.md H2)', () => {
    expect(TEMPLATES.map((t) => t.id).slice(-1)).toEqual(['minigame']);
    const t = template('minigame');
    expect([t.shop, t.icon, t.main, t.roomGrowth, t.guest, t.revise, 'growth' in t, 'source' in t, 'photos' in t]).toEqual(['workshop', 23, 'page', { id: 'arcade', at: 1 }, 'dad', true, false, false, false]);
    for (const [lang, S] of Object.entries(LOCALES)) {
      const F = S.ui.files;
      expect(F.minigame, lang).toMatch(/\.html$/);
      expect(F.minigamePng, lang).toMatch(/\.png$/);
      expect(MAIN_FILES.page(F.minigame), lang).toBe(true);
      expect((S.ui.templates as Record<string, string>).minigameHint, `${lang} minigameHint`).toBeTruthy();
      expect((S.ui.shelf.kinds as Record<string, string>).minigame, `${lang} kinds.minigame`).toBeTruthy();
      // One page that plays offline, its first screen drawn as a picture and looked at, and that picture for the reviewer.
      const steps = t.steps({ language: 'L', files: F, sourceName: '', original: '', revised: '' }).join(' ');
      expect(steps, lang).toContain(`"${F.minigame}"`);
      expect(steps, lang).toContain(`"${F.minigamePng}" with the mcp__nook-office__render_png tool`);
      for (const said of [/single self-contained page/, /no libraries/, /straight from disk/, /play again/, /reviewer/, /Read tool/]) expect(steps, `${lang} ${said}`).toMatch(said);
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
    expect(Object.keys(MAIN_FILES)).toEqual(['index', 'revised', 'picture', 'cards', 'journal', 'page', 'office', 'writeup', 'draft', 'table']);
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

  it('keeps every piece a kind of work brings clear of the clock on the wall, which the game draws over the room', () => {
    // The clock's pendulum case (CafeScene addProps, at 180,14): what of its 16x32 frame is drawn.
    const clock = { x0: 182, y0: 24, x1: 194, y1: 41 };
    for (const t of TEMPLATES) {
      if (!('growth' in t)) continue;
      const png = readPng(join('assets', 'sprites', `grow-${t.growth.id}.png`));
      const under: string[] = [];
      for (let y = clock.y0; y < clock.y1; y++) for (let x = clock.x0; x < clock.x1; x++) if (png.at(x, y).alpha > 0) under.push(`${x},${y}`);
      expect(under.length, t.growth.id).toBe(0);
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

  it('sends every kind of work to a shop (road-to-1.4.md D3)', () => {
    const at = (shop: string) => TEMPLATES.filter((t) => t.shop === shop).map((t) => t.id).sort();
    expect(at('print')).toEqual(['document', 'ledgerbook', 'resume', 'sheet', 'slides']);
    expect(at('studio')).toEqual(['album', 'chart', 'poster']);
    expect(at('workshop')).toEqual(['minigame', 'page', 'tool']);
    expect(at('bakery')).toEqual(['menu', 'recipe']);
    expect(at('post')).toEqual(['card', 'newsletter']);
    expect(at('home')).toEqual(['edit', 'flashcards', 'letter', 'notes', 'plan', 'research', 'tidy', 'travel']);
    for (const t of TEMPLATES) expect(SHOPS, t.id).toContain(t.shop);
    // A commission without a kind (written in the user's own words), or the demo, stays in the home shop.
    expect(shopOf(undefined)).toBe('home');
    expect(shopOf('poster')).toBe('studio');
  });

  it('repeats its steps in a round of changes, except research', () => {
    expect(TEMPLATES.filter((t) => !t.revise).map((t) => t.id)).toEqual(['research']);
  });
});
