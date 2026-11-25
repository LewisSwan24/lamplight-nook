// The content count (plan-1.6.md F0). `npm run content` counts what the app has, from the code's tables and the files
// on disk, writes it to docs/content.md with what changed since the last count, and runs four checks that keep the
// content in step: every line in both languages, every picture on an art list, story chapters that agree with each other
// and with lines/stories.yaml, and a lines file for every shop. `npm run content -- --check` only compares, for the gate.
//
// count() and render() take everything they need as arguments, so tests/content.test.ts runs them on a small sample.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { EOL } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

/**
 * The code's tables, read from the app's own modules. Needs TypeScript imports: run under tsx (npm run content) or vitest.
 * @returns {Promise<Tables>}
 */
export async function loadTables() {
  const [{ TEMPLATES }, { ROOMS, SCENES }, { ALL_STAFF }, { GUESTS }, { CHAPTERS }, { GROWTH }, town, { HOLIDAYS }] = await Promise.all([
    import('../app/shared/templates.ts'),
    import('../app/shared/scenes.ts'),
    import('../app/shared/staff.ts'),
    import('../app/shared/types.ts'),
    import('../app/shared/stories.ts'),
    import('../app/shared/growth.ts'),
    import('../app/shared/towngrow.ts'),
    import('../app/renderer/game/weather.ts'),
  ]);
  return {
    templates: TEMPLATES.map((t) => ({ id: t.id, shop: t.shop })),
    scenes: [...SCENES],
    rooms: [...ROOMS],
    staff: [...ALL_STAFF],
    guests: [...GUESTS],
    tellers: CHAPTERS,
    growth: {
      shop: GROWTH.length,
      street: town.STREET_GROWTH.length,
      fronts: town.FRONT_GROWTH.length,
      rooms: Object.values(town.ROOM_GROWTH).reduce((n, pieces) => n + pieces.length, 0),
    },
    holidays: [...HOLIDAYS],
  };
}

/**
 * @typedef {{ templates: { id: string, shop?: string }[], scenes: string[], rooms: string[], staff: string[], guests: string[],
 *   tellers: Record<string, { works: number, left: string }[]>, growth: Record<string, number>, holidays: string[] }} Tables
 * @typedef {{ file: string, keys: number, zh: number, en: number }} LineCount
 * @typedef {{ totals: { label: string, value: number }[], lines: LineCount[], problems: string[], notes: string[] }} Count
 */

