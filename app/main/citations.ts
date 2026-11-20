import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Citations } from '../shared/types';

/**
 * Where a research write-up's conclusions come from (road-to-1.3.md C7). The staff write summary.md with a number after
 * each point and sources.json with what each number is; at the end of the round the app checks the two against each
 * other and against the addresses the round actually searched or fetched. Nothing is changed in the files: the result
 * card says what does not add up.
 */

/** The heading of the sources section, in the languages the shop writes in. Points stop there. */
const SOURCES_HEADING = /出处|來源|来源|参考|參考|sources|references/i;
/** A point that says it has no source is not missing one. */
const SAID_NONE = /未找到出处|没找到出处|找不到出处|没有出处|no source found|unsourced|not sourced/i;
const LIST_ITEM = /^\s*(?:[-*+]|\d+[.)])\s+(.*\S)\s*$/;
const HEADING = /^\s{0,3}#{1,6}\s+(.*)$/;
const NUMBER = /\[(\d+)\]/g;

/** An address as it is compared: no scheme, no www., host in lower case, no fragment, no trailing slash. */
export function normalizeUrl(url: string): string {
  try {
    const u = new URL(url.trim());
    const host = u.hostname.toLowerCase().replace(/^www\./, '');
    return `${host}${u.port ? `:${u.port}` : ''}${u.pathname.replace(/\/+$/, '')}${u.search}`;
  } catch {
    return url.trim().toLowerCase();
  }
}

const siteOf = (url: string) => {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
};

type Source = { n: number; title: string; url: string };

/** sources.json read leniently: entries without a number, a title or an address are left out. Undefined when it is not that shape. */
function parseSources(text: string): { sources: Source[]; unsourced: string[] } | undefined {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return undefined;
  }
  const d = data as { sources?: unknown; unsourced?: unknown };
  if (!d || typeof d !== 'object' || !Array.isArray(d.sources)) return undefined;
  const sources = d.sources.filter((s): s is Source => Boolean(s) && typeof s === 'object'
    && Number.isInteger((s as Source).n) && typeof (s as Source).title === 'string' && typeof (s as Source).url === 'string');
  const unsourced = Array.isArray(d.unsourced) ? d.unsourced.filter((u): u is string => typeof u === 'string') : [];
  return { sources, unsourced };
}

/**
 * The check itself: which points have no number, which numbers sources.json lacks, which sources this round never
 * searched or fetched, and the conclusions the staff said they found no source for, word for word.
 */
export function checkCitations(summary: string, sourcesText: string | undefined, seen: Iterable<string>): Citations {
  const unnumbered: string[] = [];
  const cited = new Set<number>();
  for (const line of summary.split(/\r?\n/)) {
    const heading = HEADING.exec(line);
    if (heading && SOURCES_HEADING.test(heading[1])) break;
    for (const m of line.matchAll(NUMBER)) cited.add(Number(m[1]));
    const item = LIST_ITEM.exec(line);
    if (item && !NUMBER.test(item[1]) && !SAID_NONE.test(item[1])) unnumbered.push(item[1].trim());
    NUMBER.lastIndex = 0;
  }
  if (sourcesText === undefined) return { sources: [], unsourced: [], unnumbered, missing: [], broken: 'noSources' };
  const parsed = parseSources(sourcesText);
  if (!parsed) return { sources: [], unsourced: [], unnumbered, missing: [], broken: 'unreadable' };
  const opened = new Set([...seen].map(normalizeUrl));
  const known = new Set(parsed.sources.map((s) => s.n));
  return {
    sources: parsed.sources.map((s) => ({ n: s.n, title: s.title, url: s.url, site: siteOf(s.url), opened: opened.has(normalizeUrl(s.url)) })),
    unsourced: parsed.unsourced,
    unnumbered,
    missing: [...cited].filter((n) => !known.has(n)).sort((a, b) => a - b),
  };
}

/** The check on a commission folder's own files, by the names the shop gives them. */
export function citationsIn(workDir: string, names: { summary: string; sources: string }, seen: Iterable<string>): Citations {
  const read = (name: string) => (existsSync(join(workDir, name)) ? readFileSync(join(workDir, name), 'utf8') : undefined);
  return checkCitations(read(names.summary) ?? '', read(names.sources), seen);
}

/** The address of source n, only when it is a web address: anything else (a file, a script, another scheme) is never opened. */
export function sourceUrl(sourcesText: string, n: number): string | undefined {
  const s = parseSources(sourcesText)?.sources.find((x) => x.n === n);
  if (!s) return undefined;
  try {
    const u = new URL(s.url.trim());
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : undefined;
  } catch {
    return undefined;
  }
}

const WEB_ADDRESS = /https?:\/\/[^\s"'<>()[\]{}\\]+/g;

/** Every web address in a value, strings inside objects and lists included, without the punctuation that ends a sentence. */
function addressesIn(value: unknown, out: string[]): string[] {
  if (typeof value === 'string') {
    for (const m of value.match(WEB_ADDRESS) ?? []) out.push(m.replace(/[.,;:!?'"]+$/, ''));
  } else if (Array.isArray(value)) {
    for (const v of value) addressesIn(v, out);
  } else if (value && typeof value === 'object') {
    for (const v of Object.values(value)) addressesIn(v, out);
  }
  return out;
}

/**
 * The addresses one hook call shows the round saw: a fetch's own address, and every address in a search's results.
 * Only after the tool ran (PostToolUse): a fetch that was refused saw nothing.
 */
export function urlsSeen(input: unknown): string[] {
  const i = input as { hook_event_name?: string; tool_name?: string; tool_input?: { url?: unknown }; tool_response?: unknown };
  if (i?.hook_event_name !== 'PostToolUse') return [];
  if (i.tool_name === 'WebFetch') return typeof i.tool_input?.url === 'string' ? [i.tool_input.url] : [];
  if (i.tool_name === 'WebSearch') return [...new Set(addressesIn(i.tool_response, []))];
  return [];
}
