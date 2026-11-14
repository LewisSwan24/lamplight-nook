import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LENT_RULE, commissionPrompt, lentOutputs, revisePrompt } from '../app/main/commission';
import { DecisionBroker } from '../app/main/decision-broker';
import { makePermissionPolicy } from '../app/main/permission-policy';
import { classify } from '../app/main/risk-classifier';
import { VersionStore, entriesIn, tooBigToLend } from '../app/main/versions';

// Bytes that are not text, so "byte for byte" means something.
const LOGO = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff, 0x0d, 0x0a, 0x1a]);

/** A folder of the user's own: a small site, a picture and a note that has nothing to do with the work. */
function lent() {
  const base = mkdtempSync(join(tmpdir(), 'lamplight-lent-'));
  const site = join(base, 'site');
  mkdirSync(join(site, 'css'), { recursive: true });
  writeFileSync(join(site, 'index.html'), '<h1>Mine</h1>\r\n');
  writeFileSync(join(site, 'css', 'style.css'), 'body { color: red }\n');
  writeFileSync(join(site, 'logo.png'), LOGO);
  writeFileSync(join(site, 'notes.txt'), 'shopping list');
  return { site, store: new VersionStore(join(base, 'versions')) };
}
const read = (p: string) => readFileSync(p);

describe('a folder the user lends the shop', () => {
  it('lists every file and folder in it, folders ending in a slash', () => {
    const { site } = lent();
    expect(entriesIn(site)).toEqual(['css/', 'css/style.css', 'index.html', 'logo.png', 'notes.txt']);
  });

  it('is too big when what could be changed passes the cap', () => {
    const { site } = lent();
    expect(tooBigToLend(site, 1024)).toBe(false);
    writeFileSync(join(site, 'video.bin'), Buffer.alloc(2048));
    expect(tooBigToLend(site, 1024)).toBe(true);
  });

  it('undo puts the changed files back byte for byte, takes away what was new, and leaves the rest alone', () => {
    const { site, store } = lent();
    const before = entriesIn(site);
    const original = { index: read(join(site, 'index.html')), css: read(join(site, 'css', 'style.css')), logo: read(join(site, 'logo.png')) };
    store.keepOriginal(site, join(site, 'index.html'));
    writeFileSync(join(site, 'index.html'), '<h1>Changed</h1>');
    // Changed twice: the copy is still the user's own, not the first change.
    store.keepOriginal(site, join(site, 'index.html'));
    writeFileSync(join(site, 'index.html'), '<h1>Changed again</h1>');
    store.keepOriginal(site, join(site, 'css', 'style.css'));
    writeFileSync(join(site, 'css', 'style.css'), 'body { color: blue }');
    store.keepOriginal(site, join(site, 'logo.png'));
    rmSync(join(site, 'logo.png'));
    mkdirSync(join(site, 'pages'));
    writeFileSync(join(site, 'pages', 'contact.html'), '<p>call us</p>');
    store.noteAdded(site, before, entriesIn(site));

    expect(store.lentChanges(site)).toEqual({ changed: ['css/style.css', 'index.html', 'logo.png'], added: ['pages/contact.html'] });
    expect(store.canUndo(site)).toBe(true);
    expect(store.undo(site)).toEqual([]);
    expect(read(join(site, 'index.html'))).toEqual(original.index);
    expect(read(join(site, 'css', 'style.css'))).toEqual(original.css);
    expect(read(join(site, 'logo.png'))).toEqual(original.logo);
    expect(existsSync(join(site, 'pages'))).toBe(false);
    expect(readFileSync(join(site, 'notes.txt'), 'utf8')).toBe('shopping list');
    expect(entriesIn(site)).toEqual(before);
    // Once undone there is nothing left to undo.
    expect(store.canUndo(site)).toBe(false);
  });

  it('a file the user put in a folder the shop made stays, and so does that folder', () => {
    const { site, store } = lent();
    const before = entriesIn(site);
    mkdirSync(join(site, 'pages'));
    writeFileSync(join(site, 'pages', 'contact.html'), 'x');
    store.noteAdded(site, before, entriesIn(site));
    writeFileSync(join(site, 'pages', 'mine.txt'), 'the user\'s');
    store.undo(site);
    expect(existsSync(join(site, 'pages', 'contact.html'))).toBe(false);
    expect(readFileSync(join(site, 'pages', 'mine.txt'), 'utf8')).toBe('the user\'s');
  });

  it('a file kept but left the same is not reported as changed', () => {
    const { site, store } = lent();
    store.keepOriginal(site, join(site, 'index.html'));
    expect(store.lentChanges(site)).toEqual({ changed: [], added: [] });
  });

  it('counts what the shop made over several rounds, and the rest as the user\'s', () => {
    const { site, store } = lent();
    let before = entriesIn(site);
    writeFileSync(join(site, 'a.html'), 'round one');
    store.noteAdded(site, before, entriesIn(site));
    before = entriesIn(site);
    writeFileSync(join(site, 'b.html'), 'round two');
    store.noteAdded(site, before, entriesIn(site));
    expect(store.lentChanges(site).added).toEqual(['a.html', 'b.html']);
    expect(store.usersFiles(site).sort()).toEqual([join(site, 'css', 'style.css'), join(site, 'index.html'), join(site, 'logo.png'), join(site, 'notes.txt')].sort());
  });

  it('undo never reaches outside the folder through a link, and says what it could not put back', () => {
    const { site, store } = lent();
    const outside = mkdtempSync(join(tmpdir(), 'lamplight-outside-'));
    writeFileSync(join(outside, 'contact.html'), 'someone else\'s');
    const before = entriesIn(site);
    store.keepOriginal(site, join(site, 'css', 'style.css'));
    store.keepOriginal(site, join(site, 'index.html'));
    writeFileSync(join(site, 'index.html'), 'changed');
    mkdirSync(join(site, 'pages'));
    writeFileSync(join(site, 'pages', 'contact.html'), 'new');
    store.noteAdded(site, before, entriesIn(site));
    // Both folders turned into links to somewhere else (a junction needs no special rights on Windows).
    rmSync(join(site, 'css'), { recursive: true });
    rmSync(join(site, 'pages'), { recursive: true });
    symlinkSync(outside, join(site, 'css'), 'junction');
    symlinkSync(outside, join(site, 'pages'), 'junction');
    expect(store.undo(site)).toEqual(['css/style.css', 'pages/contact.html']);
    expect(existsSync(join(outside, 'style.css'))).toBe(false);
    expect(readFileSync(join(outside, 'contact.html'), 'utf8')).toBe('someone else\'s');
    // What could be put back was.
    expect(readFileSync(join(site, 'index.html'), 'utf8')).toBe('<h1>Mine</h1>\r\n');
  });

  it('nothing is kept for a round that changed nothing, and dropping forgets what was kept', () => {
    const { site, store } = lent();
    store.noteAdded(site, entriesIn(site), entriesIn(site));
    expect(store.canUndo(site)).toBe(false);
    store.keepOriginal(site, join(site, 'index.html'));
    store.dropLent(site);
    expect(store.canUndo(site)).toBe(false);
  });
});