const read = (root, path) => (existsSync(join(root, path)) ? readFileSync(join(root, path), 'utf8') : null);
const yamlFiles = (dir) => (existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.yaml')).sort() : []);

/**
 * The keys of a lines file and how many bubbles it says. Three shapes: chats (a list, each with turns), stories (a map of
 * storytellers to chapters, each with lines) and the shops' lines (a map of moments to lines, each with bubbles). The
 * same id can come twice, once for a scene (shared/scenes.ts forScene), so a key carries its scene.
 */
function tally(text) {
  const doc = parse(text) ?? {};
  const keys = [];
  let said = 0;
  if (Array.isArray(doc)) {
    for (const chat of doc) {
      keys.push(String(chat.id));
      said += chat.turns?.length ?? 0;
    }
    return { keys, said };
  }
  for (const [group, items] of Object.entries(doc)) {
    for (const [i, item] of (Array.isArray(items) ? items : []).entries()) {
      if (item.id !== undefined) {
        keys.push(item.scene ? `${item.id} (${item.scene})` : String(item.id));
        said += item.bubbles?.length ?? 0;
      } else {
        keys.push(`${group} 第 ${i + 1} 章`);
        said += item.lines?.length ?? 0;
      }
    }
  }
  return { keys, said };
}

/** Every file named on an art list: the tables in docs/art-*.md, and the pictures that were there before 1.4. */
function artList(root) {
  const listed = new Set();
  const docs = join(root, 'docs');
  for (const f of existsSync(docs) ? readdirSync(docs).filter((d) => /^art-.+\.md$/.test(d)) : []) {
    for (const m of readFileSync(join(docs, f), 'utf8').matchAll(/^\| `([^`]+)` \|/gm)) listed.add(m[1]);
  }
  for (const f of (read(root, 'tests/fixtures/sprites-1.3.txt') ?? '').split(/\r?\n/)) if (f) listed.add(f);
  return listed;
}

/** The chapters of each storyteller in a stories file. */
function chaptersIn(text) {
  const doc = text ? parse(text) ?? {} : {};
  return Object.fromEntries(Object.entries(doc).map(([who, chapters]) => [who, Array.isArray(chapters) ? chapters : []]));
}

/** @returns {{ problems: string[], notes: string[] }} */
function checkStories(root, tellers) {
  const problems = [];
  const notes = [];
  const lefts = new Map();
  for (const [who, chapters] of Object.entries(tellers)) {
    chapters.forEach((c, i) => {
      if (i > 0 && c.works <= chapters[i - 1].works) problems.push(`${who} 第 ${i + 1} 章要 ${c.works} 单，不比上一章多`);
      const other = lefts.get(c.left);
      if (other) problems.push(`${who} 第 ${i + 1} 章和 ${other} 都留下 ${c.left}`);
      else lefts.set(c.left, `${who} 第 ${i + 1} 章`);
    });
  }
  const byWorks = new Map();
  for (const [who, chapters] of Object.entries(tellers)) {
    chapters.forEach((c, i) => byWorks.set(c.works, [...(byWorks.get(c.works) ?? []), `${who} 第 ${i + 1} 章`]));
  }
  for (const [works, who] of byWorks) if (who.length > 1) notes.push(`${who.join('、')}都在第 ${works} 单解锁，可能同一天来`);
  for (const file of ['lines/stories.yaml', 'lines/en/stories.yaml']) {
    const told = chaptersIn(read(root, file));
    for (const [who, chapters] of Object.entries(tellers)) {
      const written = told[who] ?? [];
      if (written.length !== chapters.length) problems.push(`${who} 的故事在代码里 ${chapters.length} 章，${file} 里 ${written.length} 章`);
      chapters.forEach((c, i) => {
        if (written[i] && written[i].left !== c.left) problems.push(`${who} 第 ${i + 1} 章在代码里留下 ${c.left}，${file} 里是 ${written[i].left}`);
      });
    }
    for (const who of Object.keys(told)) if (!tellers[who]) problems.push(`${file} 里有 ${who} 的故事，代码里没有这个讲故事的人`);
  }
  return { problems, notes };
}

/**
 * Count the content under `root` against the code's tables.
 * @param {string} root
 * @param {Tables} t
 * @returns {Count}
 */
export function count(root, t) {
  const problems = [];

  // Lines, file by file: the Chinese files are the list; each has its English one.
  const lines = [];
  for (const file of yamlFiles(join(root, 'lines'))) {
    const zh = tally(read(root, `lines/${file}`));
    const enText = read(root, `lines/en/${file}`);
    const en = enText === null ? { keys: [], said: 0 } : tally(enText);
    if (enText === null) problems.push(`lines/en/${file} 不存在`);
    const enKeys = new Set(en.keys);
    const zhKeys = new Set(zh.keys);
    for (const k of zhKeys) if (enText !== null && !enKeys.has(k)) problems.push(`lines/en/${file} 缺 ${k}`);
    for (const k of enKeys) if (!zhKeys.has(k)) problems.push(`lines/${file} 缺 ${k}`);
    lines.push({ file, keys: zhKeys.size, zh: zh.said, en: en.said });
  }
  for (const file of yamlFiles(join(root, 'lines', 'en'))) {
    if (!lines.some((l) => l.file === file)) problems.push(`lines/${file} 不存在，只有英文的`);
  }

  // Pictures: everything in assets/sprites is on an art list; the pictures are the PNGs.
  const spriteDir = join(root, 'assets', 'sprites');
  const sprites = existsSync(spriteDir) ? readdirSync(spriteDir).sort() : [];
  const listed = artList(root);
  for (const f of sprites) if (!listed.has(f)) problems.push(`assets/sprites/${f} 不在美术清单里`);

  const stories = checkStories(root, t.tellers);
  problems.push(...stories.problems);

  // Each shop along the street speaks its own lines over the home shop's (renderer/stage/rulebook.ts).
  for (const room of t.rooms.filter((r) => !t.scenes.includes(r))) {
    for (const file of [`lines/${room}.yaml`, `lines/en/${room}.yaml`]) if (read(root, file) === null) problems.push(`${room} 没有 ${file}`);
  }

  const totals = [
    ['委托种类', t.templates.length],
    ['能进的店', t.rooms.filter((r) => !t.scenes.includes(r)).length + 1],
    ['店员', t.staff.length],
    ['客人', t.guests.length],
    ['讲故事的人', Object.keys(t.tellers).length],
    ['故事章数', Object.values(t.tellers).reduce((n, c) => n + c.length, 0)],
    ['长出来的东西', Object.values(t.growth).reduce((n, g) => n + g, 0)],
    ['节日', t.holidays.length],
    ['图', sprites.filter((f) => f.endsWith('.png')).length],
    ['台词（条）', lines.reduce((n, l) => n + l.keys, 0)],
    ['台词（中文句）', lines.reduce((n, l) => n + l.zh, 0)],
    ['台词（英文句）', lines.reduce((n, l) => n + l.en, 0)],
  ].map(([label, value]) => ({ label, value }));

  return { totals, lines, problems, notes: stories.notes };
}

/** The rows of a docs/content.md: totals by label, lines by file, each with what it said had changed. */
function rowsOf(doc) {
  const totals = new Map();
  const lines = new Map();
  for (const l of (doc ?? '').split(/\r?\n/)) {
    let m = /^\| `([^`]+)` \| (\d+) \| (\d+) \| (\d+) \| (.*?) ?\|$/.exec(l);
    if (m) {
      lines.set(m[1], { keys: +m[2], zh: +m[3], en: +m[4], change: m[5].trim() });
      continue;
    }
    m = /^\| ([^|`]+?) \| (\d+) \| (.*?) ?\|$/.exec(l);
    if (m) totals.set(m[1], { value: +m[2], change: m[3].trim() });
  }
  return { totals, lines };
}

/** Whether a docs/content.md says the same numbers as this count: the gate's check. */
export function sameCounts(c, doc) {
  const rows = rowsOf(doc);
  if (rows.totals.size !== c.totals.length || rows.lines.size !== c.lines.length) return false;
  return (
    c.totals.every((t) => rows.totals.get(t.label)?.value === t.value) &&
    c.lines.every((l) => {
      const r = rows.lines.get(l.file);
      return r && r.keys === l.keys && r.zh === l.zh && r.en === l.en;
    })
  );
}

const signed = (n) => (n > 0 ? `+${n}` : `${n}`);

/**
 * docs/content.md for this count. What changed is against the last count that came out different, so counting again with
 * nothing changed writes the same file.
 * @param {Count} c
 * @param {string} previous the file as it is, or '' for the first count
 */
export function render(c, previous) {
  const before = rowsOf(previous);
  const unchanged = previous !== '' && sameCounts(c, previous);
  const totalChange = (t) => {
    if (unchanged) return before.totals.get(t.label)?.change ?? '';
    if (!previous) return '';
    const was = before.totals.get(t.label);
    return !was ? '新' : was.value === t.value ? '' : signed(t.value - was.value);
  };
  const lineChange = (l) => {
    if (unchanged) return before.lines.get(l.file)?.change ?? '';
    if (!previous) return '';
    const was = before.lines.get(l.file);
    if (!was) return '新';
    return [['条', l.keys - was.keys], ['中文', l.zh - was.zh], ['英文', l.en - was.en]]
      .filter(([, d]) => d !== 0)
      .map(([what, d]) => `${what} ${signed(d)}`)
      .join('，');
  };
  const out = [
    '# 内容清点',
    '',
    '`npm run content` 数出来写的，别手改（plan-1.6.md F0）。数的是代码里的表和磁盘上的文件。“比上次”是和上一次数出不同结果时比，再数一遍没有变化，文件不动。',
    '',
    '图只在素材齐全的电脑上数得准：从素材包拼出来的图不进 git，要先照 `docs/art.md` 拼好。',
    '',
    '## 总数',
    '',
    '| 项 | 数 | 比上次 |',
    '|---|---|---|',
    ...c.totals.map((t) => `| ${t.label} | ${t.value} | ${totalChange(t)} |`),
    '',
    '## 台词',
    '',
    '一条是一段台词、一段闲聊或一章故事，一句是说出来的一个气泡。条数按中文的数，英文的条要和中文的一样。',
    '',
    '| 文件 | 条 | 中文句 | 英文句 | 比上次 |',
    '|---|---|---|---|---|',
    ...c.lines.map((l) => `| \`${l.file}\` | ${l.keys} | ${l.zh} | ${l.en} | ${lineChange(l)} |`),
    '',
    '## 问题',
    '',
    '查四样。中英文的台词一条不缺，每张图都在美术清单里。故事的解锁条件不打架，每间店都有自己的台词文件。',
    '',
    ...(c.problems.length ? c.problems.map((p) => `- ${p}`) : ['没有。']),
    '',
  ];
  if (c.notes.length) out.push('## 提醒', '', '不算问题，值得留意。', '', ...c.notes.map((n) => `- ${n}`), '');
  return out.join('\n');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const c = count(root, await loadTables());
  const path = join(root, 'docs', 'content.md');
  const previous = existsSync(path) ? readFileSync(path, 'utf8') : '';
  for (const t of c.totals) console.log(`${t.label}: ${t.value}`);
  for (const p of c.problems) console.log(`问题：${p}`);
  if (process.argv.includes('--check')) {
    const same = sameCounts(c, previous);
    if (!same) console.log('docs/content.md 和数出来的不一样：跑一次 npm run content。');
    process.exit(same && !c.problems.length ? 0 : 1);
  }
  const next = render(c, previous.replace(/\r\n/g, '\n'));
  if (next !== previous.replace(/\r\n/g, '\n')) writeFileSync(path, next.replace(/\n/g, EOL));
  process.exit(c.problems.length ? 1 : 0);
}
