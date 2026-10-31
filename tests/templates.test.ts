import { mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SUMMARY_RULE, collectOutputs, commissionPrompt, continuePrompt, listFolder, originalName, prepareSource, revisedName, snapshot } from '../app/main/commission';
import { classify } from '../app/main/risk-classifier';
import { strings } from '../app/shared/i18n';

const F = strings.ui.files;
const dir = (name = 'tpl-') => mkdtempSync(join(tmpdir(), name));

describe('commission templates', () => {
  it('asks every commission to end with a plain note for the result card', () => {
    for (const template of [undefined, 'page', 'research'] as const) expect(commissionPrompt({ want: 'x', template })).toContain(SUMMARY_RULE);
  });

  it('a plain request adds nothing beyond the house rules', () => {
    const p = commissionPrompt({ want: 'w' });
    expect(p).not.toMatch(/index\.html|research commission|tidying/);
    expect(p).toMatch(/Work only inside the current folder/);
  });

  it('a page asks for one self-contained index.html', () => {
    expect(commissionPrompt({ want: 'w', template: 'page' })).toMatch(/single self-contained page named "index\.html"/);
  });

  it('research sends the researcher and writes the summary file, not a page', () => {
    const p = commissionPrompt({ want: 'w', template: 'research' });
    expect(p).toContain(`"${F.summary}"`);
    expect(p).toMatch(/researcher subagent/);
    expect(p).toMatch(/do not make a web page/);
  });

  it('an edit names the copy and the revised file, and forbids changing the copy', () => {
    const p = commissionPrompt({ want: 'w', template: 'edit', source: '/home/u/notes.md' });
    expect(p).toContain(`Do not change "${F.originalPrefix}notes.md"`);
    expect(p).toContain(`"${F.revisedPrefix}notes.md"`);
    expect(p).not.toContain('/home/u');
  });

  it('a tidy plan works from the list and never names where the folder is', () => {
    const p = commissionPrompt({ want: 'w', template: 'tidy', source: '/home/u/Downloads' });
    expect(p).toContain(`"${F.listing}"`);
    expect(p).toContain(`"${F.tidyPlan}"`);
    expect(p).toMatch(/Do not move, rename or delete anything/);
    expect(p).not.toContain('/home/u');
  });

  it('starting over after an interruption keeps the template', () => {
    expect(continuePrompt({ want: 'w', template: 'research' }, false)).toContain(`"${F.summary}"`);
  });
});

describe('preparing the folder', () => {
  it('an edit copies the file in and leaves the original alone', () => {
    const src = join(dir(), 'letter.txt');
    writeFileSync(src, 'hello');
    const work = dir();
    prepareSource(work, { want: 'w', template: 'edit', source: src });
    expect(readFileSync(join(work, originalName(src)), 'utf8')).toBe('hello');
    expect(readFileSync(src, 'utf8')).toBe('hello');
  });

  it('the copy is protected: writing over it is serious, writing the revised file is not', () => {
    const src = join(dir(), 'letter.txt');
    writeFileSync(src, 'hello');
    const work = dir();
    prepareSource(work, { want: 'w', template: 'edit', source: src });
    const ctx = { workDir: work, preexisting: snapshot(work) };
    expect(classify('Write', { file_path: join(work, originalName(src)), content: 'x' }, ctx).risk).toBe('serious');
    expect(classify('Write', { file_path: join(work, revisedName(src)), content: 'x' }, ctx).risk).not.toBe('serious');
  });

  it('a tidy commission gets a list of the folder instead of the folder', () => {
    const src = dir();
    writeFileSync(join(src, 'a.txt'), '12345');
    const work = dir();
    prepareSource(work, { want: 'w', template: 'tidy', source: src });
    expect(readFileSync(join(work, F.listing), 'utf8')).toMatch(/^a\.txt\t5\t\d{4}-\d\d-\d\d$/m);
  });

  it('nothing is prepared without a source', () => {
    const work = dir();
    prepareSource(work, { want: 'w', template: 'tidy' });
    expect(snapshot(work).size).toBe(0);
  });
});

describe('listing a folder', () => {
  it('goes two levels deep, skips hidden files and links, and marks folders', () => {
    const root = dir();
    mkdirSync(join(root, 'photos', '2025', 'deep'), { recursive: true });
    writeFileSync(join(root, 'photos', '2025', 'deep', 'x.jpg'), 'x');
    writeFileSync(join(root, 'photos', 'cat.jpg'), 'meow');
    writeFileSync(join(root, '.secret'), 's');
    symlinkSync(join(root, 'photos'), join(root, 'link'));
    const lines = listFolder(root).trim().split('\n').map((l) => l.split('\t')[0]);
    expect(lines).toEqual(['photos/', 'photos/2025/', 'photos/cat.jpg']);
  });

  it('stops at the cap and says how many more there are', () => {
    const root = dir();
    for (let i = 0; i < 7; i++) writeFileSync(join(root, `f${i}.txt`), '');
    const lines = listFolder(root, 2, 5).trim().split('\n');
    expect(lines).toHaveLength(6);
    expect(lines[5]).toBe('... and 2 more not listed');
  });
});

describe('the main output', () => {
  const made = (...names: string[]) => {
    const work = dir();
    for (const n of names) writeFileSync(join(work, n), '');
    return { work, out: collectOutputs(work, new Set()) };
  };

  it('prefers index.html', () => {
    const { work, out } = made('notes.md', 'index.html', 'other.html');
    expect(out.main).toBe(join(work, 'index.html'));
  });

  it('an edited document comes before other pages', () => {
    const { work, out } = made('draft.html', `${F.revisedPrefix}letter.txt`);
    expect(out.main).toBe(join(work, `${F.revisedPrefix}letter.txt`));
  });

  it('a Markdown write-up counts when there is no page', () => {
    const { work, out } = made(F.summary);
    expect(out.main).toBe(join(work, F.summary));
  });

  it('files there before the run are not outputs', () => {
    const work = dir();
    writeFileSync(join(work, F.listing), '');
    const before = snapshot(work);
    writeFileSync(join(work, F.tidyPlan), '');
    expect(collectOutputs(work, before)).toEqual({ files: [join(work, F.tidyPlan)], main: join(work, F.tidyPlan) });
  });
});
