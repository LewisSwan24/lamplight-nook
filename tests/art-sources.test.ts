import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Where every picture 1.4 adds comes from (road-to-1.4.md D9): docs/art-1.4.md lists each one with its pack or "手画",
// and the script under scripts/art that makes it; docs/art-1.6.md does the same for 1.6 (plan-1.6.md F1 on). The packs
// themselves are not in the repository, so nothing here reads them.

const doc = readFileSync('docs/art-1.4.md', 'utf8').replace(/\r\n/g, '\n');
const docs = ['docs/art-1.4.md', 'docs/art-1.6.md', 'docs/art-1.7.md', 'docs/art-1.8.md'].map((f) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n'));
const art = readFileSync('docs/art.md', 'utf8').replace(/\r\n/g, '\n');
const before = new Set(readFileSync('tests/fixtures/sprites-1.3.txt', 'utf8').split(/\r?\n/).filter(Boolean));

/** The packs docs/art.md lists, by name. */
const packs = [...art.matchAll(/^\| ([^|]+?) \| [^|]+ \| `/gm)].map((m) => m[1]);

/** The rows of the list: picture, where it is used, source, script. */
const rows = docs.flatMap((d) => {
  const table = d.split('\n## 清单\n')[1]?.split('\n## ')[0] ?? '';
  return table.split('\n').filter((l) => /^\| `/.test(l)).map((l) => {
    const [file, use, source, script] = l.split('|').slice(1, -1).map((c) => c.trim().replace(/^`|`$/g, ''));
    return { file, use, source, script };
  });
});

describe('where the 1.4 pictures come from (road-to-1.4.md D9)', () => {
  it('lists the pictures', () => {
    expect(packs).toEqual(expect.arrayContaining(['Modern Interiors', 'Modern Exteriors', 'Modern Farm']));
    expect(rows.length).toBeGreaterThan(10);
    expect(new Set(rows.map((r) => r.file)).size).toBe(rows.length);
  });

  it('gives every picture a source: a pack from docs/art.md, or drawn by hand', () => {
    for (const r of rows) expect(packs.some((p) => r.source.includes(p)) || r.source.includes('手画'), `${r.file}: ${r.source}`).toBe(true);
  });

  it('names the script under scripts/art that makes each picture', () => {
    for (const r of rows) expect(r.script, r.file).toMatch(/^scripts\/art\/\w+\.py$/);
  });

  it('has every picture added since 1.3 on the list', () => {
    const listed = new Set(rows.map((r) => r.file));
    const added = readdirSync('assets/sprites').filter((f) => !before.has(f));
    expect(added.filter((f) => !listed.has(f))).toEqual([]);
  });

  it('a picture on the list that has been made comes from the script named for it', () => {
    for (const r of rows.filter((x) => existsSync(`assets/sprites/${x.file}`))) {
      expect(existsSync(r.script), r.script).toBe(true);
      expect(readFileSync(r.script, 'utf8'), `${r.script} does not write ${r.file}`).toContain(r.file);
    }
  });

  it('says what goes into the installer, and has the question for LimeZu written', () => {
    expect(art).toContain('## What the installer carries');
    expect(doc).toMatch(/\n## 给 LimeZu 的问题\n[\s\S]*\bredistribut/);
  });
});
