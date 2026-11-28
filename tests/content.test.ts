import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
// @ts-expect-error a plain .mjs script, run by `npm run content`
import { count, loadTables, render, sameCounts } from '../scripts/content.mjs';

// The content count (plan-1.6.md F0): what the app has, counted from the code's tables and the files on disk, written to
// docs/content.md with what changed since the last count, and four checks that keep the content in step.

const SAMPLE = 'tests/fixtures/content';
/** The code's tables for the sample: two kinds, two shops along the street, one storyteller whose chapters clash. */
const tables = {
  templates: [{ id: 'menu', shop: 'bakery' }, { id: 'card', shop: 'post' }],
  scenes: ['cafe', 'study'],
  rooms: ['cafe', 'study', 'bakery', 'post'],
  staff: ['adeng', 'xiaoju', 'baker'],
  guests: ['baker', 'postman'],
  tellers: { baker: [{ works: 3, left: 'bread' }, { works: 2, left: 'oven' }, { works: 9, left: 'sign' }] },
  growth: { shop: 4, street: 2, fronts: 1, rooms: 3 },
  holidays: ['lantern', 'mid_autumn'],
  year: ['granny', 'adeng'],
};

describe('counting the content (plan-1.6.md F0)', () => {
  const c = count(SAMPLE, tables);
  const total = (label: string) => c.totals.find((t: { label: string }) => t.label === label)?.value;

  it('counts the people and the places', () => {
    expect(total('委托种类')).toBe(2);
    // The home shop is one shop, in either of its two rooms.
    expect(total('能进的店')).toBe(3);
    expect(total('店员')).toBe(3);
    expect(total('客人')).toBe(2);
    expect(total('讲故事的人')).toBe(1);
    expect(total('故事章数')).toBe(3);
    // The year's story (plan-2.0.md J10): one chapter for each of its tellers.
    expect(total('主线章数')).toBe(2);
  });

  it('counts the things: what grows, the festivals, the pictures', () => {
    expect(total('长出来的东西')).toBe(10);
    expect(total('节日')).toBe(2);
    expect(total('图')).toBe(3);
  });

  it('counts the lines file by file, in each language', () => {
    const cafe = c.lines.find((l: { file: string }) => l.file === 'cafe.yaml');
    expect(cafe).toEqual({ file: 'cafe.yaml', keys: 3, zh: 4, en: 5 });
    expect(c.lines.find((l: { file: string }) => l.file === 'chats.yaml')).toEqual({ file: 'chats.yaml', keys: 1, zh: 3, en: 3 });
    // A story's chapter is a key; its lines are what is said.
    expect(c.lines.find((l: { file: string }) => l.file === 'stories.yaml')).toEqual({ file: 'stories.yaml', keys: 2, zh: 3, en: 3 });
    // So is a chapter of the year's story, whoever says each line.
    expect(c.lines.find((l: { file: string }) => l.file === 'year.yaml')).toEqual({ file: 'year.yaml', keys: 2, zh: 3, en: 3 });
    expect(total('台词（中文句）')).toBe(15);
    expect(total('台词（英文句）')).toBe(15);
  });

  it('finds an English line missing', () => {
    expect(c.problems).toContain('lines/en/bakery.yaml 缺 bk_open_02');
  });

  it('finds a picture that is on no art list', () => {
    expect(c.problems).toContain('assets/sprites/stray.png 不在美术清单里');
    expect(c.problems.join('\n')).not.toMatch(/\b(a|b)\.(png|json)\b/);
  });

  it('finds story chapters that clash with each other or with the story file', () => {
    expect(c.problems).toContain('baker 第 2 章要 2 单，不比上一章多');
    expect(c.problems).toContain('baker 的故事在代码里 3 章，lines/stories.yaml 里 2 章');
  });

  it('finds the year\'s story with more or fewer chapters than it has tellers', () => {
    expect(c.problems.join('\n')).not.toMatch(/主线/);
    const more = count(SAMPLE, { ...tables, year: ['granny', 'adeng', 'baker'] }).problems;
    expect(more).toContain('主线在代码里 3 章，lines/year.yaml 里 2 章');
    expect(more).toContain('主线在代码里 3 章，lines/en/year.yaml 里 2 章');
  });

  it('finds a shop without its own lines', () => {
    expect(c.problems).toContain('post 没有 lines/post.yaml');
    expect(c.problems).toContain('post 没有 lines/en/post.yaml');
    expect(c.problems.join('\n')).not.toMatch(/bakery\.yaml 不/);
  });
});

describe('writing docs/content.md', () => {
  const first = render(count(SAMPLE, tables), '');

  it('writes a table of the totals and one of the lines', () => {
    expect(first).toMatch(/\| 委托种类 \| 2 \| {2}\|/);
    expect(first).toMatch(/\| `cafe\.yaml` \| 3 \| 4 \| 5 \| {2}\|/);
    expect(first).toContain('## 问题');
  });

  it('says what changed since the last count', () => {
    const more = { ...tables, templates: [...tables.templates, { id: 'recipe', shop: 'bakery' }] };
    const next = render(count(SAMPLE, more), first);
    expect(next).toMatch(/\| 委托种类 \| 3 \| \+1 \|/);
    expect(next).toMatch(/\| 店员 \| 3 \| {2}\|/);
  });

  it('leaves the file as it is when nothing has changed, so the last change stays on record', () => {
    const more = { ...tables, templates: [...tables.templates, { id: 'recipe', shop: 'bakery' }] };
    const next = render(count(SAMPLE, more), first);
    expect(render(count(SAMPLE, more), next)).toBe(next);
    expect(sameCounts(count(SAMPLE, more), next)).toBe(true);
    expect(sameCounts(count(SAMPLE, tables), next)).toBe(false);
  });
});

describe('the real content', () => {
  it('passes the four checks', async () => {
    expect(count('.', await loadTables()).problems).toEqual([]);
  });

  it('is what docs/content.md says (npm run content)', async () => {
    expect(sameCounts(count('.', await loadTables()), readFileSync('docs/content.md', 'utf8'))).toBe(true);
  });
});
