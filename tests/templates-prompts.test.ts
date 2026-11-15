import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { CommissionForm, CommissionTemplate } from '../app/shared/types';

/**
 * Pins what every commission template asks for, word for word, in both languages, so moving the templates
 * into one table (road-to-1.1.md A7) can be shown to change nothing. commission.ts reads the language once
 * when it loads, so each language gets its own fresh copy of the modules.
 */
const IDS: CommissionTemplate[] = ['page', 'research', 'edit', 'tidy', 'letter', 'sheet', 'plan', 'album', 'resume', 'notes', 'travel', 'tool'];

async function inLanguage(lang: 'zh-CN' | 'en') {
  vi.resetModules();
  const i18n = await import('../app/shared/i18n');
  i18n.setLocale(lang);
  return import('../app/main/commission');
}

const form = (template?: CommissionTemplate): CommissionForm => ({
  want: 'W', details: 'D', audience: 'A', template,
  source: template === 'edit' ? 'C:\\u\\notes.md' : template === 'tidy' ? 'C:\\u\\Downloads' : undefined,
  materials: template === 'album' ? ['C:\\u\\a.jpg', 'C:\\u\\b.png'] : undefined,
});

for (const lang of ['zh-CN', 'en'] as const) {
  describe(`template prompts (${lang})`, () => {
    it('a new commission of every kind', async () => {
      const c = await inLanguage(lang);
      const out = Object.fromEntries([undefined, ...IDS].map((t) => [t ?? 'none', c.commissionPrompt(form(t), 'NOTES')]));
      expect(out).toMatchSnapshot();
    });

    it('a round of changes without the earlier session, and a carried-on commission', async () => {
      const c = await inLanguage(lang);
      const out = Object.fromEntries([undefined, ...IDS].map((t) => [t ?? 'none', [
        c.revisePrompt({ ask: 'ASK', form: form(t), summary: 'S' }, false, 'NOTES'),
        c.continuePrompt(form(t), false, 'NOTES'),
      ]]));
      expect(out).toMatchSnapshot();
    });

    it('a round inside a project, with its background first', async () => {
      const c = await inLanguage(lang);
      const revision = { ask: 'ASK', form: form('page'), summary: 'S', background: 'BACKGROUND' };
      const out = [c.revisePrompt(revision, true), c.revisePrompt(revision, false, 'NOTES'), c.continuePrompt(form('page'), false, 'NOTES', revision)];
      for (const prompt of out) expect(prompt.startsWith('BACKGROUND\n\n')).toBe(true);
      expect(out).toMatchSnapshot();
    });

    it('the demo', async () => {
      const c = await inLanguage(lang);
      const demo: CommissionForm = { want: 'W', demo: true };
      expect([c.demoPrompt(demo, 'NOTES'), c.continuePrompt(demo, false), c.commissionTitle(demo)]).toMatchSnapshot();
    });

    it('what the shop puts in the folder first, and which file it shows', async () => {
      const c = await inLanguage(lang);
      const root = mkdtempSync(join(tmpdir(), 'tplsnap-'));
      const doc = join(root, 'notes.md');
      writeFileSync(doc, 'hello', 'utf8');
      const folder = join(root, 'Downloads');
      mkdirSync(folder);
      writeFileSync(join(folder, 'x.txt'), 'x', 'utf8');
      const made: Record<string, string[]> = {};
      for (const t of [undefined, ...IDS]) {
        const work = join(root, `w-${t ?? 'none'}`);
        mkdirSync(work);
        c.prepareSource(work, { want: 'W', template: t, source: t === 'tidy' ? folder : doc });
        made[t ?? 'none'] = readdirSync(work);
      }
      expect(made).toMatchSnapshot();
      expect(readFileSync(join(root, 'w-edit', c.originalName(doc)), 'utf8')).toBe('hello');

      const pick = (names: string[]) => {
        const work = mkdtempSync(join(root, 'out-'));
        for (const n of names) writeFileSync(join(work, n), '', 'utf8');
        const main = c.collectOutputs(work, new Set()).main;
        return main && main.slice(work.length + 1);
      };
      expect([
        pick(['a.md', 'index.html', 'b.csv']),
        pick([c.revisedName(doc), 'page.html', 'a.md']),
        pick(['page.htm', 'a.md']),
        pick(['a.md', 'b.csv']),
        pick(['b.csv']),
        pick(['b.txt']),
        pick(['b.json']),
      ]).toMatchSnapshot();
    });
  });
}

describe('what each kind of work brings to the shop', () => {
  it('growth pieces, shelf icons and guests', async () => {
    vi.resetModules();
    const g = await import('../app/shared/growth');
    const { welcomeGuests } = await import('../app/renderer/game/guests');
    const icons = [{ demo: true }, {}, ...IDS.map((template) => ({ template }))].map((f) => g.workIcon(f));
    const one = Object.fromEntries(g.WORK_ICONS.map((w) => [w, [g.grownBy(0, { [w]: 3 }), welcomeGuests({ [w]: 1 })]]));
    // Pieces brought by one kind of work never show together on a first finish, and none overlap, so only their set is pinned.
    const counted = g.GROWTH.filter((x) => !('work' in x));
    const brought = g.GROWTH.filter((x) => 'work' in x).sort((a, b) => a.id.localeCompare(b.id));
    expect({ counted, brought, icons: g.WORK_ICONS, workIcon: icons, one }).toMatchSnapshot();
  });
});