describe('working in a lent folder', () => {
  const site = join(tmpdir(), 'lamplight-site');
  const own = join(site, 'css', 'style.css');
  const ctx = { workDir: site, preexisting: new Set([own]), keepOriginal: () => {} };

  it('the file tools change the user\'s files without asking, once the original is kept', () => {
    expect(classify('Edit', { file_path: own }, ctx)).toMatchObject({ risk: 'safe', keep: own });
    expect(classify('Write', { file_path: 'css/style.css' }, ctx)).toMatchObject({ risk: 'safe', keep: own });
    // The same file written with forward slashes is still theirs: its original must be kept too.
    expect(classify('Write', { file_path: own.split('\\').join('/') }, ctx)).toMatchObject({ risk: 'safe', keep: own });
    // Windows does not mind the case of a name, so neither does the shop there.
    if (process.platform === 'win32') expect(classify('Edit', { file_path: own.toUpperCase() }, ctx)).toMatchObject({ risk: 'safe', keep: own });
    expect(classify('Write', { file_path: join(site, 'new.html') }, ctx).keep).toBeUndefined();
  });

  it('still asks before changing settings in dot-folders, things that run, and package.json', () => {
    const theirs = ['.git/config', '.github/workflows/build.yml', '.vscode/settings.json', '.gitignore', 'tools/fix.ps1', 'run.bat', 'go.cmd', 'app.exe',
      'old.com', 'hello.vbs', 'build.sh', 'package.json'].map((p) => join(site, p));
    const quiet = ['site.js', 'data.json', 'img/logo.png', 'notes.md'].map((p) => join(site, p));
    const both = { ...ctx, preexisting: new Set([...theirs, ...quiet]) };
    for (const p of theirs) expect(classify('Edit', { file_path: p }, both), p).toEqual({ risk: 'serious', reason: expect.any(String) });
    for (const p of quiet) expect(classify('Edit', { file_path: p }, both), p).toMatchObject({ risk: 'safe', keep: p });
  });

  it('a write through a link in the folder that lands outside it asks', () => {
    const { site: real } = lent();
    const outside = mkdtempSync(join(tmpdir(), 'lamplight-outside-'));
    writeFileSync(join(outside, 'page.html'), 'someone else\'s');
    symlinkSync(outside, join(real, 'linked'), 'junction');
    const here = { workDir: real, preexisting: new Set([join(real, 'index.html'), join(real, 'linked', 'page.html')]), keepOriginal: () => {} };
    expect(classify('Write', { file_path: join(real, 'linked', 'new.html') }, here).risk).toBe('serious');
    expect(classify('Edit', { file_path: join(real, 'linked', 'page.html') }, here)).toEqual({ risk: 'serious', reason: expect.any(String) });
    expect(classify('Write', { file_path: join(real, 'new', 'deep', 'page.html') }, here).risk).toBe('safe');
    expect(classify('Edit', { file_path: join(real, 'index.html') }, here).risk).toBe('safe');
  });

  it('commands still ask, even one that only writes over a file', () => {
    expect(classify('Bash', { command: 'echo hi > css/style.css' }, ctx).risk).toBe('serious');
    expect(classify('Bash', { command: 'rm css/style.css' }, ctx).risk).toBe('serious');
  });

  it('outside a lent folder, changing a file that was there still asks', () => {
    const { keepOriginal: _, ...ordinary } = ctx;
    expect(classify('Edit', { file_path: own }, ordinary).risk).toBe('serious');
  });

  it('the original is kept before the change is let through, with no card', async () => {
    const kept: string[] = [];
    const broker = new DecisionBroker(() => { throw new Error('no card should open'); });
    const policy = makePermissionPolicy({ ...ctx, keepOriginal: (f) => kept.push(f) }, broker, { onRequest: () => {}, onDecision: () => {} });
    const r = await policy('Edit', { file_path: own, old_string: 'a', new_string: 'b' }, { signal: new AbortController().signal } as never);
    expect(r).toMatchObject({ behavior: 'allow' });
    expect(kept).toEqual([own]);
  });

  it('the staff are told the folder is the user\'s, in a new commission and in a round of changes', () => {
    const form = { want: 'Add a contact page', inPlace: site };
    expect(commissionPrompt(form)).toContain(LENT_RULE);
    expect(commissionPrompt({ want: 'Add a contact page' })).not.toContain(LENT_RULE);
    expect(revisePrompt({ ask: 'bigger', form }, false)).toContain(LENT_RULE);
    expect(revisePrompt({ ask: 'bigger', form }, true)).toContain(LENT_RULE);
  });

  it('the result names what was changed and what is new; the main file may be one that was changed', () => {
    const { site } = lent();
    mkdirSync(join(site, 'pages'));
    writeFileSync(join(site, 'pages', 'contact.html'), 'new');
    const r = lentOutputs(site, { changed: ['css/style.css', 'index.html'], added: ['pages/contact.html'] });
    expect(r.files).toEqual([join(site, 'pages', 'contact.html')]);
    expect(r.main).toBe(join(site, 'pages', 'contact.html'));
    expect(r.lent).toEqual({ changed: ['css/style.css', 'index.html'], added: ['pages/contact.html'] });
    expect(lentOutputs(site, { changed: ['index.html'], added: [] }).main).toBe(join(site, 'index.html'));
    // One the user let the staff delete is listed, but is not opened.
    rmSync(join(site, 'index.html'));
    expect(lentOutputs(site, { changed: ['index.html'], added: [] })).toMatchObject({ main: undefined, lent: { changed: ['index.html'] } });
  });
});
