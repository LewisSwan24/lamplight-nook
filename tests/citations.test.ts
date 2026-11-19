import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkCitations, citationsIn, normalizeUrl, sourceUrl, urlsSeen } from '../app/main/citations';

const sources = (list: unknown[], unsourced: string[] = []) => JSON.stringify({ sources: list, unsourced });
const src = (n: number, url: string, title = `Source ${n}`) => ({ n, title, url, checked: '2026-11-19' });

const summary = [
  '# Tomatoes on a balcony',
  '',
  'Three sentences. Most sources agree [1]. One does not [2].',
  '',
  '## Key points',
  '- Six hours of sun a day [1][3]',
  '- Water in the morning [2]',
  '- Pots of at least 20 litres',
  '- Copper tape keeps slugs away (no source found)',
  '',
  '## Sources',
  '1. Garden guide https://example.org/a',
  '2. Grower forum https://example.org/b',
  '3. Seed catalogue https://example.org/c',
].join('\n');

describe('checking a research summary against its sources (road-to-1.3.md C7)', () => {
  it('reads the numbers of each point and finds every source they name', () => {
    const c = checkCitations(summary, sources([src(1, 'https://example.org/a'), src(2, 'https://example.org/b'), src(3, 'https://example.org/c')]), []);
    expect(c.sources.map((s) => s.n)).toEqual([1, 2, 3]);
    expect(c.missing).toEqual([]);
    expect(c.broken).toBeUndefined();
  });

  it('names the points with no number, leaving out the sources section and points said to have none', () => {
    const c = checkCitations(summary, sources([src(1, 'https://example.org/a'), src(2, 'https://example.org/b'), src(3, 'https://example.org/c')]), []);
    expect(c.unnumbered).toEqual(['Pots of at least 20 litres']);
    const zh = checkCitations('## 要点\n- 每天六小时日照 [1]\n- 铜胶带能挡蛞蝓（未找到出处）\n- 盆至少二十升\n\n## 出处\n- 园艺指南 https://example.org/a', sources([src(1, 'https://example.org/a')]), []);
    expect(zh.unnumbered).toEqual(['盆至少二十升']);
  });

  it('names a number the sources do not have', () => {
    const c = checkCitations(`${summary}\n`.replace('[2]', '[4]'), sources([src(1, 'https://example.org/a'), src(2, 'https://example.org/b'), src(3, 'https://example.org/c')]), []);
    expect(c.missing).toEqual([4]);
  });

  it('marks each source opened only if this round searched or fetched its address, spelled any usual way', () => {
    const c = checkCitations(summary, sources([src(1, 'https://www.Example.org/a/'), src(2, 'http://example.org/b#part'), src(3, 'https://example.org/c?id=7')]),
      ['https://example.org/a', 'https://example.org/b', 'https://example.org/c?id=8']);
    expect(c.sources.map((s) => [s.n, s.opened])).toEqual([[1, true], [2, true], [3, false]]);
    expect(c.sources[0].site).toBe('example.org');
    expect(normalizeUrl('HTTPS://WWW.Example.org/a/#x')).toBe(normalizeUrl('http://example.org/a'));
  });

  it('lists the conclusions with no source word for word', () => {
    const c = checkCitations(summary, sources([src(1, 'https://example.org/a')], ['  Copper tape keeps slugs away ', '铜胶带能挡蛞蝓']), []);
    expect(c.unsourced).toEqual(['  Copper tape keeps slugs away ', '铜胶带能挡蛞蝓']);
  });

  it('says when sources.json is missing or cannot be read, and shows no sources then', () => {
    expect(checkCitations(summary, undefined, [])).toMatchObject({ broken: 'noSources', sources: [] });
    expect(checkCitations(summary, '{ not json', [])).toMatchObject({ broken: 'unreadable', sources: [] });
    expect(checkCitations(summary, JSON.stringify({ sources: 'x' }), [])).toMatchObject({ broken: 'unreadable', sources: [] });
  });

  it('reads both files from the commission folder by the shop\'s names for them', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cite-'));
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'summary.md'), summary);
    writeFileSync(join(dir, 'sources.json'), sources([src(1, 'https://example.org/a')]));
    const c = citationsIn(dir, { summary: 'summary.md', sources: 'sources.json' }, ['https://example.org/a']);
    expect(c.sources).toEqual([{ n: 1, title: 'Source 1', url: 'https://example.org/a', site: 'example.org', opened: true }]);
    expect(c.missing).toEqual([2, 3]);
  });
});

describe('opening a source', () => {
  const list = sources([src(1, 'https://example.org/a'), src(2, 'javascript:alert(1)'), src(3, 'file:///C:/Windows/system32/calc.exe'), src(4, 'ftp://example.org/x'), src(5, 'http://example.org/e')]);

  it('gives the address of source n only when it is http or https', () => {
    expect(sourceUrl(list, 1)).toBe('https://example.org/a');
    expect(sourceUrl(list, 5)).toBe('http://example.org/e');
    for (const n of [2, 3, 4, 9]) expect(sourceUrl(list, n), String(n)).toBeUndefined();
    expect(sourceUrl('{ not json', 1)).toBeUndefined();
  });
});

describe('the addresses a round saw', () => {
  it('a fetch is its address, a search every address in its results, anything else none', () => {
    expect(urlsSeen({ hook_event_name: 'PostToolUse', tool_name: 'WebFetch', tool_input: { url: 'https://example.org/a', prompt: 'x' }, tool_response: 'text' })).toEqual(['https://example.org/a']);
    expect(urlsSeen({
      hook_event_name: 'PostToolUse', tool_name: 'WebSearch', tool_input: { query: 'q' },
      tool_response: { results: [{ content: [{ title: 'A', url: 'https://example.org/a' }, { title: 'B', url: 'http://example.org/b?x=1' }] }, 'see https://example.org/c.'] },
    })).toEqual(['https://example.org/a', 'http://example.org/b?x=1', 'https://example.org/c']);
    expect(urlsSeen({ hook_event_name: 'PostToolUse', tool_name: 'Read', tool_input: { file_path: 'a' }, tool_response: 'https://example.org/d' })).toEqual([]);
    expect(urlsSeen({ hook_event_name: 'PreToolUse', tool_name: 'WebFetch', tool_input: { url: 'https://example.org/e' } })).toEqual([]);
  });
});
